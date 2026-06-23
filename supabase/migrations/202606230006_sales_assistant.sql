alter table public.messages
add column if not exists is_automated boolean not null default false;

create table if not exists public.seller_assistant_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  fallback_message text not null default 'Gracias por tu consulta. El vendedor te respondera dentro de Velox.',
  updated_at timestamptz not null default now()
);

alter table public.seller_assistant_settings enable row level security;

create policy "assistant_settings_owner_select"
on public.seller_assistant_settings for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "assistant_settings_owner_insert"
on public.seller_assistant_settings for insert to authenticated
with check (user_id = auth.uid());

create policy "assistant_settings_owner_update"
on public.seller_assistant_settings for update to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

grant select, insert, update on public.seller_assistant_settings to authenticated;

create or replace function public.send_message_with_assistant(
  target_conversation uuid,
  message_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.conversations%rowtype;
  vehicle_record public.vehicles%rowtype;
  assistant_enabled boolean;
  normalized text;
  answer text;
  recognized boolean := true;
  sent_message public.messages%rowtype;
  automated_message public.messages%rowtype;
begin
  if auth.uid() is null or nullif(trim(message_body), '') is null then
    raise exception 'Mensaje invalido';
  end if;

  select * into target
  from public.conversations
  where id = target_conversation
    and (buyer_id = auth.uid() or seller_id = auth.uid());

  if target.id is null then raise exception 'Conversacion no encontrada'; end if;
  if target.is_blocked then raise exception 'La conversacion esta bloqueada'; end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (target.id, auth.uid(), trim(message_body))
  returning * into sent_message;

  if auth.uid() <> target.buyer_id then
    return jsonb_build_object('message_id', sent_message.id, 'automated', false);
  end if;

  select * into vehicle_record from public.vehicles where id = target.vehicle_id;
  select coalesce(s.enabled, true) into assistant_enabled
  from (select 1) seed
  left join public.seller_assistant_settings s on s.user_id = target.seller_id;

  if not assistant_enabled then
    return jsonb_build_object('message_id', sent_message.id, 'automated', false);
  end if;

  normalized := lower(trim(message_body));

  if normalized like '%disponib%' then
    answer := 'Si, el vehiculo sigue publicado como disponible en Velox.';
  elsif normalized like '%permuta%' then
    answer := case when vehicle_record.accepts_trade
      then 'Si, el vendedor indico que acepta evaluar permutas.'
      else 'El vendedor indico que no acepta permutas por el momento.' end;
  elsif normalized like '%financ%' or normalized like '%cuota%' then
    answer := case when vehicle_record.accepts_financing
      then 'Si, la publicacion indica que puede conversar opciones de financiacion.'
      else 'La publicacion no ofrece financiacion actualmente.' end;
  elsif normalized like '%donde%' or normalized like '%ubic%' or normalized like '%zona%' then
    answer := 'El vehiculo esta en ' || vehicle_record.zone || '. ' ||
      coalesce('Se puede ver en ' || vehicle_record.view_location || '.', 'El punto exacto se coordina por este chat.');
  elsif normalized like '%horario%' or normalized like '%cuando%' or normalized like '%visita%' then
    answer := coalesce(
      'Los horarios informados por el vendedor son: ' || vehicle_record.available_hours || '.',
      'El vendedor todavia no definio horarios. Podes proponer uno por este chat.'
    );
  elsif normalized like '%kilometr%' or normalized like '% km%' then
    answer := 'La publicacion declara ' || trim(to_char(vehicle_record.kilometers, 'FM999G999G999')) || ' km.';
  elsif normalized like '%precio%' or normalized like '%vale%' then
    answer := 'El precio publicado es $' || trim(to_char(vehicle_record.price, 'FM999G999G999G999')) || '.';
  elsif normalized like '%estado%' or normalized like '%detalle%' or normalized like '%mecan%' then
    answer := coalesce(vehicle_record.description, 'El propietario completo una autorevision declarada en la publicacion.');
  else
    recognized := false;
  end if;

  if recognized then
    insert into public.messages (conversation_id, sender_id, body, is_automated)
    values (target.id, target.seller_id, answer, true)
    returning * into automated_message;
  end if;

  return jsonb_build_object(
    'message_id', sent_message.id,
    'automated', recognized,
    'automated_message_id', automated_message.id
  );
end;
$$;

revoke all on function public.send_message_with_assistant(uuid, text) from public;
grant execute on function public.send_message_with_assistant(uuid, text) to authenticated;


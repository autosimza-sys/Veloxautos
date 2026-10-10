-- Forward-only, new-client message API. Keep velox_private out of PostgREST's
-- exposed schemas. Validate real multi-session contention in staging first.
-- COORDINATED CUTOVER GATE: deploy UUID-preserving clients, then revoke legacy
-- send_message_with_assistant EXECUTE and direct messages INSERT (including
-- column grants) before claiming idempotency across ALL client send paths.
-- This migration preserves those existing paths for compatibility and never
-- regrants them when replayed after their coordinated revocation.
begin;

create table if not exists velox_private.message_requests (
  author_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  -- Deliberately no conversation/message FK: trusted deletion must not free a
  -- consumed UUID for a different intent. Authorization still gates every retry.
  conversation_id uuid not null,
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  primary key (author_id, request_id)
);
alter table velox_private.message_requests enable row level security;
revoke all on velox_private.message_requests from public, anon, authenticated;
-- No client policies, including for the original author or administrators.

create or replace function public.send_message_idempotent(
  target_conversation uuid,
  message_body text,
  message_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  normalized_body text := pg_catalog.normalize(btrim(message_body), 'NFC');
  fingerprint bytea;
  prior velox_private.message_requests%rowtype;
  sent_result jsonb;
begin
  if caller is null then
    raise exception 'Debes iniciar sesion' using errcode = '42501';
  end if;
  if message_request_id is null or target_conversation is null then
    raise exception 'Falta el identificador del mensaje o de la conversacion' using errcode = '23514';
  end if;
  if nullif(normalized_body, '') is null then
    raise exception 'Mensaje invalido' using errcode = '23514';
  end if;

  -- Namespaced by author as well as UUID. A hash collision only serializes
  -- unrelated requests; identity and payload are compared using the full key.
  -- The transaction lock spans both message inserts and the complete result.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller::text || ':' || message_request_id::text, 0)
  );

  -- Same row lock/order as the legacy sender. Recheck current authorization
  -- AFTER acquiring locks and BEFORE reading a stored result. Admin status is
  -- not participation, and revoked/blocked users cannot recover private IDs.
  perform 1 from public.conversations c
  where c.id = target_conversation and (c.buyer_id = caller or c.seller_id = caller)
  for update;
  if not found or not velox_private.can_send_message(target_conversation) then
    raise exception 'La cuenta o conversacion no tiene permiso para enviar mensajes' using errcode = '42501';
  end if;

  -- JSON encoding makes the tuple unambiguous. Trim only the spaces removed by
  -- the legacy sender and normalize canonical Unicode encodings to NFC. Case,
  -- accents and interior whitespace remain significant.
  fingerprint := pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(target_conversation, normalized_body)::text, 'UTF8'
  ));
  select * into prior from velox_private.message_requests r
  where r.author_id = caller and r.request_id = message_request_id;
  if found then
    if prior.conversation_id is distinct from target_conversation
      or prior.request_fingerprint is distinct from fingerprint then
      raise exception 'Este intento de mensaje ya se uso con otros datos' using errcode = '23514';
    end if;
    return prior.result;
  end if;

  -- The nested definer retains its own send guard. Any message, assistant, or
  -- ledger failure aborts this whole statement: no partial send or consumed ID.
  sent_result := public.send_message_with_assistant(target_conversation, normalized_body);
  insert into velox_private.message_requests
    (author_id, request_id, conversation_id, request_fingerprint, result)
  values (caller, message_request_id, target_conversation, fingerprint, sent_result);
  return sent_result;
end;
$$;
revoke all on function public.send_message_idempotent(uuid, text, uuid) from public, anon;
grant execute on function public.send_message_idempotent(uuid, text, uuid) to authenticated;

-- Preserve the original send guard, row lock and reply contract, with accent-
-- insensitive Spanish intent matching. CREATE OR REPLACE retains existing ACLs,
-- including an already-revoked legacy EXECUTE grant after client cutover.
create or replace function public.send_message_with_assistant(target_conversation uuid, message_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.conversations%rowtype;
  vehicle_record public.vehicles%rowtype;
  assistant_enabled boolean;
  normalized text;
  answer text;
  recognized boolean := true;
  sent_message public.messages%rowtype;
  automated_message public.messages%rowtype;
  next_message_at timestamptz;
begin
  if nullif(trim(message_body), '') is null then raise exception 'Mensaje invalido'; end if;
  select * into target from public.conversations
  where id = target_conversation and (buyer_id = auth.uid() or seller_id = auth.uid())
  for update;
  if not velox_private.can_send_message(target_conversation) then
    raise exception 'La cuenta o conversacion no tiene permiso para enviar mensajes' using errcode = '42501';
  end if;
  -- The conversation row is locked. Keep its ordering monotonic even when more
  -- than one send is executed in a transaction (now() would be identical).
  select greatest(clock_timestamp(),coalesce(max(created_at)+interval '1 microsecond',clock_timestamp()))
    into next_message_at from public.messages where conversation_id=target.id;
  insert into public.messages(conversation_id, sender_id, body, created_at)
  values (target.id, auth.uid(), trim(message_body), next_message_at) returning * into sent_message;
  if auth.uid() <> target.buyer_id then
    return jsonb_build_object('message_id', sent_message.id, 'automated', false);
  end if;
  select * into vehicle_record from public.vehicles where id = target.vehicle_id;
  select coalesce(s.enabled, true) into assistant_enabled
  from (select 1) seed left join public.seller_assistant_settings s on s.user_id = target.seller_id;
  if not assistant_enabled then
    return jsonb_build_object('message_id', sent_message.id, 'automated', false);
  end if;
  normalized := translate(pg_catalog.normalize(lower(btrim(message_body)), 'NFC'), 'áéíóúü', 'aeiouu');
  if normalized like '%disponib%' then
    answer := case when vehicle_record.status = 'active'
      then 'La publicacion esta activa en Velox. El vendedor debe confirmar la disponibilidad actual.'
      else 'La publicacion no esta activa. Consulta al vendedor para confirmar su disponibilidad.' end;
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
    answer := coalesce('Los horarios informados por el vendedor son: ' || vehicle_record.available_hours || '.',
      'El vendedor todavia no definio horarios. Podes proponer uno por este chat.');
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
    insert into public.messages(conversation_id, sender_id, body, is_automated, created_at)
    values (target.id, target.seller_id, answer, true, next_message_at + interval '1 microsecond') returning * into automated_message;
  end if;
  return jsonb_build_object('message_id', sent_message.id, 'automated', recognized,
    'automated_message_id', automated_message.id);
end;
$$;
commit;

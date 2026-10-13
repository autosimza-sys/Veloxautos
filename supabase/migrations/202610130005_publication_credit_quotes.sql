-- A quote is price authorization metadata, not part of the vehicle intent.
-- New sends during a started campaign require a current quote. Historic retries
-- are authorized and recovered before quote checks, without a new debit/refill.
-- Publish the quote-aware client before starting a campaign. Existing default
-- clients remain compatible while revision=0; applying this does not start it.
begin;

create or replace function public.get_publication_quote()
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.launch_promotion%rowtype; seller public.profiles%rowtype; cost integer;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesion' using errcode='42501'; end if;
  select * into p from public.launch_promotion where singleton for share;
  select * into seller from public.profiles where id=auth.uid();
  if seller.id is null or seller.is_blocked or seller.role not in ('particular','reseller','agency') then
    raise exception 'Tu cuenta no tiene permiso para publicar' using errcode='42501';
  end if;
  cost := case when p.revision>0 then coalesce((p.publication_costs->>seller.role::text)::integer,p.publication_cost) else 1 end;
  return jsonb_build_object('policy_revision',p.policy_revision,'campaign_revision',p.revision,'cost',cost,'role',seller.role::text);
end;
$$;
revoke all on function public.get_publication_quote() from public,anon;
grant execute on function public.get_publication_quote() to authenticated;

create or replace function public.publish_vehicle_with_credit(
  payload jsonb,
  media_payload jsonb,
  publication_request_id uuid
)
returns public.vehicles
language plpgsql security definer set search_path = '' as $$
declare
  caller public.profiles%rowtype;
  promotion public.launch_promotion%rowtype;
  publication_quote jsonb := payload->'publication_quote';
  expected_quote jsonb;
  prior public.publication_requests%rowtype;
  created_vehicle public.vehicles%rowtype;
  item jsonb;
  field text;
  field_number numeric;
  photo_count integer;
  video_count integer;
  stored_metadata jsonb;
  object_mime text;
  object_size numeric;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesion' using errcode = '42501'; end if;
  if publication_request_id is null then raise exception 'Falta el identificador de la publicacion'; end if;

  -- Match administration's campaign-first order before locking the seller.
  -- Keep the lock even on a replay; only NEW sends enter the credit function.
  select * into promotion from public.launch_promotion where singleton for share;
  payload := payload - 'publication_quote';
  select * into caller from public.profiles where id = auth.uid() for update;
  if caller.id is null or caller.is_blocked or caller.role not in ('particular','reseller','agency') then
    raise exception 'Tu cuenta no tiene permiso para publicar' using errcode = '42501';
  end if;

  select * into prior from public.publication_requests r
  where r.user_id = auth.uid() and r.request_id = publication_request_id;
  if found then
    if prior.request_payload is distinct from payload or prior.request_media is distinct from media_payload then
      raise exception 'Este intento de publicacion ya se uso con otros datos';
    end if;
    select * into created_vehicle from public.vehicles where id = prior.vehicle_id and owner_id = auth.uid();
    if not found then
      raise exception 'La publicacion de este intento ya fue eliminada. No se desconto otro credito';
    end if;
    return created_vehicle;
  end if;

  -- A stale UI must not pay a different tariff when start, extension, a draft
  -- policy change or a role change races its confirmation. Strip metadata from
  -- the idempotency payload so recovering the old result never reprices it.
  expected_quote := jsonb_build_object('policy_revision',promotion.policy_revision,
    'campaign_revision',promotion.revision,'role',caller.role::text,'cost',
    case when promotion.revision>0 then coalesce((promotion.publication_costs->>caller.role::text)::integer,promotion.publication_cost) else 1 end);
  if (publication_quote is not null or promotion.revision>0) and publication_quote is distinct from expected_quote then
    raise exception 'La tarifa o las condiciones cambiaron. Actualiza los creditos y confirma nuevamente antes de publicar.' using errcode='23514';
  end if;

  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Datos de publicacion invalidos'; end if;
  foreach field in array array['brand', 'model', 'version', 'zone'] loop
    if jsonb_typeof(payload->field) is distinct from 'string' or nullif(trim(payload->>field), '') is null then
      raise exception 'Completa el campo %', field;
    end if;
  end loop;
  foreach field in array array['year', 'kilometers', 'price'] loop
    if coalesce(trim(payload->>field), '') !~ '^[0-9]+$' then
      raise exception 'El campo % debe ser un numero entero', field;
    end if;
    field_number := trim(payload->>field)::numeric;
    if field_number > 2147483647
      or (field = 'year' and (field_number < 1886 or field_number > extract(year from current_date) + 1))
      or (field = 'price' and field_number < 1) then
      raise exception 'El campo % esta fuera de rango', field;
    end if;
  end loop;
  if payload ? 'checklist' and jsonb_typeof(payload->'checklist') is distinct from 'object' then
    raise exception 'La autorevision debe ser un objeto';
  end if;
  foreach field in array array['accepts_trade', 'accepts_financing'] loop
    if payload ? field and jsonb_typeof(payload->field) is distinct from 'boolean' then
      raise exception 'El campo % debe ser verdadero o falso', field;
    end if;
  end loop;

  if jsonb_typeof(media_payload) is distinct from 'array' then raise exception 'Medios de publicacion invalidos'; end if;
  if jsonb_array_length(media_payload) not between 4 and 9 then
    raise exception 'La publicacion necesita entre 4 y 8 fotos y como maximo 1 video';
  end if;
  select count(*) filter (where m->>'media_type' = 'photo'), count(*) filter (where m->>'media_type' = 'video')
  into photo_count, video_count from jsonb_array_elements(media_payload) as m;
  if photo_count not between 4 and 8 or video_count > 1 or photo_count + video_count <> jsonb_array_length(media_payload) then
    raise exception 'La publicacion necesita entre 4 y 8 fotos y como maximo 1 video';
  end if;
  if exists (select 1 from jsonb_array_elements(media_payload) as m group by m->>'storage_path' having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(media_payload) as m group by m->>'sort_order' having count(*) > 1) then
    raise exception 'Las fotos, videos y posiciones no pueden repetirse';
  end if;

  for item in select * from jsonb_array_elements(media_payload) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'storage_path') is distinct from 'string'
      or split_part(item->>'storage_path', '/', 1) is distinct from auth.uid()::text
      or coalesce(item->>'sort_order', '') !~ '^[0-8]$' then
      raise exception 'Ruta o posicion de archivo invalida' using errcode = '42501';
    end if;

    -- Storage files are uploaded before this transaction. Share locks prevent
    -- their object records being removed while media links are being committed.
    select o.metadata into stored_metadata from storage.objects o
    where o.bucket_id = 'vehicle-media' and o.name = item->>'storage_path' for share;
    if not found then raise exception 'Falta un archivo subido de la publicacion'; end if;
    object_mime := lower(coalesce(stored_metadata->>'mimetype', ''));
    if coalesce(stored_metadata->>'size', '') !~ '^[0-9]+$' then
      raise exception 'No se pudo validar el tamano de un archivo';
    end if;
    object_size := (stored_metadata->>'size')::numeric;
    if object_size <= 0
      or (item->>'media_type' = 'photo' and (object_mime not in ('image/jpeg','image/png','image/webp') or object_size > 3 * 1024 * 1024))
      or (item->>'media_type' = 'video' and (object_mime not in ('video/mp4','video/webm','video/quicktime') or object_size > 25 * 1024 * 1024)) then
      raise exception 'Formato o tamano de archivo no permitido';
    end if;
  end loop;

  -- No exception is swallowed: a failing media insert rolls back the vehicle,
  -- debit, ledger entry and idempotency record as one database statement.
  select * into created_vehicle from public.create_vehicle_with_credit(payload);
  insert into public.vehicle_media(vehicle_id, media_type, storage_path, sort_order)
  select created_vehicle.id, m->>'media_type', m->>'storage_path', (m->>'sort_order')::integer
  from jsonb_array_elements(media_payload) as m;
  insert into public.publication_requests(user_id, request_id, request_payload, request_media, vehicle_id)
  values (auth.uid(), publication_request_id, payload, media_payload, created_vehicle.id);
  return created_vehicle;
end;
$$;

commit;

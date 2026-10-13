-- Draft policy only: defaults preserve one-credit publication and no refill.
-- Does not activate the common campaign, set commercial amounts or edit balances.
-- Policy is configured before launch and frozen at start, including extensions.
-- Lock order for NEW publications: campaign -> profile -> balance. Administration
-- locks campaign -> balances; signup locks campaign before reading grant settings.
-- Forward rollback requires a new migration restoring compatible functions;
-- retain granted/used and ledger history, including already granted promo_refill.
begin;

alter table public.launch_promotion
  add column if not exists publication_cost integer not null default 1 check (publication_cost between 1 and 1000000),
  add column if not exists auto_refill boolean not null default false,
  add column if not exists policy_revision integer not null default 0 check (policy_revision >= 0);

alter table public.credit_ledger drop constraint if exists credit_ledger_kind_check;
alter table public.credit_ledger add constraint credit_ledger_kind_check
  check (kind in ('initial_grant', 'purchase', 'publication', 'admin_adjustment', 'expiration', 'promo_refill'));

create table if not exists velox_private.launch_credit_policy_events (
  policy_revision integer primary key,
  actor uuid not null,
  previous_policy jsonb not null,
  new_policy jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table velox_private.launch_credit_policy_events enable row level security;
revoke all on velox_private.launch_credit_policy_events from public, anon, authenticated;

create or replace function public.configure_launch_credit_policy(
  expected_policy_revision integer,
  publication_credit_cost integer,
  refill_enabled boolean
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.launch_promotion%rowtype; previous_policy jsonb; next_policy jsonb;
begin
  if not coalesce(public.is_admin(),false) then
    raise exception 'Solo administracion activa' using errcode='42501';
  end if;
  select * into p from public.launch_promotion where singleton for update;
  if not coalesce(public.is_admin(),false) then
    raise exception 'Solo administracion activa' using errcode='42501';
  end if;
  if expected_policy_revision is distinct from p.policy_revision then
    raise exception 'La politica de creditos cambio. Actualiza antes de continuar.' using errcode='23514';
  end if;
  if p.revision <> 0 then
    raise exception 'La politica de creditos queda fija al iniciar la promocion.' using errcode='23514';
  end if;
  if publication_credit_cost is null or publication_credit_cost not between 1 and 1000000
    or refill_enabled is null then
    raise exception 'El costo debe ser un entero entre 1 y 1000000 y la recarga debe estar definida.' using errcode='23514';
  end if;
  previous_policy := jsonb_build_object('publication_cost',p.publication_cost,'auto_refill',p.auto_refill,'policy_revision',p.policy_revision);
  next_policy := jsonb_build_object('publication_cost',publication_credit_cost,'auto_refill',refill_enabled,'policy_revision',p.policy_revision+1);
  update public.launch_promotion set publication_cost=publication_credit_cost,
    auto_refill=refill_enabled,policy_revision=p.policy_revision+1 where singleton;
  insert into velox_private.launch_credit_policy_events(policy_revision,actor,previous_policy,new_policy)
    values(p.policy_revision+1,auth.uid(),previous_policy,next_policy);
  return (select to_jsonb(x) from public.launch_promotion x where singleton);
end;
$$;
revoke all on function public.configure_launch_credit_policy(integer,integer,boolean) from public,anon;
grant execute on function public.configure_launch_credit_policy(integer,integer,boolean) to authenticated;

-- Keep the public signature and revision counter used by existing clients.
create or replace function public.manage_launch_promotion(action text, expected_revision integer, launch_at timestamptz, credit_quotas jsonb)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare p public.launch_promotion%rowtype; role_name text; new_end timestamptz; action_at timestamptz;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Solo administracion activa' using errcode='42501'; end if;
  select * into p from public.launch_promotion where singleton for update;
  if not coalesce(public.is_admin(),false) then raise exception 'Solo administracion activa' using errcode='42501'; end if;
  action_at := clock_timestamp();
  if expected_revision is distinct from p.revision then
    raise exception 'La promocion cambio. Actualiza antes de continuar.' using errcode='23514';
  end if;
  if action='start' then
    if p.revision<>0 or launch_at is null or launch_at < action_at-interval '5 minutes' then
      raise exception 'Inicio de promocion invalido' using errcode='23514';
    end if;
    if jsonb_typeof(credit_quotas) is distinct from 'object' then raise exception 'Faltan cupos' using errcode='23514'; end if;
    foreach role_name in array array['particular','reseller','agency'] loop
      if jsonb_typeof(credit_quotas->role_name) is distinct from 'number'
        or (credit_quotas->>role_name)::numeric < 1 or (credit_quotas->>role_name)::numeric > 1000000
        or trunc((credit_quotas->>role_name)::numeric) <> (credit_quotas->>role_name)::numeric then
        raise exception 'Cupo invalido' using errcode='23514';
      end if;
      if p.auto_refill and (credit_quotas->>role_name)::integer < p.publication_cost then
        raise exception 'Cada cupo de recarga debe alcanzar para una publicacion.' using errcode='23514';
      end if;
    end loop;
    new_end := launch_at + interval '2160 hours';
    update public.launch_promotion set starts_at=launch_at,ends_at=new_end,quotas=credit_quotas,revision=1 where singleton;
    update public.credit_settings set initial_credits=(credit_quotas->>role::text)::integer
      where role in ('particular','reseller','agency');
    insert into public.credit_ledger(user_id,amount,kind,note)
      select b.user_id,greatest(0,b.used+(credit_quotas->>u.role::text)::integer-b.granted),'admin_adjustment','Inicio promocion global'
      from public.credit_balances b join public.profiles u on u.id=b.user_id
      where u.role in ('particular','reseller','agency') and b.used+(credit_quotas->>u.role::text)::integer>b.granted;
    update public.credit_balances b set granted=greatest(b.granted,b.used+(credit_quotas->>u.role::text)::integer),
      expires_at=new_end,updated_at=action_at from public.profiles u
      where u.id=b.user_id and u.role in ('particular','reseller','agency');
  elsif action='extend' and p.revision>0 then
    new_end := greatest(p.ends_at,action_at) + interval '3 months';
    update public.launch_promotion set ends_at=new_end,revision=revision+1 where singleton;
    update public.credit_balances b set expires_at=new_end,updated_at=action_at from public.profiles u
      where u.id=b.user_id and u.role in ('particular','reseller','agency');
  else
    raise exception 'Accion de promocion invalida. No hay cobro automatico.' using errcode='23514';
  end if;
  insert into velox_private.launch_promotion_events(revision,actor,action,previous_end,new_end)
    values(p.revision+1,auth.uid(),action,p.ends_at,new_end);
  return (select to_jsonb(x) from public.launch_promotion x where singleton);
end;
$$;
revoke all on function public.manage_launch_promotion(text,integer,timestamptz,jsonb) from public,anon;
grant execute on function public.manage_launch_promotion(text,integer,timestamptz,jsonb) to authenticated;

-- Read settings only after locking the campaign: a signup overlapping start
-- must not combine an old initial amount with the new campaign deadline.
create or replace function public.grant_initial_publication_credits()
returns trigger language plpgsql security definer set search_path='' as $$
declare p public.launch_promotion%rowtype; setting_record public.credit_settings%rowtype;
  grant_amount integer; expiry timestamptz;
begin
  select * into p from public.launch_promotion where singleton for share;
  select * into setting_record from public.credit_settings where role=new.role;
  if setting_record.role is null then return new; end if;
  grant_amount := setting_record.initial_credits;
  expiry := clock_timestamp() + make_interval(days=>setting_record.validity_days);
  if p.revision>0 and new.role in ('particular','reseller','agency') then
    grant_amount := (p.quotas->>new.role::text)::integer;
    expiry := p.ends_at;
  end if;
  insert into public.credit_balances(user_id,granted,used,expires_at)
    values(new.id,grant_amount,0,expiry) on conflict(user_id) do nothing;
  if found and grant_amount>0 then
    insert into public.credit_ledger(user_id,amount,kind,note)
      values(new.id,grant_amount,'initial_grant','Creditos iniciales por tipo de cuenta');
  end if;
  return new;
end;
$$;

-- This existing trigger is also the gate for trusted insertion paths. Use the
-- current wall clock after acquiring the campaign lock, not transaction now().
create or replace function velox_private.guard_launch_publication() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.launch_promotion%rowtype; checked_at timestamptz;
begin
  select * into p from public.launch_promotion where singleton for share;
  checked_at := clock_timestamp();
  if p.revision>0 and (checked_at<p.starts_at or checked_at>=p.ends_at) then
    raise exception 'Promocion fuera de vigencia. Administracion debe definir el siguiente periodo.' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function velox_private.guard_launch_publication() from public,anon,authenticated;

-- The legacy function remains a nested implementation detail after cutover.
-- CREATE OR REPLACE retains its revoked EXECUTE privileges; do not regrant it.
create or replace function public.create_vehicle_with_credit(payload jsonb)
returns public.vehicles language plpgsql security definer set search_path='' as $$
declare p public.launch_promotion%rowtype;
  current_profile public.profiles%rowtype; current_balance public.credit_balances%rowtype;
  created_vehicle public.vehicles%rowtype; checked_at timestamptz;
  cost integer := 1; refill_quota integer := 0; refill_before integer := 0; refill_after integer := 0;
  remaining integer; refill_allowed boolean := false;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesion' using errcode='42501'; end if;
  select * into p from public.launch_promotion where singleton for share;
  select * into current_profile from public.profiles where id=auth.uid() for update;
  if current_profile.id is null or current_profile.is_blocked or current_profile.role not in ('particular','reseller','agency') then
    raise exception 'Tu cuenta no tiene permiso para publicar' using errcode='42501';
  end if;
  select * into current_balance from public.credit_balances where user_id=auth.uid() for update;
  checked_at := clock_timestamp();
  if p.revision>0 then
    if checked_at<p.starts_at or checked_at>=p.ends_at then
      raise exception 'Promocion fuera de vigencia. Administracion debe definir el siguiente periodo.' using errcode='23514';
    end if;
    cost := p.publication_cost;
    refill_allowed := p.auto_refill;
    refill_quota := (p.quotas->>current_profile.role::text)::integer;
    if refill_allowed and (refill_quota is null or refill_quota<cost) then
      raise exception 'El cupo de recarga no alcanza para una publicacion.' using errcode='23514';
    end if;
  end if;
  if current_balance.user_id is null or current_balance.expires_at<=checked_at then
    raise exception 'No tenes creditos de publicacion vigentes';
  end if;
  remaining := current_balance.granted-current_balance.used;
  if remaining<cost then
    if not refill_allowed then raise exception 'No tenes creditos de publicacion disponibles'; end if;
    refill_before := refill_quota;
  end if;

  insert into public.vehicles(owner_id,status,brand,model,version,year,kilometers,price,zone,
    partial_plate,description,checklist,score,accepts_trade,accepts_financing,view_location,available_hours)
  values(auth.uid(),'active',trim(payload->>'brand'),trim(payload->>'model'),trim(payload->>'version'),
    (payload->>'year')::integer,(payload->>'kilometers')::integer,(payload->>'price')::integer,trim(payload->>'zone'),
    nullif(trim(payload->>'partial_plate'),''),nullif(trim(payload->>'description'),''),coalesce(payload->'checklist','{}'::jsonb),
    greatest(1,least(10,coalesce((payload->>'score')::numeric,1))),coalesce((payload->>'accepts_trade')::boolean,false),
    coalesce((payload->>'accepts_financing')::boolean,false),nullif(trim(payload->>'view_location'),''),
    nullif(trim(payload->>'available_hours'),'')) returning * into created_vehicle;

  -- The insert trigger rechecks the deadline. Replenish a balance exhausted by
  -- this successful publication only if the common campaign is STILL active.
  checked_at := clock_timestamp();
  if refill_allowed and remaining+refill_before-cost=0 and checked_at>=p.starts_at and checked_at<p.ends_at then
    refill_after := refill_quota;
  end if;
  update public.credit_balances set granted=granted+refill_before+refill_after,
    used=used+cost,updated_at=checked_at where user_id=auth.uid();
  if refill_before>0 then
    insert into public.credit_ledger(user_id,amount,kind,reference_id,note,created_at)
      values(auth.uid(),refill_before,'promo_refill',created_vehicle.id,
        'Recarga gratuita antes de publicar; politica '||p.policy_revision,clock_timestamp());
  end if;
  insert into public.credit_ledger(user_id,amount,kind,reference_id,note,created_at)
    values(auth.uid(),-cost,'publication',created_vehicle.id,
      'Publicacion de vehiculo; politica '||case when p.revision>0 then p.policy_revision else 0 end||'; costo '||cost,clock_timestamp());
  if refill_after>0 then
    insert into public.credit_ledger(user_id,amount,kind,reference_id,note,created_at)
      values(auth.uid(),refill_after,'promo_refill',created_vehicle.id,
        'Recarga gratuita por saldo agotado; politica '||p.policy_revision,clock_timestamp());
  end if;
  return created_vehicle;
end;
$$;

-- The idempotent outer wrapper is replaced below only to acquire the campaign
-- lock before its profile lock. Validation and historical-result behavior stay
-- unchanged; retries remain possible after credit or campaign expiration.

create or replace function public.publish_vehicle_with_credit(
  payload jsonb,
  media_payload jsonb,
  publication_request_id uuid
)
returns public.vehicles
language plpgsql security definer set search_path = '' as $$
declare
  caller public.profiles%rowtype;
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
  perform 1 from public.launch_promotion where singleton for share;
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
revoke all on function public.publish_vehicle_with_credit(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.publish_vehicle_with_credit(jsonb, jsonb, uuid) to authenticated;


commit;

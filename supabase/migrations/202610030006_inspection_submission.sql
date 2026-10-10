-- Stage private files, then publish the report, links and completion atomically.
begin;

-- The previous client could leave an already-visible partial report. Do not
-- freeze those rows behind the immutable API or invent a completed assessment.
do $$
begin
  if exists(
    select 1 from public.inspection_reports report
    join public.inspection_requests request on request.id=report.request_id
    where request.status not in ('completed','observed') or request.completed_at is null
      or (request.status='completed' and report.result<>'approved')
      or (request.status='observed' and report.result<>'observed')
      or not exists(select 1 from public.inspection_media media where media.report_id=report.id and media.kind='dashboard')
  ) then
    raise exception 'Hay informes legacy incompletos o sin cierre verificable. Revisar y reparar con autorización antes de aplicar esta migracion';
  end if;
  if exists(select 1 from public.inspection_requests where status in ('requested','assigned','in_progress')
    group by requested_by,vehicle_id having count(*)>1) then
    raise exception 'Hay solicitudes de revision legacy duplicadas. Revisarlas antes de aplicar esta migracion';
  end if;
end;
$$;

create unique index if not exists inspection_one_open_request
  on public.inspection_requests(requested_by,vehicle_id) where status in ('requested','assigned','in_progress');

create or replace function public.request_inspection(target_vehicle uuid)
returns public.inspection_requests language plpgsql security definer set search_path='' as $$
declare request public.inspection_requests%rowtype;
begin
  perform 1 from public.profiles where id=auth.uid() for update;
  if not velox_private.is_active_user() or not velox_private.is_public_vehicle(target_vehicle) then
    raise exception 'No se puede solicitar una revision para esta publicacion' using errcode='42501';
  end if;
  select * into request from public.inspection_requests where requested_by=auth.uid() and vehicle_id=target_vehicle
    and status in ('requested','assigned','in_progress') for update;
  if found then return request; end if;
  insert into public.inspection_requests(vehicle_id,requested_by) values(target_vehicle,auth.uid()) returning * into request;
  return request;
end;
$$;
revoke all on function public.request_inspection(uuid) from public,anon;
grant execute on function public.request_inspection(uuid) to authenticated;

create or replace function velox_private.can_upload_inspection_object(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select velox_private.is_active_mechanic(auth.uid())
    and split_part(object_name, '/', 1) = auth.uid()::text and exists (
      select 1 from public.inspection_requests r
      where r.id::text = split_part(object_name, '/', 2)
        and r.assigned_mechanic = auth.uid()
        and r.status in ('assigned','in_progress','completed','observed')
    );
$$;

create or replace function public.submit_inspection_report(
  target_request uuid, report_payload jsonb, media_payload jsonb
)
returns public.inspection_reports
language plpgsql security definer set search_path = '' as $$
declare
  request public.inspection_requests%rowtype;
  existing public.inspection_reports%rowtype;
  saved public.inspection_reports%rowtype;
  report_day date;
  score_name text;
  entry jsonb;
  metadata jsonb;
  byte_size numeric;
  mime text;
  old_media jsonb;
  normalized_media jsonb;
begin
  -- Keep authorization stable while the request and its report are committed.
  perform 1 from public.profiles where id=auth.uid() for share;
  perform 1 from public.mechanic_profiles where user_id=auth.uid() for share;
  if not velox_private.is_active_mechanic(auth.uid()) then
    raise exception 'Se requiere un mecanico habilitado' using errcode='42501';
  end if;
  select * into request from public.inspection_requests where id=target_request for update;
  if not found or request.assigned_mechanic is distinct from auth.uid()
    or request.status not in ('assigned','in_progress','completed','observed') then
    raise exception 'No tenes una revision vigente asignada' using errcode='42501';
  end if;
  if jsonb_typeof(report_payload) is distinct from 'object'
    or report_payload->>'result' not in ('approved','observed')
    or report_payload->>'result' is null then raise exception 'Indica el resultado de la revision'; end if;
  if coalesce(report_payload->>'odometer','') !~ '^[0-9]+$'
    or (report_payload->>'odometer')::numeric > 2147483647 then raise exception 'Kilometraje verificado invalido'; end if;
  if coalesce(report_payload->>'inspection_date','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Fecha de revision invalida';
  end if;
  report_day := (report_payload->>'inspection_date')::date;
  if report_day > current_date then raise exception 'La revision no puede tener fecha futura'; end if;
  if jsonb_typeof(report_payload->'scores') is distinct from 'object' then raise exception 'Faltan valoraciones explicitas'; end if;
  foreach score_name in array array['motor','caja','estructura','frenos','electronica','interior'] loop
    if coalesce(report_payload->'scores'->>score_name,'') !~ '^(10|[1-9])$' then
      raise exception 'Indica una valoracion de 1 a 10 para %',score_name;
    end if;
  end loop;
  if jsonb_typeof(media_payload) is distinct from 'array' or jsonb_array_length(media_payload) not between 1 and 8 then
    raise exception 'Se requiere foto de tablero, hasta seis detalles y un video opcional';
  end if;
  if (select count(*) from jsonb_array_elements(media_payload) m where m->>'kind'='dashboard')<>1
    or (select count(*) from jsonb_array_elements(media_payload) m where m->>'kind'='detail')>6
    or (select count(*) from jsonb_array_elements(media_payload) m where m->>'kind'='video')>1
    or exists(select 1 from jsonb_array_elements(media_payload) m where m->>'kind' is null or m->>'kind' not in('dashboard','detail','video'))
    or exists(select 1 from jsonb_array_elements(media_payload) m group by m->>'storage_path' having count(*)>1) then
    raise exception 'Archivos de informe invalidos';
  end if;
  select jsonb_agg(m order by m->>'kind',m->>'storage_path') into normalized_media from jsonb_array_elements(media_payload) m;
  select * into existing from public.inspection_reports where request_id=target_request;
  if found then
    select jsonb_agg(jsonb_build_object('kind',m.kind,'storage_path',m.storage_path) order by m.kind,m.storage_path)
      into old_media from public.inspection_media m where report_id=existing.id;
    if existing.mechanic_id=auth.uid() and existing.inspection_date=report_day
      and existing.odometer=(report_payload->>'odometer')::integer
      and existing.scores=report_payload->'scores'
      and coalesce(existing.observations,'')=coalesce(report_payload->>'observations','')
      and existing.result=report_payload->>'result' and old_media=normalized_media then return existing; end if;
    raise exception 'Ya existe un informe para esta solicitud. No se modifico ni duplico';
  end if;
  for entry in select * from jsonb_array_elements(media_payload) loop
    if split_part(entry->>'storage_path','/',1) is distinct from auth.uid()::text
      or split_part(entry->>'storage_path','/',2) is distinct from target_request::text then
      raise exception 'Archivo de otra revision' using errcode='42501';
    end if;
    select o.metadata into metadata from storage.objects o
      where o.bucket_id='inspection-media' and o.name=entry->>'storage_path' for share;
    if not found then raise exception 'Falta un archivo subido'; end if;
    if coalesce(metadata->>'size','') !~ '^[0-9]+$' then raise exception 'No se pudo verificar el archivo'; end if;
    byte_size := (metadata->>'size')::numeric;
    mime := lower(coalesce(metadata->>'mimetype',''));
    if byte_size<=0
      or (entry->>'kind'='video' and (byte_size>25*1024*1024 or mime not in ('video/mp4','video/webm','video/quicktime')))
      or (entry->>'kind'<>'video' and (byte_size>3*1024*1024 or mime not in ('image/jpeg','image/png','image/webp'))) then
      raise exception 'Formato o tamano no permitido';
    end if;
  end loop;
  insert into public.inspection_reports(request_id,mechanic_id,inspection_date,odometer,scores,observations,result)
    values(target_request,auth.uid(),report_day,(report_payload->>'odometer')::integer,report_payload->'scores',report_payload->>'observations',report_payload->>'result')
    returning * into saved;
  insert into public.inspection_media(report_id,kind,storage_path)
    select saved.id,m->>'kind',m->>'storage_path' from jsonb_array_elements(media_payload)m;
  update public.inspection_requests set status=case when saved.result='approved' then 'completed' else 'observed' end,
    completed_at=now() where id=target_request;
  return saved;
end;
$$;
revoke all on function public.submit_inspection_report(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.submit_inspection_report(uuid,jsonb,jsonb) to authenticated;
-- Existing clients must switch to this RPC with this migration.
revoke insert,update,delete on public.inspection_reports, public.inspection_media from authenticated;

create or replace function velox_private.guard_inspection_completion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and exists(select 1 from public.inspection_reports r where r.request_id=new.id) then
    if new.assigned_mechanic is distinct from old.assigned_mechanic
      or new.status not in ('completed','observed')
      or (old.completed_at is not null and new.completed_at is distinct from old.completed_at) then
      raise exception 'Un informe final no puede reabrirse, reasignarse ni perder su fecha de cierre';
    end if;
  end if;
  if auth.uid() is not null and new.status in ('completed','observed') then
    if not exists(select 1 from public.inspection_reports r where r.request_id=new.id
      and ((new.status='completed' and r.result='approved') or (new.status='observed' and r.result='observed'))
      and exists(select 1 from public.inspection_media m where m.report_id=r.id and m.kind='dashboard')) then
      raise exception 'Completa el informe y su foto de tablero antes de cerrar la revision';
    end if;
    if old.completed_at is null then new.completed_at := now(); end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_inspection_completion on public.inspection_requests;
create trigger guard_inspection_completion before update on public.inspection_requests
  for each row execute function velox_private.guard_inspection_completion();
commit;

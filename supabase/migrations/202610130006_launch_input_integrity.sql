-- Adversarial audit: malformed checklist JSON crashed the public React page;
-- text fields were unbounded, object overwrite/delete bypassed publication
-- validation, and unused payment/draft paths retained broad browser writes.
-- No existing rows are rewritten, no campaign is started and no credit changes.
begin;

create function velox_private.guard_vehicle_content()
returns trigger language plpgsql set search_path='' as $$
declare document jsonb:=to_jsonb(new); field text; value jsonb; max_length integer;
begin
  foreach field in array array['brand','model','version','zone','description','view_location','available_hours','partial_plate'] loop
    max_length:=case field when 'brand' then 80 when 'model' then 120 when 'version' then 160
      when 'zone' then 200 when 'description' then 4000 when 'view_location' then 300
      when 'available_hours' then 500 else 20 end;
    if length(coalesce(document->>field,''))>max_length then
      raise exception 'El campo % supera el maximo de % caracteres',field,max_length using errcode='23514';
    end if;
  end loop;
  if jsonb_typeof(new.checklist) is distinct from 'object' or octet_length(new.checklist::text)>4096 then
    raise exception 'La autorevision debe ser un objeto pequeno con respuestas de texto' using errcode='23514';
  end if;
  for field,value in select * from jsonb_each(new.checklist) loop
    if field<>all(array['motor','caja','trenDelantero','amortiguadores','cubiertas','frenos','aire','interiores','vidrios','pintura','choques'])
      or jsonb_typeof(value) is distinct from 'string' or length(value#>>'{}')>120 then
      raise exception 'La autorevision contiene una respuesta invalida' using errcode='23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function velox_private.guard_vehicle_content() from public,anon,authenticated;
create trigger guard_vehicle_content before insert or update of brand,model,version,zone,description,view_location,available_hours,partial_plate,checklist
on public.vehicles for each row execute function velox_private.guard_vehicle_content();

-- The idempotency record also stores the original JSON. Bound ignored fields
-- there so extra client keys cannot bypass the per-vehicle limits above.
alter table public.publication_requests add constraint publication_intent_bounded
check(octet_length(request_payload::text)<=32768 and octet_length(request_media::text)<=8192) not valid;

-- Uploads use immutable content-addressed paths and upsert:false. Maintenance
-- cleanup must use the trusted Storage API after reconciling references; browser
-- DELETE cannot safely race an in-progress publication linking the same object.
drop policy if exists "vehicle_storage_update_own_folder" on storage.objects;
drop policy if exists "vehicle_storage_delete_own_folder" on storage.objects;

-- No checkout is implemented. Leave records readable under existing RLS, but
-- do not allow a client to invent paid/pending orders or control their amount.
revoke insert,update,delete on public.orders from public,anon,authenticated;

drop policy if exists "drafts_owner_insert" on public.publication_drafts;
create policy "drafts_owner_insert" on public.publication_drafts for insert to authenticated
with check(user_id=auth.uid() and velox_private.is_active_seller());
drop policy if exists "drafts_owner_update" on public.publication_drafts;
create policy "drafts_owner_update" on public.publication_drafts for update to authenticated
using(user_id=auth.uid() and velox_private.is_active_seller())
with check(user_id=auth.uid() and velox_private.is_active_seller());
alter table public.publication_drafts add constraint draft_content_bounded
check(jsonb_typeof(data)='object' and octet_length(data::text)<=65536) not valid;

-- Trigger functions have no legitimate RPC callers.
revoke execute on function public.create_profile_for_new_user(),public.grant_initial_publication_credits()
from public,anon,authenticated;
commit;

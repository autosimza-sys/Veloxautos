-- Optional draft role tariffs. No campaign activation, grants, AI billing or
-- monetary prices are introduced by applying this migration. Existing scalar
-- policy remains the fallback. Roll back through a new forward migration only.
begin;
alter table public.launch_promotion
  add column if not exists publication_costs jsonb
    check (publication_costs is null or jsonb_typeof(publication_costs)='object'),
  add column if not exists ai_response_cost_draft integer
    check (ai_response_cost_draft between 0 and 1000000);

-- This configures proposal values only; AI charging is deliberately NOT wired to
-- claim/finish. A provider failure/fallback must never be mistaken for paid use.
create or replace function public.configure_launch_role_credit_policy(
  expected_policy_revision integer,
  role_publication_costs jsonb,
  proposed_ai_response_cost integer,
  refill_enabled boolean
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.launch_promotion%rowtype; role_name text;
  previous_policy jsonb; next_policy jsonb;
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
  if p.revision<>0 then
    raise exception 'La politica de creditos queda fija al iniciar la promocion.' using errcode='23514';
  end if;
  if jsonb_typeof(role_publication_costs) is distinct from 'object'
    or role_publication_costs - 'particular' - 'reseller' - 'agency' <> '{}'::jsonb
    or refill_enabled is null
    or (proposed_ai_response_cost is not null and proposed_ai_response_cost not between 0 and 1000000) then
    raise exception 'Completa las tarifas por tipo de vendedor y una propuesta de IA valida.' using errcode='23514';
  end if;
  foreach role_name in array array['particular','reseller','agency'] loop
    if jsonb_typeof(role_publication_costs->role_name) is distinct from 'number' then
      raise exception 'Cada tarifa debe ser un entero entre 1 y 1000000.' using errcode='23514';
    end if;
    if (role_publication_costs->>role_name)::numeric not between 1 and 1000000
      or trunc((role_publication_costs->>role_name)::numeric) <> (role_publication_costs->>role_name)::numeric then
      raise exception 'Cada tarifa debe ser un entero entre 1 y 1000000.' using errcode='23514';
    end if;
  end loop;
  -- JSON numeric values such as 50.0 are integral but their text is not valid
  -- input to a later integer cast. Persist canonical integers after validation.
  role_publication_costs := jsonb_build_object(
    'particular',(role_publication_costs->>'particular')::numeric::integer,
    'reseller',(role_publication_costs->>'reseller')::numeric::integer,
    'agency',(role_publication_costs->>'agency')::numeric::integer);
  previous_policy := jsonb_build_object('publication_cost',p.publication_cost,'publication_costs',p.publication_costs,
    'ai_response_cost_draft',p.ai_response_cost_draft,'auto_refill',p.auto_refill,'policy_revision',p.policy_revision);
  next_policy := jsonb_build_object('publication_cost',p.publication_cost,'publication_costs',role_publication_costs,
    'ai_response_cost_draft',proposed_ai_response_cost,'auto_refill',refill_enabled,'policy_revision',p.policy_revision+1);
  update public.launch_promotion set publication_costs=role_publication_costs,
    ai_response_cost_draft=proposed_ai_response_cost,auto_refill=refill_enabled,policy_revision=p.policy_revision+1 where singleton;
  insert into velox_private.launch_credit_policy_events(policy_revision,actor,previous_policy,new_policy)
    values(p.policy_revision+1,auth.uid(),previous_policy,next_policy);
  return (select to_jsonb(x) from public.launch_promotion x where singleton);
end;
$$;
revoke all on function public.configure_launch_role_credit_policy(integer,jsonb,integer,boolean) from public,anon;
grant execute on function public.configure_launch_role_credit_policy(integer,jsonb,integer,boolean) to authenticated;

-- The compatible scalar configuration explicitly returns to a uniform tariff;
-- it preserves the separate AI draft and records the complete before/after.

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
  previous_policy := jsonb_build_object('publication_cost',p.publication_cost,'publication_costs',p.publication_costs,'ai_response_cost_draft',p.ai_response_cost_draft,'auto_refill',p.auto_refill,'policy_revision',p.policy_revision);
  next_policy := jsonb_build_object('publication_cost',publication_credit_cost,'publication_costs',null,'ai_response_cost_draft',p.ai_response_cost_draft,'auto_refill',refill_enabled,'policy_revision',p.policy_revision+1);
  update public.launch_promotion set publication_cost=publication_credit_cost,publication_costs=null,
    auto_refill=refill_enabled,policy_revision=p.policy_revision+1 where singleton;
  insert into velox_private.launch_credit_policy_events(policy_revision,actor,previous_policy,new_policy)
    values(p.policy_revision+1,auth.uid(),previous_policy,next_policy);
  return (select to_jsonb(x) from public.launch_promotion x where singleton);
end;
$$;

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
      if p.auto_refill and (credit_quotas->>role_name)::integer < coalesce((p.publication_costs->>role_name)::integer,p.publication_cost) then
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
    new_end := greatest(p.ends_at,action_at) + interval '2160 hours';
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
    cost := coalesce((p.publication_costs->>current_profile.role::text)::integer,p.publication_cost);
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

commit;

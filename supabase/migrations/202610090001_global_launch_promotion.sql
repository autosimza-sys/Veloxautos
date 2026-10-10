-- Prepared migration; activate only during the backed-up coordinated release.
-- Applying it alone does not launch the campaign or change existing balances.
begin;
create table public.launch_promotion (
  singleton boolean primary key default true check (singleton),
  starts_at timestamptz,
  ends_at timestamptz,
  quotas jsonb,
  revision integer not null default 0 check (revision >= 0),
  check ((starts_at is null and ends_at is null and quotas is null) or
    (starts_at is not null and ends_at > starts_at and quotas is not null))
);
insert into public.launch_promotion(singleton) values(true);
alter table public.launch_promotion enable row level security;
revoke all on public.launch_promotion from public, anon, authenticated;
grant select on public.launch_promotion to anon, authenticated;
create policy launch_read on public.launch_promotion for select to anon, authenticated using(true);

create table velox_private.launch_promotion_events (
  revision integer primary key, actor uuid not null, action text not null,
  previous_end timestamptz, new_end timestamptz not null, created_at timestamptz not null default now()
);
alter table velox_private.launch_promotion_events enable row level security;
revoke all on velox_private.launch_promotion_events from public, anon, authenticated;

create function public.manage_launch_promotion(action text, expected_revision integer, launch_at timestamptz, credit_quotas jsonb)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare p public.launch_promotion%rowtype; role_name text; new_end timestamptz;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Solo administracion activa' using errcode='42501'; end if;
  select * into p from public.launch_promotion where singleton for update;
  if expected_revision is distinct from p.revision then
    raise exception 'La promocion cambio. Actualiza antes de continuar.' using errcode='23514';
  end if;
  if action='start' then
    if p.revision<>0 or launch_at is null or launch_at < now()-interval '5 minutes' then
      raise exception 'Inicio de promocion invalido' using errcode='23514';
    end if;
    if jsonb_typeof(credit_quotas) is distinct from 'object' then raise exception 'Faltan cupos' using errcode='23514'; end if;
    foreach role_name in array array['particular','reseller','agency'] loop
      if jsonb_typeof(credit_quotas->role_name) is distinct from 'number'
        or (credit_quotas->>role_name)::numeric < 1 or (credit_quotas->>role_name)::numeric > 1000000
        or trunc((credit_quotas->>role_name)::numeric) <> (credit_quotas->>role_name)::numeric then
        raise exception 'Cupo invalido' using errcode='23514';
      end if;
    end loop;
    new_end := launch_at + interval '2160 hours';
    update public.launch_promotion set starts_at=launch_at,ends_at=new_end,quotas=credit_quotas,revision=1 where singleton;
    update public.credit_settings set initial_credits=(credit_quotas->>role::text)::integer
      where role in ('particular','reseller','agency');
    -- Top up to the chosen remaining allowance; retain all existing usage/history.
    insert into public.credit_ledger(user_id,amount,kind,note)
      select b.user_id,greatest(0,b.used+(credit_quotas->>u.role::text)::integer-b.granted),'admin_adjustment','Inicio promocion global'
      from public.credit_balances b join public.profiles u on u.id=b.user_id
      where u.role in ('particular','reseller','agency') and b.used+(credit_quotas->>u.role::text)::integer>b.granted;
    update public.credit_balances b set granted=greatest(b.granted,b.used+(credit_quotas->>u.role::text)::integer),
      expires_at=new_end,updated_at=now() from public.profiles u
      where u.id=b.user_id and u.role in ('particular','reseller','agency');
  elsif action='extend' and p.revision>0 then
    new_end := greatest(p.ends_at,now()) + interval '3 months';
    update public.launch_promotion set ends_at=new_end,revision=revision+1 where singleton;
    update public.credit_balances b set expires_at=new_end,updated_at=now() from public.profiles u
      where u.id=b.user_id and u.role in ('particular','reseller','agency');
  else
    raise exception 'Accion de promocion invalida. No hay cobro automatico.' using errcode='23514';
  end if;
  insert into velox_private.launch_promotion_events(revision,actor,action,previous_end,new_end)
    values(p.revision+1,auth.uid(),action,p.ends_at,new_end);
  return (select to_jsonb(x) from public.launch_promotion x where singleton);
end; $$;
revoke all on function public.manage_launch_promotion(text,integer,timestamptz,jsonb) from public,anon;
grant execute on function public.manage_launch_promotion(text,integer,timestamptz,jsonb) to authenticated;

create function velox_private.apply_global_credit_expiry() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.launch_promotion%rowtype; seller_role text;
begin
  select * into p from public.launch_promotion where singleton for share;
  select role::text into seller_role from public.profiles where id=new.user_id;
  if p.revision>0 and seller_role in ('particular','reseller','agency') then new.expires_at:=p.ends_at; end if;
  return new;
end; $$;
revoke all on function velox_private.apply_global_credit_expiry() from public,anon,authenticated;
create trigger global_credit_expiry before insert on public.credit_balances
  for each row execute function velox_private.apply_global_credit_expiry();

create function velox_private.guard_launch_publication() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.launch_promotion%rowtype;
begin
  select * into p from public.launch_promotion where singleton;
  if p.revision>0 and (now()<p.starts_at or now()>=p.ends_at) then
    raise exception 'Promocion fuera de vigencia. Administracion debe definir el siguiente periodo.' using errcode='23514';
  end if;
  return new;
end; $$;
revoke all on function velox_private.guard_launch_publication() from public,anon,authenticated;
create trigger guard_launch_publication before insert on public.vehicles
  for each row execute function velox_private.guard_launch_publication();
commit;

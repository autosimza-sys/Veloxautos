begin;
-- Reservations survive message/account deletion. No conversation text or names.
create table velox_private.ai_budget_reservations (
  message_id uuid primary key,
  reserved_micro_usd integer not null default 25000 check (reserved_micro_usd = 25000),
  created_at timestamptz not null default clock_timestamp()
);
create index ai_budget_reservations_month on velox_private.ai_budget_reservations(created_at);
alter table velox_private.ai_budget_reservations enable row level security;
revoke all on velox_private.ai_budget_reservations from public, anon, authenticated, service_role;

create function public.reserve_ai_reply_budget(target_message uuid, actor uuid, monthly_limit integer)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare month_start timestamptz; reserved bigint;
begin
  -- Serializes all deployments and in-flight calls BEFORE provider I/O.
  perform pg_catalog.pg_advisory_xact_lock(49010001);
  if monthly_limit is null or monthly_limit < 25000 or monthly_limit > 10000000 then
    return jsonb_build_object('state','limited');
  end if;
  if not exists (
    select 1 from velox_private.ai_reply_jobs j
    join public.messages m on m.id=j.message_id
    join public.conversations c on c.id=m.conversation_id
    join public.vehicles v on v.id=c.vehicle_id
    join public.profiles b on b.id=c.buyer_id
    join public.profiles s on s.id=c.seller_id
    left join public.seller_assistant_settings a on a.user_id=c.seller_id
    where j.message_id=target_message and j.author_id=actor and j.state='processing'
      and m.sender_id=actor and not m.is_automated and c.buyer_id=actor
      and not c.is_blocked and not b.is_blocked and not s.is_blocked
      and v.owner_id=c.seller_id and v.status='active' and coalesce(a.enabled,true)
  ) then return jsonb_build_object('state','denied'); end if;
  if exists(select 1 from velox_private.ai_budget_reservations where message_id=target_message) then
    return jsonb_build_object('state','processing');
  end if;
  month_start := date_trunc('month',clock_timestamp());
  select coalesce(sum(reserved_micro_usd),0) into reserved
    from velox_private.ai_budget_reservations where created_at>=month_start;
  if reserved+25000 > monthly_limit then return jsonb_build_object('state','limited'); end if;
  insert into velox_private.ai_budget_reservations(message_id) values(target_message);
  return jsonb_build_object('state','reserved');
end; $$;
revoke all on function public.reserve_ai_reply_budget(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_ai_reply_budget(uuid,uuid,integer) to service_role;
commit;

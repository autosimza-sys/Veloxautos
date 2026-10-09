begin;
create or replace function public.claim_ai_reply(target_message uuid, actor uuid, per_user_limit integer, global_limit integer)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare m public.messages%rowtype; c public.conversations%rowtype; v public.vehicles%rowtype;
  prior velox_private.ai_reply_jobs%rowtype; enabled boolean;
begin
  -- Only backend service_role can execute. actor must come from getUser(token).
  perform pg_catalog.pg_advisory_xact_lock(49009002);
  select * into m from public.messages where id=target_message;
  if not found or m.sender_id is distinct from actor or m.is_automated then return jsonb_build_object('state','denied'); end if;
  select * into c from public.conversations where id=m.conversation_id for update;
  if not found or c.buyer_id is distinct from actor or c.is_blocked
    or not exists(select 1 from public.profiles where id=actor and not is_blocked)
    or not exists(select 1 from public.profiles where id=c.seller_id and not is_blocked) then
    return jsonb_build_object('state','denied');
  end if;
  select * into v from public.vehicles where id=c.vehicle_id and owner_id=c.seller_id;
  if not found or v.status<>'active' then return jsonb_build_object('state','skipped'); end if;
  select coalesce(s.enabled,true) into enabled from (select 1) seed
    left join public.seller_assistant_settings s on s.user_id=c.seller_id;
  if not enabled then return jsonb_build_object('state','skipped'); end if;
  select * into prior from velox_private.ai_reply_jobs where message_id=target_message;
  if found then return jsonb_build_object('state',prior.state); end if;
  if exists(select 1 from velox_private.message_requests where result->>'message_id'=target_message::text and result->>'automated'='true') then
    return jsonb_build_object('state','skipped');
  end if;
  if per_user_limit is null or global_limit is null or per_user_limit<1 or global_limit<1
    or per_user_limit>100 or global_limit>10000
    or (select count(*) from velox_private.ai_reply_jobs where author_id=actor and created_at>=date_trunc('day',now()))>=per_user_limit
    or (select count(*) from velox_private.ai_reply_jobs where created_at>=date_trunc('day',now()))>=global_limit then
    return jsonb_build_object('state','limited');
  end if;
  insert into velox_private.ai_reply_jobs(message_id,author_id,state) values(target_message,actor,'processing');
  return jsonb_build_object('state','claimed','job',target_message,'question',left(m.body,2000),'vehicle',
    jsonb_build_object('brand',v.brand,'model',v.model,'version',v.version,'year',v.year,'km',v.kilometers,
      'price',v.price,'zone',v.zone,'description',left(v.description,3000),'checklist',v.checklist,
      'acceptsTrade',v.accepts_trade,'acceptsFinancing',v.accepts_financing,'availableHours',v.available_hours,
      'status',v.status));
end; $$;
revoke all on function public.claim_ai_reply(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_ai_reply(uuid,uuid,integer,integer) to service_role;


commit;

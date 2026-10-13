-- Persistent rolling admission limit for new human sends (FAQ included).
-- Preconditions: UUID-preserving clients and finalize-client-cutover.sql applied;
-- this migration never grants legacy RPC or direct messages INSERT permissions.
-- No message backfill: only sends accepted after this migration count.
-- Forward rollback: restore the previous wrapper in a NEW migration; keep this
-- private state until that rollout is verified. Never reopen legacy entrypoints.
begin;

create table if not exists velox_private.message_rate_windows (
  author_id uuid primary key references public.profiles(id) on delete cascade,
  -- At most thirty recent acceptances per author, not message text or results.
  -- Stale entries are discarded on the next successful send. No scheduled job
  -- or growing scan over the message history is needed for enforcement.
  recent_messages jsonb not null default '[]'::jsonb
    check (jsonb_typeof(recent_messages) = 'array' and jsonb_array_length(recent_messages) <= 30)
);
alter table velox_private.message_rate_windows enable row level security;
revoke all on velox_private.message_rate_windows from public, anon, authenticated;

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
  recent jsonb;
  author_count integer;
  conversation_count integer;
  admitted_at timestamptz;
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

  -- All conversations share this author's lock. Acquire it BEFORE a conversation
  -- or request lock, so multiple sends by this author have one lock order.
  -- A hash collision only makes unrelated authors wait; quota identity is UUID.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('velox:message-rate:author:' || caller::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller::text || ':' || message_request_id::text, 0)
  );
  perform 1 from public.conversations c
  where c.id = target_conversation and (c.buyer_id = caller or c.seller_id = caller)
  for update;
  if not found or not velox_private.can_send_message(target_conversation) then
    raise exception 'La cuenta o conversacion no tiene permiso para enviar mensajes' using errcode = '42501';
  end if;

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
    -- Successful retries do not test, consume, refresh or clear rate state.
    return prior.result;
  end if;

  insert into velox_private.message_rate_windows(author_id)
    values(caller) on conflict (author_id) do nothing;
  select w.recent_messages into recent from velox_private.message_rate_windows w
    where w.author_id = caller for update;
  -- Wall-clock time AFTER waiting for locks; transaction now() can be stale.
  admitted_at := pg_catalog.clock_timestamp();
  select coalesce(pg_catalog.jsonb_agg(e), '[]'::jsonb), count(*)::integer,
    count(*) filter (where e->>'conversation_id' = target_conversation::text)::integer
  into recent, author_count, conversation_count
  from pg_catalog.jsonb_array_elements(recent) e
  where (e->>'accepted_at')::timestamptz > admitted_at - interval '1 minute';
  if author_count >= 30 or conversation_count >= 10 then
    raise exception 'Esperá un momento antes de enviar más mensajes. Podés volver a intentar en un minuto.'
      using errcode = 'P0001';
  end if;

  -- Updating a single locked row also prevents stale-snapshot overshoot under
  -- REPEATABLE READ: conflicting writers must serialize or fail serialization.
  -- Any downstream error rolls back this update and the initial row insertion.
  update velox_private.message_rate_windows
  set recent_messages = recent || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('conversation_id', target_conversation, 'accepted_at', admitted_at)
  ) where author_id = caller;
  sent_result := public.send_message_with_assistant(target_conversation, normalized_body);
  insert into velox_private.message_requests
    (author_id, request_id, conversation_id, request_fingerprint, result)
  values (caller, message_request_id, target_conversation, fingerprint, sent_result);
  return sent_result;
end;
$$;
revoke all on function public.send_message_idempotent(uuid, text, uuid) from public, anon;
grant execute on function public.send_message_idempotent(uuid, text, uuid) to authenticated;

commit;

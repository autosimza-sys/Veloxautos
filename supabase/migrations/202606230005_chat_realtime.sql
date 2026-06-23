do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;

create index if not exists messages_conversation_created_idx
on public.messages (conversation_id, created_at);

create index if not exists conversations_buyer_idx
on public.conversations (buyer_id, created_at desc);

create index if not exists conversations_seller_idx
on public.conversations (seller_id, created_at desc);

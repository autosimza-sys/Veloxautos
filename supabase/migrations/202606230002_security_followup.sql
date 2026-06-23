-- VELOX security follow-up
-- Restrict mutable chat fields and prevent messaging blocked conversations.

revoke update on public.conversations from authenticated;
grant update (is_reported, is_blocked) on public.conversations to authenticated;

drop policy if exists "messages_members_insert" on public.messages;

create policy "messages_members_insert"
on public.messages
for insert
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
      and conversations.is_blocked = false
  )
);

create policy "messages_members_mark_read"
on public.messages
for update
using (
  sender_id <> auth.uid()
  and exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
  )
)
with check (
  sender_id <> auth.uid()
  and exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
  )
);

revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

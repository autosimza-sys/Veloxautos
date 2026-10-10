-- Explicit release step, NOT an automatically applied migration.
-- Run in authorized staging first, after the new frontend and RPCs are verified.
-- Old browser clients lose non-idempotent write paths; expect them to reload.
-- Do not execute against production without its separate release approval.
begin;
revoke execute on function public.create_vehicle_with_credit(jsonb) from public,anon,authenticated;
revoke execute on function public.send_message_with_assistant(uuid,text) from public,anon,authenticated;
revoke insert on public.messages from public,anon,authenticated;
revoke insert (conversation_id,sender_id,body) on public.messages from authenticated;
-- SECURITY DEFINER replacements still call the legacy implementations internally.
commit;

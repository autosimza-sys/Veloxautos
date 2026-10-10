import { createClient } from '@supabase/supabase-js';
import { getVercelOidcToken } from '@vercel/oidc';
import { handleAssistantRequest } from '../../../lib/server/assistant-endpoint';
import { generateSalesAnswer, prepareSalesRequest } from '../../../lib/server/ai-provider';
import { readAiPolicy } from '../../../lib/server/ai-policy';
export const runtime = 'nodejs';
export const maxDuration = 25;
export async function POST(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const policy = readAiPolicy(process.env);
  if (!policy || !url || !key) return handleAssistantRequest(request, { enabled: false });
  let credential;
  try {
    credential = policy.provider === 'vercel'
      ? process.env.AI_GATEWAY_API_KEY || await getVercelOidcToken()
      : process.env.ANTHROPIC_API_KEY;
  } catch { /* No anonymous fallback if OIDC is unavailable. */ }
  if (!credential) return handleAssistantRequest(request, { enabled: false });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rpc = async (name, args) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw Error('Database unavailable');
    return data;
  };
  return handleAssistantRequest(request, {
    enabled: true,
    verify: async token => { const { data, error } = await client.auth.getUser(token); return error ? null : data.user; },
    claim: (messageId, actor) => rpc('claim_ai_reply', { target_message: messageId, actor, per_user_limit: policy.perUser, global_limit: policy.global }),
    prepare: (question, vehicle) => prepareSalesRequest(question, vehicle, policy),
    reserve: (job, actor) => rpc('reserve_ai_reply_budget', { target_message: job, actor, monthly_limit: policy.monthly }),
    generate: body => generateSalesAnswer(body, policy, credential),
    finish: (job, answer, actor) => rpc('finish_ai_reply', { target_message: job, actor, answer }),
  });
}

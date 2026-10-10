// Pilot authorization: at most US$10/month across deployments sharing this DB.
// Reserve US$0.025 per attempt, including timeouts. With bounded text, no tools
// and reviewed Haiku 4.5 rates ($1/$5 per million), this is conservative.
// Reservations are NOT actual invoices or the seller's promotional credits.
export const AI_RESERVATION_MICRO_USD = 25000;
export const AI_MAX_BODY_BYTES = 8000;
export const AI_MAX_OUTPUT_TOKENS = 350;
export const AI_PRICE_REVIEW_EXPIRES = Date.parse('2026-11-10T00:00:00Z');
export function readAiPolicy(env, now = Date.now()) {
  const provider = env.VELOX_AI_PROVIDER;
  const model = provider === 'vercel'
    ? 'anthropic/claude-haiku-4.5' : 'claude-haiku-4-5-20251001';
  const dollars = env.VELOX_AI_MONTHLY_BUDGET_USD;
  const monthly = typeof dollars === 'string' && /^(?:[0-9]|10)(?:\.\d{1,2})?$/.test(dollars)
    ? Math.round(Number(dollars) * 1000000) : 0;
  const perUser = Number(env.VELOX_AI_DAILY_USER_LIMIT);
  const global = Number(env.VELOX_AI_DAILY_GLOBAL_LIMIT);
  if (env.VELOX_AI_ENABLED !== 'true' || !['anthropic', 'vercel'].includes(provider)
    || env.VELOX_AI_MODEL !== model || monthly < AI_RESERVATION_MICRO_USD || monthly > 10000000
    || !Number.isInteger(perUser) || perUser < 1 || perUser > 100
    || !Number.isInteger(global) || global < 1 || global > 10000
    || !Number.isFinite(now) || now >= AI_PRICE_REVIEW_EXPIRES) return null;
  return { provider, model, monthly, perUser, global };
}

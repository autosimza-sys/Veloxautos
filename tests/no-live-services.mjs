// Test processes must never inherit real service credentials or use network I/O.
process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AI_GATEWAY_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.VELOX_AI_ENABLED = 'false';
globalThis.fetch = async () => { throw new Error("Network disabled in tests; provide an explicit local mock."); };

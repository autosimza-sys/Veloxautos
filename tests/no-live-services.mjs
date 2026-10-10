// Test processes must never inherit real service credentials or use network I/O.
process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
delete process.env.ANTHROPIC_API_KEY;
globalThis.fetch = async () => { throw new Error("Network disabled in tests; provide an explicit local mock."); };

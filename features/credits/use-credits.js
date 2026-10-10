"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase-client";

export function useCredits(session, client = supabase) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const userId = session?.user?.id || null;
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!userId || !client) return;
    let active = true;
    client.from("credit_balances").select("granted, used, expires_at").eq("user_id", userId).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        const expired = !data?.expires_at || !Number.isFinite(Date.parse(data.expires_at)) || Date.parse(data.expires_at) <= Date.now();
        setResult({
          userId, revision,
          status: error ? "No pudimos consultar tus créditos. Revisá la conexión e intentá de nuevo." : "",
          balance: !error && data ? {
            ...data, expired,
            remaining: expired ? 0 : Math.max(0, Number(data.granted) - Number(data.used)),
          } : null,
        });
      }).catch(() => {
        if (active) setResult({ userId, revision, balance: null, status: "No pudimos consultar tus créditos. Revisá la conexión e intentá de nuevo." });
      });
    return () => { active = false; };
  }, [client, userId, revision]);
  const current = userId && result?.userId === userId && result.revision === revision ? result : null;
  return {
    balance: current?.balance || null,
    status: current?.status || "",
    isLoading: Boolean(userId && !current),
    refresh,
  };
}

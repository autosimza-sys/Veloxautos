"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase-client";

export function useCredits(session) {
  const [balance, setBalance] = useState(null);
  const [status, setStatus] = useState("");
  const userId = session?.user?.id;

  const refresh = useCallback(async () => {
    if (!userId) {
      setBalance(null);
      return;
    }

    const result = await fetchBalance(userId);
    applyResult(result, setBalance, setStatus);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchBalance(userId).then((result) => applyResult(result, setBalance, setStatus));
  }, [userId]);

  return { balance, refresh, status };
}

async function fetchBalance(userId) {
  return supabase
    .from("credit_balances")
    .select("granted, used, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
}

function applyResult({ data, error }, setBalance, setStatus) {
  if (error) {
    setStatus("Los creditos se activaran al aplicar la migracion pendiente.");
    return;
  }

  setBalance(data ? {
    ...data,
    remaining: Math.max(0, data.granted - data.used),
  } : null);
  setStatus("");
}

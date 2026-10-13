"use client";

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase-client';

export function useCreditHistory(userId, balance, client = supabase) {
  const [result, setResult] = useState(null);
  const granted = balance?.granted;
  const used = balance?.used;
  useEffect(() => {
    if (!userId || !client) return;
    let active = true;
    client.from('credit_ledger').select('id, amount, kind, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20)
      .then(({ data, error }) => {
        if (active) setResult({ userId, granted, used, entries: error ? [] : data || [], error: error ? 'No pudimos consultar tus movimientos.' : '' });
      }).catch(() => {
        if (active) setResult({ userId, granted, used, entries: [], error: 'No pudimos consultar tus movimientos.' });
      });
    return () => { active = false; };
  }, [userId, granted, used, client]);
  const current = userId && result?.userId === userId && result.granted === granted && result.used === used ? result : null;
  return { entries: current?.entries || [], error: current?.error || '', isLoading: Boolean(userId && client && !current) };
}

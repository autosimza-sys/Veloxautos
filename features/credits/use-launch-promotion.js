"use client";
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase-client';
export function useLaunchPromotion(client = supabase) {
  const [promotion,setPromotion]=useState(null);
  const [error,setError]=useState('');
  const [loaded,setLoaded]=useState(false);
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(n=>n+1),[]);
  useEffect(()=>{
    if(!client) return;
    let active=true;
    client.from('launch_promotion').select('starts_at, ends_at, quotas, revision, publication_cost, auto_refill, policy_revision').eq('singleton',true).maybeSingle()
      .then(({data,error:failed})=>{if(active){setPromotion(failed?null:data);setError(failed || !data?'No pudimos consultar la promoción.':'');setLoaded(true);}})
      .catch(()=>{if(active){setPromotion(null);setError('No pudimos consultar la promoción.');setLoaded(true);}});
    const timer=setInterval(refresh,60000);
    return()=>{active=false;clearInterval(timer);};
  },[client,revision,refresh]);
  return {promotion,error,refresh,isLoading:Boolean(client && !loaded)};
}

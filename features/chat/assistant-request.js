export async function requestAssistantReply(messageId,token,fetcher=fetch) {
  if(!token)return 'unavailable';
  try {
    const response=await fetcher('/api/assistant',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({messageId}),signal:AbortSignal.timeout(22000),
    });
    if(!response.ok)return 'unavailable';
    const data=await response.json();
    return ['done','processing','limited','skipped'].includes(data.state)?data.state:'unavailable';
  } catch {return 'unavailable';}
}

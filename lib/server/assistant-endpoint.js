const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(state,status=200)=>Response.json({state},{status,headers:{'Cache-Control':'no-store'}});
export async function handleAssistantRequest(request,deps) {
  if(!deps.enabled) return reply('unavailable',503);
  const token=request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/)?.[1];
  if(!token || token.length>8192) return reply('unauthorized',401);
  try {
    if(!request.headers.get('content-type')?.startsWith('application/json')) return reply('invalid',400);
    // Enforce actual streamed bytes, not an untrusted Content-Length header.
    const reader=request.body?.getReader(); if(!reader) return reply('invalid',400);
    let size=0;const chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>512){await reader.cancel();return reply('invalid',413);}chunks.push(value);}
    let body;
    try {const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}body=JSON.parse(new TextDecoder().decode(bytes));} catch{return reply('invalid',400);}
    if(!body || Object.keys(body).length!==1 || !UUID.test(body.messageId || '')) return reply('invalid',400);
    const user=await deps.verify(token);if(!user?.id)return reply('unauthorized',401);
    const job=await deps.claim(body.messageId,user.id);
    if(job.state!=='claimed') return reply(['done','processing','limited','skipped'].includes(job.state)?job.state:'denied',job.state==='denied'?403:200);
    let answer;
    try {answer=await deps.generate(job.question,job.vehicle);}catch{answer='No pude resolver esa consulta ahora. El vendedor puede confirmarte el dato por este chat.';}
    if(typeof answer!=='string' || !answer.trim() || answer.length>1600) answer='El vendedor debe confirmar ese dato por este chat.';
    const result=await deps.finish(job.job,answer,user.id);
    return reply(result.state==='done'?'done':'denied',result.state==='done'?200:403);
  } catch { return reply('unavailable',503); }
}

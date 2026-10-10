import {createClient} from '@supabase/supabase-js';
import {handleAssistantRequest} from '../../../lib/server/assistant-endpoint';
import {generateSalesAnswer} from '../../../lib/server/ai-provider';
export const runtime='nodejs';
export const maxDuration=25;
export async function POST(request) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const perUser=Number(process.env.VELOX_AI_DAILY_USER_LIMIT);
  const global=Number(process.env.VELOX_AI_DAILY_GLOBAL_LIMIT);
  const enabled=process.env.VELOX_AI_ENABLED==='true' && Boolean(url && key && process.env.ANTHROPIC_API_KEY && process.env.VELOX_AI_MODEL)
    && Number.isInteger(perUser) && perUser>0 && perUser<=100 && Number.isInteger(global) && global>0 && global<=10000;
  if(!enabled)return handleAssistantRequest(request,{enabled:false});
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const rpc=async(name,args)=>{const {data,error}=await client.rpc(name,args);if(error)throw Error('Database unavailable');return data;};
  return handleAssistantRequest(request,{
    enabled,
    verify:async token=>{const {data,error}=await client.auth.getUser(token);return error?null:data.user;},
    claim:(messageId,actor)=>rpc('claim_ai_reply',{target_message:messageId,actor,per_user_limit:perUser,global_limit:global}),
    generate:generateSalesAnswer,
    finish:(job,answer,actor)=>rpc('finish_ai_reply',{target_message:job,actor,answer}),
  });
}

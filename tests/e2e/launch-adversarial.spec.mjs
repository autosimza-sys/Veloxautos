import {test,expect} from '@playwright/test';
import {installPilotApi} from './pilot-api.mjs';

test('public home survives a malformed historical auto check',async({page})=>{
 const api=await installPilotApi(page);
 for(const v of api.vehicles)v.checklist={motor:{malicious:'nested'},caja:['unexpected'],certificado:'Invented professional guarantee'};
 await page.goto('/');
 await expect(page.locator('#calidad')).toBeVisible();
 await expect(page.locator('#calidad')).toContainText('No informado');
 await expect(page.locator('#calidad')).not.toContainText('Invented professional guarantee');
 expect(api.pageErrors).toEqual([]);
});

test('HTTP protections are served and embedding is denied',async({page})=>{
 await installPilotApi(page);
 const response=await page.goto('/recuperar-cuenta');
 expect(response.headers()['x-frame-options']).toBe('DENY');
 expect(response.headers()['x-content-type-options']).toBe('nosniff');
 expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
 const blocked=[];
 page.on('console',m=>{if(/frame-ancestors|X-Frame-Options|Refused to frame/i.test(m.text()))blocked.push(m.text());});
 await page.route('http://127.0.0.1:3100/audit-embed',r=>r.fulfill({contentType:'text/html',body:'<iframe src="/recuperar-cuenta"></iframe>'}));
 await page.goto('/audit-embed');
 await expect.poll(()=>blocked.length).toBeGreaterThan(0);
});

function recoveryToken(){return [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:'70000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'synthetic-signature'].join('.');}
async function authHarness(page,{failUpdate=false,failLogout=false}={}){
 const state={calls:[],errors:[],updateFailed:false,logoutFailed:false};
 const user={id:'70000000-0000-4000-8000-000000000001',email:'recovery@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
 page.on('pageerror',e=>state.errors.push(e.message));
 await page.route('**/*',async route=>{
  const r=route.request(),url=new URL(r.url());
  if(url.origin==='http://127.0.0.1:3100')return route.continue();
  if(url.hostname!=='pilot-supabase.invalid')return route.abort();
  const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  if(r.method()==='OPTIONS')return respond({});
  state.calls.push({method:r.method(),path:url.pathname,search:url.search});
  if(url.pathname==='/auth/v1/recover')return respond({});
  if(url.pathname==='/auth/v1/user'&&r.method()==='GET')return respond(user);
  if(url.pathname==='/auth/v1/user'&&r.method()==='PUT'){
   if(failUpdate&&!state.updateFailed){state.updateFailed=true;return respond({code:'weak_password',msg:'synthetic rejected password'},422);}
   return respond(user);
  }
  if(url.pathname==='/auth/v1/logout'){
   if(failLogout&&!state.logoutFailed){state.logoutFailed=true;return respond({code:'unexpected_failure',msg:'synthetic unavailable'},500);}
   return respond({});
  }
  return respond({message:'unexpected synthetic endpoint'},400);
 });
 return state;
}
const callback=()=>'/recuperar-cuenta#access_token='+recoveryToken()+'&refresh_token=synthetic-refresh&token_type=bearer&expires_in=3600&type=recovery';
test('real SDK processes recovery callback, updates password and closes only after ACK',async({page})=>{
 const state=await authHarness(page);
 await page.goto(callback());
 await expect(page.getByLabel('Nueva contraseña',{exact:true})).toBeVisible();
 await page.getByLabel('Nueva contraseña',{exact:true}).fill('Synthetic-recovered-password-2026');
 await page.getByLabel('Repetí la nueva contraseña').fill('Synthetic-recovered-password-2026');
 await page.getByRole('button',{name:'Guardar nueva contraseña'}).click();
 await expect(page.getByRole('link',{name:'Ingresar con mi nueva contraseña'})).toBeVisible();
 expect(state.calls.filter(c=>c.method==='PUT')).toHaveLength(1);
 expect(state.calls.find(c=>c.path.endsWith('/logout')).search).toBe('?scope=global');
 expect(await page.evaluate(()=>Object.keys(localStorage))).not.toContain('velox-password-recovery');
 expect(state.errors).toEqual([]);
});
test('real SDK recovery errors allow retry without a false successful password change',async({page})=>{
 const state=await authHarness(page,{failUpdate:true,failLogout:true});
 await page.goto(callback());
 await page.getByLabel('Nueva contraseña',{exact:true}).fill('Synthetic-recovered-password-2026');
 await page.getByLabel('Repetí la nueva contraseña').fill('Synthetic-recovered-password-2026');
 await page.getByRole('button',{name:'Guardar nueva contraseña'}).click();
 await expect(page.getByRole('region',{name:'Recuperación de cuenta'}).getByRole('alert')).toContainText('No pudimos confirmar el cambio');
 expect(state.calls.filter(c=>c.path.endsWith('/logout'))).toHaveLength(0);
 await page.getByRole('button',{name:'Guardar nueva contraseña'}).click();
 await expect(page.getByRole('button',{name:'Reintentar cierre de sesiones'})).toBeVisible();
 await page.getByRole('button',{name:'Reintentar cierre de sesiones'}).click();
 await expect(page.getByRole('link',{name:'Ingresar con mi nueva contraseña'})).toBeVisible();
 expect(state.calls.filter(c=>c.method==='PUT')).toHaveLength(2);
 expect(state.errors).toEqual([]);
});
test('expired callback returns to a fresh request with the correct return URL',async({page})=>{
 const state=await authHarness(page);
 await page.goto('/recuperar-cuenta#error=access_denied&error_code=otp_expired&error_description=Expired');
 await expect(page.getByRole('region',{name:'Recuperación de cuenta'}).getByRole('alert')).toContainText('venció');
 await page.getByLabel('Email de tu cuenta').fill('recovery@example.invalid');
 await page.getByRole('button',{name:'Pedir enlace de recuperación'}).click();
 await expect(page.getByRole('status')).toContainText('Si existe una cuenta');
 const call=state.calls.find(c=>c.path.endsWith('/recover'));
 expect(new URLSearchParams(call.search).get('redirect_to')).toBe('http://127.0.0.1:3100/recuperar-cuenta');
 expect(state.calls.some(c=>c.method==='PUT')).toBe(false);
});

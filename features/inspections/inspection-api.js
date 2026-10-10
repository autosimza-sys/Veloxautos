import { supabase } from '../../lib/supabase-client';
import { fileDigest } from '../publication/publication-request';
import { validatePublicationMedia } from '../publication/publication-quality';

export const INSPECTION_SCORES = ['motor', 'caja', 'estructura', 'frenos', 'electronica', 'interior'];
export function createInspectionForm() {
  return { inspectionDate: '', odometer: '', observations: '', result: '', scores: Object.fromEntries(INSPECTION_SCORES.map(key => [key, ''])) };
}
export function validateInspectionForm(form, dashboardFile, detailFiles = [], videoFile) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.inspectionDate) || !Number.isFinite(Date.parse(form.inspectionDate)) || form.inspectionDate > new Date().toISOString().slice(0,10)) return 'Indicá una fecha válida, no futura.';
  if (!/^\d+$/.test(String(form.odometer)) || Number(form.odometer) > 2147483647) return 'Indicá el kilometraje verificado.';
  if (!['approved','observed'].includes(form.result) || !INSPECTION_SCORES.every(key => /^(10|[1-9])$/.test(String(form.scores?.[key])))) return 'Completá explícitamente las valoraciones y el resultado.';
  if (detailFiles.length > 6) return 'Se permiten hasta seis fotos de detalles.';
  for (const file of [dashboardFile, ...detailFiles]) {
    const error = validatePublicationMedia(file, 'photo');
    if (error) return error;
  }
  return videoFile ? validatePublicationMedia(videoFile,'video') : '';
}

export async function submitInspectionReport({ requestId, userId, form, dashboardFile, detailFiles = [], videoFile, client = supabase }) {
  const invalid = validateInspectionForm(form, dashboardFile, detailFiles, videoFile);
  if (invalid) throw new Error(invalid);
  if (!client || !userId || !requestId) throw new Error('Falta una revisión asignada o una sesión activa.');
  const files = [{file:dashboardFile,kind:'dashboard'}, ...detailFiles.map(file=>({file,kind:'detail'})), ...(videoFile ? [{file:videoFile,kind:'video'}] : [])];
  const extensions = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
  const media = [];
  for (const {file,kind} of files) {
    const path = `${userId}/${requestId}/${kind}-${await fileDigest(file)}.${extensions[file.type]}`;
    const {error} = await client.storage.from('inspection-media').upload(path,file,{contentType:file.type,upsert:false});
    const duplicate = String(error?.statusCode)==='409' || (String(error?.statusCode)==='400' && (error.error==='Duplicate' || error.code==='Duplicate' || /^(?:The resource already exists|Asset Already Exists)\.?$/i.test(error.message||'')));
    if(error&&!duplicate) throw new Error('No se pudo subir un archivo. El informe todavía no fue confirmado; reintentá sin cambiar los datos.');
    media.push({kind,storage_path:path});
  }
  let response;
  try {
    response = await client.rpc('submit_inspection_report',{target_request:requestId,report_payload:{inspection_date:form.inspectionDate,odometer:Number(form.odometer),scores:Object.fromEntries(INSPECTION_SCORES.map(key=>[key,Number(form.scores[key])])),observations:form.observations,result:form.result},media_payload:media});
  } catch {throw new Error('No pudimos confirmar el informe. Reintentá sin cambiar los datos.');}
  if (response.error) {
    if(response.status===0 || response.status>=500 || !response.error.code) throw new Error('No pudimos confirmar el informe. Reintentá sin cambiar los datos.');
    throw response.error;
  }
  if(!response.data?.id) throw new Error('No pudimos confirmar el informe. Reintentá sin cambiar los datos.');
  return response.data;
}

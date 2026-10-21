// Manual dependency-injected operator utility, never imported by a public route.
// No timer, CLI auto-run or scheduler. Preview is the default; no keys/log payloads.
const PROJECT = 'qcllovwetaokurkkzkry';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export async function storageCleanup({ client, projectRef, approvedPlan = null, now = Date.now() }) {
  if (projectRef !== PROJECT || !client || typeof client.supabaseUrl !== 'string'
    || client.supabaseUrl.replace(/\/$/, '') !== 'https://' + PROJECT + '.supabase.co') throw Error('Invalid maintenance target');
  if (!approvedPlan) {
    const r = await client.rpc('storage_cleanup_preview', { retention_days: 7 });
    if (r.error || !r.data) throw Error('Cleanup preview unavailable');
    return { mode: 'preview', plan: r.data };
  }
  const age = now - Date.parse(approvedPlan.generated_at);
  if (!Number.isFinite(age) || age < 0 || age > 15 * 60 * 1000
    || !Number.isInteger(approvedPlan.retention_days) || approvedPlan.retention_days < 7 || approvedPlan.retention_days > 365
    || !Array.isArray(approvedPlan.objects) || approvedPlan.objects.length > 100
    || approvedPlan.objects.some(o => !UUID.test(o.object_id || '') || !['vehicle-media','inspection-media'].includes(o.bucket)
      || typeof o.path !== 'string' || o.path.length > 300 || !UUID.test(o.path.split('/')[0]) || o.path.includes('..'))) throw Error('Invalid or stale cleanup approval');
  if (new Set(approvedPlan.objects.map(o => o.object_id)).size !== approvedPlan.objects.length
    || new Set(approvedPlan.objects.map(o => o.bucket + '/' + o.path)).size !== approvedPlan.objects.length) throw Error('Duplicate cleanup approval');
  const summary = { mode: 'manual', deleted: 0, skipped: 0, needsReconcile: 0 };
  for (const object of approvedPlan.objects) {
    try {
      const claim = await client.rpc('claim_storage_cleanup', { target_object: object.object_id, expected_bucket: object.bucket, expected_path: object.path, retention_days: approvedPlan.retention_days });
      if (claim.error || !['claimed','deleted'].includes(claim.data?.state)) { summary.skipped++; continue; }
      if (claim.data.state === 'deleted') { summary.deleted++; continue; }
      const removal = await client.storage.from(object.bucket).remove([object.path]);
      if (removal.error) { summary.needsReconcile++; continue; }
      const final = await client.rpc('complete_storage_cleanup', { target_object: object.object_id });
      if (!final.error && final.data?.state === 'deleted') summary.deleted++;
      else summary.needsReconcile++;
    } catch { summary.needsReconcile++; }
  }
  return summary;
}

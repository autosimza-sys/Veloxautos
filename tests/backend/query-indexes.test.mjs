import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {makeDatabase,asUser} from './fixtures.mjs';
test('catalog and media lookup indexes exist, preserve privacy, and reapply safely',async()=>{
 const db=await makeDatabase();try{
  const expected=['vehicles_active_catalog_idx','vehicle_media_vehicle_sort_idx','vehicle_media_storage_lookup_idx','inspection_media_report_idx','inspection_media_storage_lookup_idx'];
  const {rows}=await db.query("select indexname from pg_indexes where schemaname='public'");
  for(const name of expected)assert.ok(rows.some(row=>row.indexname===name),name);
  await db.exec(await readFile(new URL('../../supabase/migrations/202610030009_query_indexes.sql',import.meta.url),'utf8'));
  await db.exec('begin');await asUser(db,null);
  assert.equal((await db.query('select * from vehicles')).rows.length,0);
  assert.equal((await db.query('select * from vehicle_media')).rows.length,2);
  await db.exec('rollback');
 }finally{await db.close();}
});

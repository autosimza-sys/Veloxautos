import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { asUser, denied, ids, makeDatabase, root } from "./fixtures.mjs";

let db;
const requestId = "70000000-0000-0000-0000-000000000001";
const payload = {
  brand: "Toyota", model: "Corolla", version: "XEI", year: 2020,
  kilometers: 10000, price: 20000000, zone: "Mendoza", checklist: {}, score: 5,
};
const media = Array.from({ length: 4 }, (_, index) => ({
  media_type: "photo", storage_path: `${ids.seller}/publication-test/photo-${index}.jpg`, sort_order: index,
}));

before(async () => { db = await makeDatabase(); });
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("begin");
  for (const item of media) {
    await db.query("insert into storage.objects(bucket_id,name,metadata) values ('vehicle-media',$1,$2)", [item.storage_path, { mimetype: "image/jpeg", size: 1024 }]);
  }
});
afterEach(async () => { await db.exec("rollback; reset role"); });

async function publish(data = payload, files = media, id = requestId) {
  return db.query("select * from public.publish_vehicle_with_credit($1,$2,$3)", [data, files, id]);
}
async function used() {
  return (await db.query("select used from public.credit_balances where user_id=$1", [ids.seller])).rows[0].used;
}

test("atomic publication creates the vehicle, four media links and one debit", async () => {
  await asUser(db, ids.seller);
  const beforeUsed = await used();
  const result = await publish();
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].owner_id, ids.seller);
  assert.equal(result.rows[0].status, "active");
  assert.equal((await db.query("select * from public.vehicle_media where vehicle_id=$1", [result.rows[0].id])).rows.length, 4);
  assert.equal(await used(), beforeUsed + 1);
  assert.equal((await db.query("select * from public.credit_ledger where reference_id=$1 and kind='publication'", [result.rows[0].id])).rows.length, 1);
});

test("identical retry returns the same vehicle without another credit or media insert", async () => {
  await asUser(db, ids.seller);
  const first = await publish();
  const second = await publish();
  assert.equal(first.rows[0].id, second.rows[0].id);
  assert.equal(await used(), 1);
  assert.equal((await db.query("select * from public.vehicle_media where vehicle_id=$1", [first.rows[0].id])).rows.length, 4);
});

test("same request ID with a different payload is rejected without another debit", async () => {
  await asUser(db, ids.seller);
  await publish();
  await denied(db, () => publish({ ...payload, price: payload.price + 1 }), assert);
  assert.equal(await used(), 1);
});

test("same request ID with different media is rejected", async () => {
  await asUser(db, ids.seller);
  await publish();
  await denied(db, () => publish(payload, [...media].reverse()), assert);
  assert.equal(await used(), 1);
});

test("failure inserting media rolls back vehicle, balance, ledger and request record", async () => {
  await db.exec(`create function public.fail_test_media() returns trigger language plpgsql as $$
    begin if new.storage_path like '%photo-3.jpg' then raise exception 'Synthetic media failure' using errcode='23514'; end if; return new; end $$;
    create trigger fail_test_media before insert on public.vehicle_media for each row execute function public.fail_test_media();`);
  await asUser(db, ids.seller);
  await denied(db, () => publish(), assert);
  assert.equal(await used(), 0);
  assert.equal((await db.query("select * from public.vehicles where model='Corolla'")).rows.length, 0);
  assert.equal((await db.query("select * from public.publication_requests")).rows.length, 0);
  assert.equal((await db.query("select * from public.credit_ledger where kind='publication'")).rows.length, 0);
});

test("less than four photos, duplicate objects and foreign objects are rejected", async () => {
  await asUser(db, ids.seller);
  for (const files of [media.slice(0, 3), [media[0], media[0], media[2], media[3]],
    [...media.slice(0, 3), { ...media[3], storage_path: `${ids.stranger}/${ids.otherCar}.jpg` }]]) {
    await denied(db, () => publish(payload, files), assert);
  }
  assert.equal(await used(), 0);
});

test("missing objects, invalid media types and duplicate sort indexes are rejected", async () => {
  await asUser(db, ids.seller);
  for (const changed of [
    { storage_path: `${ids.seller}/missing.jpg` }, { media_type: "document" }, { sort_order: 0 },
  ]) {
    await denied(db, () => publish(payload, [...media.slice(0, 3), { ...media[3], ...changed }]), assert);
  }
  assert.equal(await used(), 0);
});

test("oversized objects and incompatible stored MIME types are rejected", async () => {
  await db.query("update storage.objects set metadata=$1 where name=$2", [{ mimetype: "text/html", size: 1024 }, media[0].storage_path]);
  await asUser(db, ids.seller);
  await denied(db, () => publish(), assert);
  await db.exec("reset role");
  await db.query("update storage.objects set metadata=$1 where name=$2", [{ mimetype: "image/jpeg", size: 3 * 1024 * 1024 + 1 }, media[0].storage_path]);
  await asUser(db, ids.seller);
  await denied(db, () => publish(), assert);
  assert.equal(await used(), 0);
});

test("one optional video is accepted, two videos are rejected", async () => {
  const videos = [0, 1].map(index => ({ media_type: "video", storage_path: `${ids.seller}/video-${index}.mp4`, sort_order: 4 + index }));
  for (const video of videos) await db.query("insert into storage.objects(bucket_id,name,metadata) values ('vehicle-media',$1,$2)", [video.storage_path, { mimetype: "video/mp4", size: 4096 }]);
  await asUser(db, ids.seller);
  await denied(db, () => publish(payload, [...media, ...videos]), assert);
  const result = await publish(payload, [...media, videos[0]]);
  assert.equal((await db.query("select * from public.vehicle_media where vehicle_id=$1", [result.rows[0].id])).rows.length, 5);
});

test("invalid publication fields are rejected before any debit", async () => {
  await asUser(db, ids.seller);
  for (const changed of [
    { price: -1 }, { price: 0 }, { price: 2147483648 }, { kilometers: -1 }, { year: 100 },
    { year: 2020.5 }, { brand: "  " }, { zone: "" }, { checklist: [] },
  ]) await denied(db, () => publish({ ...payload, ...changed }), assert);
  assert.equal(await used(), 0);
});

test("deleted publication retry is rejected rather than creating or charging again", async () => {
  await asUser(db, ids.seller);
  const result = await publish();
  // Browser clients can only retire recoverably. Model trusted maintenance here.
  await db.exec("reset role; select set_config('request.jwt.claim.sub','',true)");
  await db.query("delete from public.vehicles where id=$1", [result.rows[0].id]);
  await asUser(db, ids.seller);
  await denied(db, () => publish(), assert);
  assert.equal(await used(), 1);
});

test("request registry is private, immutable to clients and unavailable to anon", async () => {
  await asUser(db, ids.seller);
  await publish();
  await denied(db, () => db.query("delete from public.publication_requests"), assert);
  await denied(db, () => db.query("update public.publication_requests set vehicle_id=null"), assert);
  await asUser(db, ids.stranger);
  assert.equal((await db.query("select * from public.publication_requests")).rows.length, 0);
  await asUser(db, null);
  await denied(db, () => db.query("select * from public.publication_requests"), assert);
  await denied(db, () => publish(), assert);
});

test("an unprivileged user cannot publish even with owned object names", async () => {
  await asUser(db, ids.buyer);
  await denied(db, () => publish(), assert);
});

test("eight photos and one video is the accepted upper bound", async () => {
  const extra = Array.from({ length: 5 }, (_, index) => ({
    media_type: index === 4 ? "video" : "photo",
    storage_path: `${ids.seller}/extra-${index}.${index === 4 ? "mp4" : "jpg"}`,
    sort_order: index + 4,
  }));
  for (const item of extra) await db.query("insert into storage.objects(bucket_id,name,metadata) values ('vehicle-media',$1,$2)", [item.storage_path, { mimetype: item.media_type === "photo" ? "image/jpeg" : "video/mp4", size: 1024 }]);
  await asUser(db, ids.seller);
  const result = await publish(payload, [...media, ...extra]);
  assert.equal((await db.query("select * from public.vehicle_media where vehicle_id=$1", [result.rows[0].id])).rows.length, 9);
});

test("nine photos are rejected even though nine total objects can be allowed", async () => {
  const extra = Array.from({ length: 5 }, (_, index) => ({ ...media[0], storage_path: `${ids.seller}/extra-${index}.jpg`, sort_order: index + 4 }));
  await asUser(db, ids.seller);
  await denied(db, () => publish(payload, [...media, ...extra]), assert);
  assert.equal(await used(), 0);
});

test("retry after credit expiration returns the existing publication without a new debit", async () => {
  await asUser(db, ids.seller);
  const first = await publish();
  await db.exec("reset role");
  await db.query("update public.credit_balances set expires_at=now()-interval '1 day' where user_id=$1", [ids.seller]);
  await asUser(db, ids.seller);
  assert.equal((await publish()).rows[0].id, first.rows[0].id);
  assert.equal(await used(), 1);
});

test("different sellers can use the same request UUID without sharing records", async () => {
  for (const item of media) await db.query("insert into storage.objects(bucket_id,name,metadata) values ('vehicle-media',$1,$2)", [item.storage_path.replace(ids.seller, ids.stranger), { mimetype: "image/jpeg", size: 1024 }]);
  await asUser(db, ids.seller);
  const first = await publish();
  await asUser(db, ids.stranger);
  const second = await publish(payload, media.map(item => ({ ...item, storage_path: item.storage_path.replace(ids.seller, ids.stranger) })));
  assert.notEqual(first.rows[0].id, second.rows[0].id);
  assert.equal(second.rows[0].owner_id, ids.stranger);
  assert.equal((await db.query("select * from public.publication_requests")).rows.length, 1);
});

test("atomic RPC still works after the planned legacy EXECUTE revocation", async () => {
  await db.exec("revoke execute on function public.create_vehicle_with_credit(jsonb) from authenticated");
  await asUser(db, ids.seller);
  await denied(db, () => db.query("select * from public.create_vehicle_with_credit($1)", [payload]), assert);
  assert.equal((await publish()).rows.length, 1);
  assert.equal(await used(), 1);
});

test("atomic migration can be reapplied without resetting idempotency records", async () => {
  const isolated = await makeDatabase();
  try {
    await isolated.exec("begin");
    for (const item of media) await isolated.query("insert into storage.objects(bucket_id,name,metadata) values ('vehicle-media',$1,$2)", [item.storage_path, { mimetype: "image/jpeg", size: 1024 }]);
    await asUser(isolated, ids.seller);
    const published = await isolated.query("select * from public.publish_vehicle_with_credit($1,$2,$3)", [payload, media, requestId]);
    await isolated.exec("commit; reset role");
    await isolated.exec(await readFile(path.join(root, "supabase/migrations/202610030002_atomic_publication.sql"), "utf8"));
    assert.equal((await isolated.query("select count(*)::int as count from public.vehicles")).rows[0].count, 4);
    assert.equal((await isolated.query("select vehicle_id from public.publication_requests where request_id=$1", [requestId])).rows[0].vehicle_id, published.rows[0].id);
    assert.equal((await isolated.query("select count(*)::int as count from public.credit_ledger where kind='initial_grant'")).rows[0].count, 2);
    assert.equal((await isolated.query("select used from public.credit_balances where user_id=$1", [ids.seller])).rows[0].used, 1);
  } finally {
    await isolated.close();
  }
});

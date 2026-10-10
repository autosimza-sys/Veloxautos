import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const ids = {
  seller: "10000000-0000-0000-0000-000000000001",
  buyer: "10000000-0000-0000-0000-000000000002",
  stranger: "10000000-0000-0000-0000-000000000003",
  mechanic: "10000000-0000-0000-0000-000000000004",
  admin: "10000000-0000-0000-0000-000000000005",
  blocked: "10000000-0000-0000-0000-000000000006",
  car: "20000000-0000-0000-0000-000000000001",
  otherCar: "20000000-0000-0000-0000-000000000002",
  pausedCar: "20000000-0000-0000-0000-000000000003",
  conversation: "30000000-0000-0000-0000-000000000001",
  request: "40000000-0000-0000-0000-000000000001",
  report: "50000000-0000-0000-0000-000000000001",
};

// These are local, synthetic Supabase platform primitives, not account credentials.
// The application SQL is loaded unchanged. No network connection is used.
const bootstrap = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id), name text not null,
    metadata jsonb not null default '{}'
  );
  create function storage.foldername(name text) returns text[]
    language sql immutable as $$
      select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1]
    $$;
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant all on all tables in schema storage to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  create publication supabase_realtime;
`;

export async function makeDatabase({ legacy = false, productionDrift = false } = {}) {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(bootstrap);
  await db.exec(await readFile(path.join(root, "supabase/schema.sql"), "utf8"));
  const files = (await readdir(path.join(root, "supabase/migrations")))
    .filter((file) => file.endsWith(".sql"))
    .filter((file) => !legacy || file.startsWith("20260623"))
    .sort();
  let appliedDrift = false;
  const applyDrift = async () => {
    await db.exec(await readFile(path.join(root, "tests/backend/fixtures/observed-policy-drift.sql"), "utf8"));
    appliedDrift = true;
  };
  for (const file of files) {
    try {
      if (productionDrift && !appliedDrift && !file.startsWith("20260623")) await applyDrift();
      await db.exec(await readFile(path.join(root, "supabase/migrations", file), "utf8"));
    } catch (error) {
      await db.close();
      throw new Error(`Migration ${file}: ${error.message}`, { cause: error });
    }
  }
  if (productionDrift && !appliedDrift) await applyDrift();

  for (const [name, id] of Object.entries(ids).slice(0, 6)) {
    await db.query("insert into auth.users values ($1, $2, $3)", [id, `${name}@example.invalid`, {
      display_name: name,
      phone: `test-${name}-phone`,
      role: ["seller", "stranger"].includes(name) ? "particular" : "registered",
    }]);
  }
  await db.query("update public.profiles set role='mechanic' where id=$1", [ids.mechanic]);
  await db.query("update public.profiles set role='admin' where id=$1", [ids.admin]);
  await db.query("update public.profiles set is_blocked=true where id=$1", [ids.blocked]);
  for (const [id, owner, status] of [
    [ids.car, ids.seller, "active"], [ids.otherCar, ids.stranger, "active"],
    [ids.pausedCar, ids.seller, "paused"],
  ]) {
    await db.query(`insert into public.vehicles
      (id,owner_id,status,brand,model,version,year,kilometers,price,zone)
      values ($1,$2,$3,'Test','Car','Base',2020,12345,1000000,'Mendoza')`, [id, owner, status]);
    await db.query("insert into storage.objects(bucket_id,name) values ('vehicle-media',$1)", [`${owner}/${id}.jpg`]);
    await db.query("insert into public.vehicle_media(vehicle_id,media_type,storage_path) values ($1,'photo',$2)", [id, `${owner}/${id}.jpg`]);
  }
  await db.query(`insert into public.conversations(id,vehicle_id,buyer_id,seller_id)
    values ($1,$2,$3,$4)`, [ids.conversation, ids.car, ids.buyer, ids.seller]);
  await db.query(`insert into public.inspection_requests(id,vehicle_id,requested_by,assigned_mechanic,status)
    values ($1,$2,$3,$4,'assigned')`, [ids.request, ids.car, ids.buyer, ids.mechanic]);
  await db.query(`insert into public.inspection_reports(id,request_id,mechanic_id,odometer,result)
    values ($1,$2,$3,12345,'approved')`, [ids.report, ids.request, ids.mechanic]);
  const reportPath = `${ids.mechanic}/${ids.request}/dashboard.jpg`;
  await db.query("insert into storage.objects(bucket_id,name) values ('inspection-media',$1)", [reportPath]);
  await db.query("insert into public.inspection_media(report_id,kind,storage_path) values ($1,'dashboard',$2)", [ids.report, reportPath]);
  return db;
}

export async function asUser(db, id) {
  await db.exec(`set local role ${id ? "authenticated" : "anon"}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id || ""]);
}

export async function denied(db, run, assert) {
  await db.exec("savepoint expected_denial");
  try {
    await assert.rejects(run, (error) => ["42501", "P0001", "23514"].includes(error.code));
  } finally {
    await db.exec("rollback to savepoint expected_denial");
  }
}

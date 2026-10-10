-- Lookup-only optimization. No data, roles, policies or commercial rules change.
begin;
create index if not exists vehicles_active_catalog_idx
  on public.vehicles(created_at desc) where status='active';
create index if not exists vehicle_media_vehicle_sort_idx
  on public.vehicle_media(vehicle_id,sort_order);
create index if not exists vehicle_media_storage_lookup_idx
  on public.vehicle_media(storage_path,vehicle_id);
create index if not exists inspection_media_report_idx
  on public.inspection_media(report_id);
create index if not exists inspection_media_storage_lookup_idx
  on public.inspection_media(storage_path,report_id);
commit;

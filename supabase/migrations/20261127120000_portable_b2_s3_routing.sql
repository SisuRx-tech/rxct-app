-- Portable exports: retain legacy native-B2 objects while routing new exports
-- to the configured S3-compatible B2 bucket.

alter table public.rxct_portable_exports
  add column if not exists request_id uuid,
  add column if not exists storage_provider text not null default 'b2-native'
    check (storage_provider in ('b2-native', 'b2-s3')),
  add column if not exists storage_bucket text not null default 'legacy';

alter table public.rxct_portable_export_items
  add column if not exists storage_provider text not null default 'b2-native'
    check (storage_provider in ('b2-native', 'b2-s3')),
  add column if not exists storage_bucket text not null default 'legacy';

alter table public.rxct_portable_objects
  add column if not exists storage_provider text not null default 'b2-native'
    check (storage_provider in ('b2-native', 'b2-s3')),
  add column if not exists storage_bucket text not null default 'legacy';

alter table public.rxct_portable_objects
  drop constraint if exists rxct_portable_objects_pkey;

alter table public.rxct_portable_objects
  drop constraint if exists rxct_portable_objects_object_key_key;

alter table public.rxct_portable_objects
  add constraint rxct_portable_objects_pkey
    primary key (content_hash, storage_provider, storage_bucket),
  add constraint rxct_portable_objects_location_key
    unique (storage_provider, storage_bucket, object_key);

create index if not exists rxct_portable_objects_location_idx
  on public.rxct_portable_objects(storage_provider, storage_bucket, object_key);

create unique index if not exists rxct_portable_exports_owner_request_idx
  on public.rxct_portable_exports(owner_id, request_id)
  where request_id is not null;

create index if not exists rxct_portable_export_items_location_idx
  on public.rxct_portable_export_items(storage_provider, storage_bucket, object_key);

-- B2 deletion must be performed by the Edge Function. Keep this legacy
-- callable for compatibility, but prevent a database cron from deleting
-- references without first deleting the corresponding B2 objects.
create or replace function public.purge_expired_portable_exports()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return 0;
end;
$$;

revoke all on function public.purge_expired_portable_exports() from public;

-- Portable local-library exports.
-- Supabase stores ownership, manifests and references only. PDF bytes live in
-- a private Backblaze B2 bucket through the server-side Edge Function.

create table if not exists public.rxct_portable_exports (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  schema_version integer not null default 1,
  status text not null default 'preparing'
    check (status in ('preparing', 'ready', 'expired', 'failed')),
  manifest jsonb not null default '{}'::jsonb,
  total_documents integer not null default 0 check (total_documents >= 0),
  total_bytes bigint not null default 0 check (total_bytes >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  last_accessed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days')
);

create table if not exists public.rxct_portable_export_items (
  export_id uuid not null references public.rxct_portable_exports(id) on delete cascade,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  object_key text not null,
  display_name text not null,
  file_size bigint not null check (file_size > 0),
  mime_type text not null default 'application/pdf',
  metadata jsonb not null default '{}'::jsonb,
  primary key (export_id, content_hash)
);

create table if not exists public.rxct_portable_objects (
  content_hash text primary key check (content_hash ~ '^[a-f0-9]{64}$'),
  object_key text not null unique,
  file_size bigint not null check (file_size > 0),
  mime_type text not null default 'application/pdf',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists rxct_portable_exports_owner_idx
  on public.rxct_portable_exports(owner_id, created_at desc);
create index if not exists rxct_portable_exports_expiry_idx
  on public.rxct_portable_exports(expires_at);
create index if not exists rxct_portable_export_items_hash_idx
  on public.rxct_portable_export_items(content_hash);

alter table public.rxct_portable_exports enable row level security;
alter table public.rxct_portable_export_items enable row level security;
alter table public.rxct_portable_objects enable row level security;

create policy "Owners read portable exports"
  on public.rxct_portable_exports for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Owners delete portable exports"
  on public.rxct_portable_exports for delete to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Owners read portable export items"
  on public.rxct_portable_export_items for select to authenticated
  using (exists (
    select 1 from public.rxct_portable_exports e
    where e.id = export_id and e.owner_id = (select auth.uid())
  ));

revoke all on public.rxct_portable_exports from anon, authenticated;
revoke all on public.rxct_portable_export_items from anon, authenticated;
revoke all on public.rxct_portable_objects from anon, authenticated;
grant select, delete on public.rxct_portable_exports to authenticated;
grant select on public.rxct_portable_export_items to authenticated;

create or replace function public.purge_expired_portable_exports()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare removed integer;
begin
  delete from public.rxct_portable_exports
   where expires_at <= now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_expired_portable_exports() from public;

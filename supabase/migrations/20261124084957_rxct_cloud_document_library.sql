-- RxCT cloud document library
-- Canonical document blobs are shared; library entries remain user-specific.
-- Storage remains private. Browser clients never receive service-role access.

create extension if not exists pgcrypto;

create table if not exists public.rxct_documents (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null unique
    check (content_hash ~ '^[a-f0-9]{64}$'),
  storage_path text not null unique,
  mime_type text not null default 'application/pdf'
    check (mime_type = 'application/pdf'),
  file_size bigint not null check (file_size > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.rxct_library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.rxct_documents(id) on delete restrict,
  display_name text not null check (
    length(trim(display_name)) between 1 and 255
  ),
  course_id text,
  assignment_status text not null default 'unassigned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz,
  last_opened_section text,
  progress jsonb not null default '{}'::jsonb,
  unique (user_id, document_id)
);

alter table public.rxct_library_items
  add column if not exists last_opened_at timestamptz,
  add column if not exists last_opened_section text,
  add column if not exists progress jsonb not null default '{}'::jsonb;

create or replace function public.rxct_touch_library_item()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rxct_touch_library_item on public.rxct_library_items;
create trigger rxct_touch_library_item
before update on public.rxct_library_items
for each row execute function public.rxct_touch_library_item();

create index if not exists rxct_library_items_user_idx
  on public.rxct_library_items(user_id);

create index if not exists rxct_library_items_document_idx
  on public.rxct_library_items(document_id);

create table if not exists public.rxct_document_shares (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create table if not exists public.rxct_document_share_items (
  share_id uuid not null references public.rxct_document_shares(id) on delete cascade,
  document_id uuid not null references public.rxct_documents(id) on delete restrict,
  display_name text not null,
  course_id text,
  primary key (share_id, document_id)
);

create table if not exists public.rxct_document_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.rxct_documents(id) on delete cascade,
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, document_id)
);

alter table public.rxct_documents enable row level security;
alter table public.rxct_library_items enable row level security;
alter table public.rxct_document_shares enable row level security;
alter table public.rxct_document_share_items enable row level security;
alter table public.rxct_document_access enable row level security;

-- No direct browser writes to canonical document records.
revoke all on public.rxct_documents from anon, authenticated;
revoke all on public.rxct_document_access from anon, authenticated;

-- Users can only see and edit their own library entries.
drop policy if exists "Users read own RxCT library items"
  on public.rxct_library_items;
create policy "Users read own RxCT library items"
  on public.rxct_library_items for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users update own RxCT library items"
  on public.rxct_library_items;
create policy "Users update own RxCT library items"
  on public.rxct_library_items for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own RxCT library items"
  on public.rxct_library_items;
create policy "Users delete own RxCT library items"
  on public.rxct_library_items for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Share owners can manage their own share records.
drop policy if exists "Users read own RxCT document shares"
  on public.rxct_document_shares;
create policy "Users read own RxCT document shares"
  on public.rxct_document_shares for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Users delete own RxCT document shares"
  on public.rxct_document_shares;
create policy "Users delete own RxCT document shares"
  on public.rxct_document_shares for delete to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Owners read own RxCT share items"
  on public.rxct_document_share_items;
create policy "Owners read own RxCT share items"
  on public.rxct_document_share_items for select to authenticated
  using (
    exists (
      select 1
      from public.rxct_document_shares s
      where s.id = share_id
        and s.owner_id = (select auth.uid())
    )
  );

-- Only the server-side service role creates documents, library entries,
-- shares and access grants. Do not grant browser INSERT permissions here.

grant select, update, delete
  on public.rxct_library_items to authenticated;
grant select, delete
  on public.rxct_document_shares to authenticated;
grant select
  on public.rxct_document_share_items to authenticated;

-- Storage bucket for canonical PDFs. It must remain PRIVATE.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rxct-documents',
  'rxct-documents',
  false,
  83886080,
  array['application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = 83886080,
    allowed_mime_types = array['application/pdf'];

-- A user may read a canonical PDF only while they have a library reference
-- or an explicit access grant.
drop policy if exists "Authorized users read RxCT documents"
  on storage.objects;

create policy "Authorized users read RxCT documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'rxct-documents'
    and (
      exists (
        select 1
        from public.rxct_documents d
        join public.rxct_library_items i on i.document_id = d.id
        where d.storage_path = name
          and i.user_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.rxct_documents d
        join public.rxct_document_access a on a.document_id = d.id
        where d.storage_path = name
          and a.user_id = (select auth.uid())
      )
    )
  );

-- Browser users cannot upload, overwrite or delete canonical objects.
drop policy if exists "Users upload own RxCT documents"
  on storage.objects;
drop policy if exists "Users update own RxCT documents"
  on storage.objects;
drop policy if exists "Users delete own RxCT documents"
  on storage.objects;

-- Prevent accidental exposure through broad default privileges.
revoke all on public.rxct_documents from anon;
revoke all on public.rxct_library_items from anon;
revoke all on public.rxct_document_shares from anon;
revoke all on public.rxct_document_share_items from anon;
revoke all on public.rxct_document_access from anon;

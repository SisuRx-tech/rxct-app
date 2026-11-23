-- Expiring RxCT library links. Storage cleanup can be run by Supabase Cron:
-- select public.purge_expired_library_shares();
create table if not exists public.library_shares (
  token uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  last_accessed_at timestamptz
);

insert into storage.buckets (id, name, public)
values ('rxct-library-shares', 'rxct-library-shares', true)
on conflict (id) do update set public = true;

create policy "authenticated users can upload their library shares"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'rxct-library-shares'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

alter table public.library_shares enable row level security;

create policy "owners can create library shares"
  on public.library_shares for insert
  with check (auth.uid() = owner_id);

create policy "owners can view library shares"
  on public.library_shares for select
  using (auth.uid() = owner_id);

create or replace function public.resolve_library_share(share_token uuid)
returns table(storage_path text)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.library_shares
     set last_accessed_at = now(),
         expires_at = now() + interval '7 days'
   where token = share_token
     and expires_at > now();
  return query
    select s.storage_path
      from public.library_shares s
     where s.token = share_token
       and s.expires_at > now();
end;
$$;

revoke all on function public.resolve_library_share(uuid) from public;
grant execute on function public.resolve_library_share(uuid) to authenticated;

create or replace function public.purge_expired_library_shares()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare removed integer;
begin
  delete from public.library_shares where expires_at <= now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_expired_library_shares() from public;

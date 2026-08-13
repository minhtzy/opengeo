create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan_tier text not null default 'starter',
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  website text not null,
  created_at timestamptz not null default now()
);
alter table public.brands add column if not exists website text not null default '';

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists memberships_user_idx on public.memberships(user_id);
create index if not exists brands_org_idx on public.brands(org_id);
create index if not exists prompts_brand_idx on public.prompts(brand_id, active);

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.memberships where org_id = target_org and user_id = auth.uid())
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, name) values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do update set email = excluded.email, name = excluded.name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update on auth.users
for each row execute procedure public.handle_new_user();

alter table public.users enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.brands enable row level security;
alter table public.prompts enable row level security;

drop policy if exists users_self on public.users;
create policy users_self on public.users for select using (id = auth.uid());
drop policy if exists organizations_member on public.organizations;
create policy organizations_member on public.organizations for select using (public.is_org_member(id));
drop policy if exists organizations_create on public.organizations;
create policy organizations_create on public.organizations for insert with check (auth.uid() is not null);
drop policy if exists memberships_self on public.memberships;
create policy memberships_self on public.memberships for select using (user_id = auth.uid());
drop policy if exists memberships_create_self on public.memberships;
create policy memberships_create_self on public.memberships for insert with check (user_id = auth.uid());
drop policy if exists brands_member on public.brands;
create policy brands_member on public.brands for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists prompts_member on public.prompts;
create policy prompts_member on public.prompts for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

grant select, insert, update on public.users, public.organizations, public.memberships, public.brands, public.prompts to authenticated;

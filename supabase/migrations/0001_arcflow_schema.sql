create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  privy_id text unique not null,
  wallet_address text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  file_name text not null,
  mime_type text,
  byte_size bigint,
  content_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  sender_privy_id text,
  recipient_privy_id text,
  sender_wallet text,
  recipient_wallet text,
  recipient_identifier text,
  amount_usdc numeric(18, 6) not null check (amount_usdc > 0),
  target_asset text not null default 'USDC',
  note text,
  tx_hash text,
  receipt_id uuid references public.receipts(id) on delete set null,
  claim_code text unique not null,
  status text not null default 'pending_claim' check (status in ('pending_claim', 'sending', 'completed', 'claimed', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  claimed_at timestamptz
);

create table if not exists public.flow_links (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  creator_privy_id text,
  creator_wallet text,
  amount_usdc numeric(18, 6) not null check (amount_usdc > 0),
  note text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists transactions_sender_wallet_idx on public.transactions(lower(sender_wallet));
create index if not exists transactions_recipient_wallet_idx on public.transactions(lower(recipient_wallet));
create index if not exists transactions_claim_code_idx on public.transactions(claim_code);
create index if not exists flow_links_slug_idx on public.flow_links(slug);

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

alter table public.users enable row level security;
alter table public.receipts enable row level security;
alter table public.transactions enable row level security;
alter table public.flow_links enable row level security;

drop policy if exists "public can read active flow links" on public.flow_links;
create policy "public can read active flow links"
on public.flow_links for select
using (active = true);

drop policy if exists "public can create flow links" on public.flow_links;
create policy "public can create flow links"
on public.flow_links for insert
with check (true);

drop policy if exists "public can read claim transactions" on public.transactions;
create policy "public can read claim transactions"
on public.transactions for select
using (claim_code is not null);

drop policy if exists "public can create transactions" on public.transactions;
create policy "public can create transactions"
on public.transactions for insert
with check (true);

drop policy if exists "public can update claim and tx status" on public.transactions;
create policy "public can update claim and tx status"
on public.transactions for update
using (claim_code is not null)
with check (claim_code is not null);

drop policy if exists "public can create users" on public.users;
create policy "public can create users"
on public.users for insert
with check (true);

drop policy if exists "public can update users" on public.users;
create policy "public can update users"
on public.users for update
using (true)
with check (true);

drop policy if exists "public can create receipts" on public.receipts;
create policy "public can create receipts"
on public.receipts for insert
with check (true);

drop policy if exists "public can read receipts" on public.receipts;
create policy "public can read receipts"
on public.receipts for select
using (true);

drop policy if exists "public receipt uploads" on storage.objects;
create policy "public receipt uploads"
on storage.objects for insert
with check (bucket_id = 'receipts');

drop policy if exists "public receipt reads" on storage.objects;
create policy "public receipt reads"
on storage.objects for select
using (bucket_id = 'receipts');

-- This Vite-only MVP talks to Supabase directly from the browser. Before handling real funds,
-- move writes behind Supabase Edge Functions or a small API service that verifies Privy JWTs.

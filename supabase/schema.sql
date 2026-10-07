-- INVESTIQ account data. Run this once in Supabase SQL Editor.
-- The app uses paper money only; this schema does not connect to a broker.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  age smallint check (age is null or age between 13 and 100),
  risk_level text not null default 'Moderate' check (risk_level in ('Conservative', 'Moderate', 'Aggressive')),
  investment_goal text not null default 'Wealth Creation',
  investment_horizon text not null default '3-5 Years',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  balance numeric(16, 2) not null default 100000 check (balance >= 0),
  initial_balance numeric(16, 2) not null default 100000 check (initial_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bring forward wallets created by earlier versions of the app. Adding these
-- columns is safe to rerun and lets existing users recover without recreating
-- their accounts. `user_id` must already identify the wallet owner.
alter table public.wallets add column if not exists id uuid default gen_random_uuid();
alter table public.wallets add column if not exists balance numeric(16, 2) not null default 100000;
alter table public.wallets add column if not exists initial_balance numeric(16, 2) not null default 100000;
alter table public.wallets add column if not exists created_at timestamptz not null default now();
alter table public.wallets add column if not exists updated_at timestamptz not null default now();

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  quantity numeric(16, 4) not null check (quantity > 0),
  average_price numeric(16, 4) not null check (average_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  order_type text not null check (order_type in ('BUY', 'SELL')),
  quantity numeric(16, 4) not null check (quantity > 0),
  price numeric(16, 4) not null check (price >= 0),
  total_value numeric(16, 2) not null check (total_value >= 0),
  status text not null default 'EXECUTED',
  created_at timestamptz not null default now()
);

create table if not exists public.sip_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  symbol text not null,
  amount numeric(16, 2) not null check (amount >= 500),
  frequency text not null default 'MONTHLY' check (frequency in ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY')),
  start_date date not null default current_date,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAUSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create index if not exists holdings_user_id_idx on public.holdings(user_id);
create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists sip_plans_user_created_idx on public.sip_plans(user_id, created_at desc);
create index if not exists watchlist_items_user_created_idx on public.watchlist_items(user_id, created_at desc);
create unique index if not exists wallets_user_id_unique_idx on public.wallets(user_id);
create unique index if not exists holdings_user_symbol_unique_idx on public.holdings(user_id, symbol);

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.holdings enable row level security;
alter table public.orders enable row level security;
alter table public.sip_plans enable row level security;
alter table public.watchlist_items enable row level security;

do $$ begin
  create policy "profiles_select_own" on public.profiles for select to authenticated using (id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "profiles_update_own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "wallets_select_own" on public.wallets for select to authenticated using (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "holdings_select_own" on public.holdings for select to authenticated using (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "orders_select_own" on public.orders for select to authenticated using (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "sip_plans_select_own" on public.sip_plans for select to authenticated using (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "sip_plans_insert_own" on public.sip_plans for insert to authenticated with check (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "sip_plans_update_own" on public.sip_plans for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "sip_plans_delete_own" on public.sip_plans for delete to authenticated using (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "watchlist_select_own" on public.watchlist_items for select to authenticated using (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "watchlist_insert_own" on public.watchlist_items for insert to authenticated with check (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "watchlist_delete_own" on public.watchlist_items for delete to authenticated using (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;

-- User-owned wallet balances and trades must only change through the atomic RPC.
revoke insert, update, delete on public.wallets, public.holdings, public.orders from anon, authenticated;
grant select on public.wallets, public.holdings, public.orders to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.sip_plans to authenticated;
grant select, insert, delete on public.watchlist_items to authenticated;

-- New accounts receive their own profile and ₹1,00,000 paper wallet.
-- Existing signed-in users can also repair a missing wallet through this
-- session-bound RPC. User-supplied IDs are never accepted.
create or replace function public.ensure_paper_wallet()
returns table (id uuid, balance numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Sign in to set up your paper wallet.'; end if;

  insert into public.wallets (user_id, balance, initial_balance)
  values (v_user_id, 100000, 100000)
  on conflict (user_id) do nothing;

  return query select w.id, w.balance from public.wallets as w where w.user_id = v_user_id;
end;
$$;

revoke all on function public.ensure_paper_wallet() from public, anon;
grant execute on function public.ensure_paper_wallet() to authenticated;

create or replace function public.initialize_investiq_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.email, ''))
  on conflict (id) do nothing;

  insert into public.wallets (user_id, balance, initial_balance)
  values (new.id, 100000, 100000)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_investiq on auth.users;
create trigger on_auth_user_created_investiq
  after insert on auth.users
  for each row execute procedure public.initialize_investiq_account();

-- Backfill users created before this schema was installed.
insert into public.profiles (id, full_name, email)
select id, coalesce(raw_user_meta_data ->> 'full_name', ''), coalesce(email, '')
from auth.users on conflict (id) do nothing;
insert into public.wallets (user_id, balance, initial_balance)
select id, 100000, 100000 from auth.users on conflict (user_id) do nothing;

-- Atomic paper trade: row locks protect cash and holdings from concurrent requests.
create or replace function public.execute_paper_order(
  p_symbol text,
  p_order_type text,
  p_quantity numeric,
  p_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_symbol text := upper(trim(p_symbol));
  v_side text := upper(trim(p_order_type));
  v_wallet public.wallets%rowtype;
  v_holding public.holdings%rowtype;
  v_order_id uuid;
  v_total numeric(16, 2);
begin
  if v_user_id is null then raise exception 'Sign in to place a paper trade.'; end if;
  if v_symbol !~ '^[A-Z0-9.-]{1,24}$' then raise exception 'Invalid stock symbol.'; end if;
  if v_side not in ('BUY', 'SELL') then raise exception 'Order side must be BUY or SELL.'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 or p_quantity <> trunc(p_quantity) then raise exception 'Quantity must be a whole number between 1 and 1,000,000.'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Price must be greater than zero.'; end if;

  v_total := round(p_quantity * p_price, 2);
  select * into v_wallet from public.wallets where user_id = v_user_id for update;
  if not found then raise exception 'Paper wallet not found. Complete your investor profile first.'; end if;

  if v_side = 'BUY' then
    if v_wallet.balance < v_total then raise exception 'Insufficient virtual cash.'; end if;
    update public.wallets set balance = balance - v_total, updated_at = now() where id = v_wallet.id;
    insert into public.holdings as current_holding (user_id, symbol, quantity, average_price)
      values (v_user_id, v_symbol, p_quantity, p_price)
      on conflict (user_id, symbol) do update
      set average_price = ((current_holding.quantity * current_holding.average_price) + (excluded.quantity * excluded.average_price)) / (current_holding.quantity + excluded.quantity),
          quantity = current_holding.quantity + excluded.quantity,
          updated_at = now();
  else
    select * into v_holding from public.holdings where user_id = v_user_id and symbol = v_symbol for update;
    if not found or v_holding.quantity < p_quantity then raise exception 'Not enough shares to sell.'; end if;
    if v_holding.quantity = p_quantity then
      delete from public.holdings where id = v_holding.id;
    else
      update public.holdings set quantity = quantity - p_quantity, updated_at = now() where id = v_holding.id;
    end if;
    update public.wallets set balance = balance + v_total, updated_at = now() where id = v_wallet.id;
  end if;

  insert into public.orders (user_id, symbol, order_type, quantity, price, total_value, status)
  values (v_user_id, v_symbol, v_side, p_quantity, p_price, v_total, 'EXECUTED')
  returning id into v_order_id;

  return jsonb_build_object('order_id', v_order_id, 'symbol', v_symbol, 'order_type', v_side, 'quantity', p_quantity, 'price', p_price, 'total_value', v_total);
end;
$$;

revoke all on function public.execute_paper_order(text, text, numeric, numeric) from public, anon;
grant execute on function public.execute_paper_order(text, text, numeric, numeric) to authenticated;

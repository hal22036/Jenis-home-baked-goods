-- Run this entire file in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  capacity_units integer not null default 1 check (capacity_units >= 0),
  category text not null default 'Everyday',
  active boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists public.pickup_dates (
  id uuid primary key default gen_random_uuid(),
  pickup_date date not null unique,
  capacity integer not null default 14 check (capacity > 0),
  is_open boolean not null default true
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  pickup_date_id uuid not null references public.pickup_dates(id),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  notes text,
  payment_method text not null check (payment_method in ('Venmo','Zelle','PayPal','CashApp','CashAtPickup')),
  total_cents integer not null default 0,
  total_loaves integer not null check (total_loaves >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0)
);

create index if not exists idx_pickup_dates_open_future
on public.pickup_dates (pickup_date)
where is_open = true;

create index if not exists idx_orders_pickup_date_id
on public.orders (pickup_date_id);

create index if not exists idx_order_items_order_id
on public.order_items (order_id);

alter table public.products
add column if not exists capacity_units integer not null default 1;

alter table public.products
add column if not exists category text not null default 'Everyday';

alter table public.products
drop constraint if exists products_capacity_units_check;

alter table public.products
add constraint products_capacity_units_check
check (capacity_units >= 0);

alter table public.orders
drop constraint if exists orders_total_loaves_check;

alter table public.orders
add constraint orders_total_loaves_check
check (total_loaves >= 0);

alter table public.orders
drop constraint if exists orders_payment_method_check;

alter table public.orders
add constraint orders_payment_method_check
check (payment_method in ('Venmo','Zelle','PayPal','CashApp','CashAtPickup'));

alter table public.orders
add column if not exists order_code text;

update public.orders
set order_code = upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8))
where order_code is null;

alter table public.orders
alter column order_code set not null;

alter table public.orders
alter column order_code set default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));

create unique index if not exists idx_orders_order_code
on public.orders (order_code);

-- Public read-only view showing availability without exposing customer data.
create or replace view public.pickup_date_status as
select
  d.id,
  d.pickup_date,
  d.capacity,
  d.is_open,
  coalesce(sum(o.total_loaves), 0)::integer as ordered_count
from public.pickup_dates d
left join public.orders o on o.pickup_date_id = d.id
group by d.id, d.pickup_date, d.capacity, d.is_open;

-- Example products. Change these to match your menu.
insert into public.products (name, description, price_cents, capacity_units, category, sort_order)
select seed.name, seed.description, seed.price_cents, seed.capacity_units, seed.category, seed.sort_order
from (
  values
    ('White Bread', 'Classic soft loaf.', 1000, 1, 'Everyday', 1),
    ('Honey Oat', 'Soft loaf with honey and oats.', 1200, 1, 'Everyday', 2),
    ('Jalapeno Cheddar', 'Savory loaf with jalapeno and cheddar.', 1400, 1, 'Turn Up the Heat', 3),
    ('Cinnamon Raisin', 'Sweet cinnamon loaf with raisins.', 1300, 1, 'Sweet', 4)
) as seed(name, description, price_cents, capacity_units, category, sort_order)
where not exists (
  select 1
  from public.products p
  where lower(p.name) = lower(seed.name)
);

-- Example pickup dates. Replace these.
insert into public.pickup_dates (pickup_date, capacity)
values
  (current_date + 7, 14),
  (current_date + 14, 14),
  (current_date + 21, 14)
on conflict (pickup_date) do nothing;

-- RLS
alter table public.products enable row level security;
alter table public.pickup_dates enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Anyone can read active products" on public.products;
create policy "Anyone can read active products"
on public.products for select
using (active = true);

drop policy if exists "Anyone can read pickup dates" on public.pickup_dates;
create policy "Anyone can read pickup dates"
on public.pickup_dates for select
using (true);

-- The browser is NOT allowed to insert orders directly.
-- Orders are created only through the function below.

drop function if exists public.place_order(uuid,text,text,text,text,text,jsonb);
drop function if exists public.update_order_payment_method(uuid,text,text);
drop function if exists public.update_order_payment_method(text,text);

create or replace function public.place_order(
  p_pickup_date_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_notes text,
  p_payment_method text,
  p_items jsonb
)
returns table(order_id uuid, order_code text, total_cents integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity integer;
  v_current integer;
  v_requested integer;
  v_total integer;
  v_item_count integer;
  v_order_id uuid;
  v_order_code text;
  v_item jsonb;
  v_quantity integer;
  v_price integer;
  v_capacity_units integer;
begin
  if p_payment_method not in ('Venmo', 'Zelle', 'PayPal', 'CashApp', 'CashAtPickup') then
    raise exception 'Invalid payment method';
  end if;

  if nullif(trim(p_customer_name), '') is null
    or nullif(trim(p_customer_email), '') is null
    or nullif(trim(p_customer_phone), '') is null then
    raise exception 'Customer name, email, and phone are required';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Order items must be an array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where (item->>'product_id') is null
      or (item->>'quantity') is null
      or (item->>'quantity') !~ '^[0-9]+$'
      or (item->>'quantity')::integer <= 0
  ) then
    raise exception 'Every order item must include a product and positive quantity';
  end if;

  -- Lock the pickup-date row so two customers cannot claim the same final spots.
  select capacity
  into v_capacity
  from pickup_dates
  where id = p_pickup_date_id
    and is_open = true
    and (now() at time zone 'America/Los_Angeles') < (
      pickup_date
      - (((extract(dow from pickup_date)::integer - 3 + 7) % 7) * interval '1 day')
      + time '17:00'
    )
  for update;

  if not found then
    raise exception 'Pickup date is closed, past, or past the Wednesday 5 PM ordering cutoff';
  end if;

  select coalesce(sum(total_loaves), 0)::integer
  into v_current
  from orders
  where pickup_date_id = p_pickup_date_id;

  v_total := 0;
  v_item_count := 0;
  v_requested := 0;

  for v_item in
    select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::integer;

    select price_cents, capacity_units
    into v_price, v_capacity_units
    from products
    where id = (v_item->>'product_id')::uuid
      and active = true;

    if v_price is null then
      raise exception 'Invalid product';
    end if;

    v_total := v_total + v_price * v_quantity;
    v_item_count := v_item_count + v_quantity;
    v_requested := v_requested + v_capacity_units * v_quantity;
  end loop;

  if v_item_count <= 0 then
    raise exception 'Order must contain at least one item';
  end if;

  if v_current + v_requested > v_capacity then
    raise exception 'Not enough capacity';
  end if;

  insert into orders (
    pickup_date_id,
    customer_name,
    customer_email,
    customer_phone,
    notes,
    payment_method,
    total_cents,
    total_loaves
  )
  values (
    p_pickup_date_id,
    trim(p_customer_name),
    trim(p_customer_email),
    trim(p_customer_phone),
    nullif(p_notes, ''),
    p_payment_method,
    v_total,
    v_requested
  )
  returning id into v_order_id;

  select orders.order_code
  into v_order_code
  from orders
  where id = v_order_id;

  for v_item in
    select * from jsonb_array_elements(p_items)
  loop
    select price_cents
    into v_price
    from products
    where id = (v_item->>'product_id')::uuid;

    insert into order_items (
      order_id,
      product_id,
      quantity,
      unit_price_cents
    )
    values (
      v_order_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::integer,
      v_price
    );
  end loop;

  return query select v_order_id, v_order_code, v_total;
end;
$$;

create or replace function public.update_order_payment_method(
  p_order_code text,
  p_payment_method text
)
returns table(order_id uuid, order_code text, payment_method text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_payment_method not in ('Venmo', 'Zelle', 'PayPal', 'CashApp', 'CashAtPickup') then
    raise exception 'Invalid payment method';
  end if;

  update orders
  set payment_method = p_payment_method
  where orders.order_code = upper(trim(p_order_code));

  if not found then
    raise exception 'Order not found';
  end if;

  return query
  select orders.id, orders.order_code, orders.payment_method
  from orders
  where orders.order_code = upper(trim(p_order_code));
end;
$$;

revoke all on function public.place_order(uuid,text,text,text,text,text,jsonb) from public;
grant execute on function public.place_order(uuid,text,text,text,text,text,jsonb) to anon, authenticated;

revoke all on function public.update_order_payment_method(text,text) from public;
grant execute on function public.update_order_payment_method(text,text) to anon, authenticated;

grant select on public.products to anon, authenticated;
grant select on public.pickup_dates to anon, authenticated;
grant select on public.pickup_date_status to anon, authenticated;

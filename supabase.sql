-- Run this entire file in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  capacity_units integer not null default 1 check (capacity_units >= 0),
  category text not null default 'Everyday',
  display_group text,
  option_label text,
  image_url text,
  active boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists public.pickup_dates (
  id uuid primary key default gen_random_uuid(),
  pickup_date date not null constraint pickup_dates_pickup_date_key unique,
  capacity integer not null default 14 check (capacity > 0),
  is_open boolean not null default true
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  pickup_date_id uuid not null references public.pickup_dates(id),
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  notes text,
  payment_method text not null check (payment_method in ('Venmo','Zelle','PayPal','CashApp','CashAtPickup')),
  total_cents integer not null default 0,
  total_loaves integer not null check (total_loaves >= 0),
  invoice_requested boolean not null default false,
  invoice_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0)
);

create table if not exists public.admin_users (
  email text primary key,
  created_at timestamptz not null default now()
);

create index if not exists idx_pickup_dates_open_future
on public.pickup_dates (pickup_date)
where is_open = true;

create index if not exists idx_orders_pickup_date_id
on public.orders (pickup_date_id);

create index if not exists idx_order_items_order_id
on public.order_items (order_id);

alter table public.orders
add column if not exists payment_status text not null default 'pending';

alter table public.orders
add column if not exists fulfillment_status text not null default 'new';

alter table public.orders
add column if not exists archived boolean not null default false;

alter table public.orders
add column if not exists invoice_requested boolean not null default false;

alter table public.orders
add column if not exists invoice_sent boolean not null default false;

alter table public.orders
alter column customer_email drop not null;

alter table public.orders
drop constraint if exists orders_payment_status_check;

alter table public.orders
add constraint orders_payment_status_check
check (payment_status in ('pending','paid','refunded'));

alter table public.orders
drop constraint if exists orders_fulfillment_status_check;

alter table public.orders
add constraint orders_fulfillment_status_check
check (fulfillment_status in ('new','prepping','ready','fulfilled','canceled'));

alter table public.products
add column if not exists capacity_units integer not null default 1;

alter table public.products
add column if not exists category text not null default 'Everyday';

alter table public.products
add column if not exists display_group text;

alter table public.products
add column if not exists option_label text;

alter table public.products
add column if not exists image_url text;

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
  and o.fulfillment_status <> 'canceled'
group by d.id, d.pickup_date, d.capacity, d.is_open;

-- Products are intentionally not seeded automatically.
-- Add only your real menu items in Table Editor -> products.
-- Example:
-- insert into public.products (
--   name,
--   description,
--   price_cents,
--   capacity_units,
--   category,
--   display_group,
--   option_label,
--   sort_order
-- )
-- values (
--   'White Bread',
--   'Classic soft loaf.',
--   1000,
--   1,
--   'Everyday',
--   null,
--   null,
--   1
-- )
-- on conflict do nothing;

-- Pickup dates are intentionally not seeded automatically.
-- Add only the Fridays you want to offer in Table Editor -> pickup_dates.
-- Example:
-- insert into public.pickup_dates (pickup_date, capacity, is_open)
-- values ('2026-08-14', 14, true)
-- on conflict (pickup_date) do nothing;

-- RLS
alter table public.products enable row level security;
alter table public.pickup_dates enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "Anyone can read active products" on public.products;
create policy "Anyone can read active products"
on public.products for select
using (active = true);

drop policy if exists "Anyone can read pickup dates" on public.pickup_dates;
create policy "Anyone can read pickup dates"
on public.pickup_dates for select
using (true);

drop policy if exists "Admins can read admin users" on public.admin_users;

drop function if exists public.is_admin();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create policy "Admins can read admin users"
on public.admin_users for select
using (public.is_admin());

-- The browser is NOT allowed to insert orders directly.
-- Orders are created only through the function below.

drop function if exists public.place_order(uuid,text,text,text,text,text,jsonb);
drop function if exists public.place_order(uuid,text,text,text,text,text,boolean,jsonb);
drop function if exists public.get_order_invoice(text);
drop function if exists public.update_order_payment_method(uuid,text,text);
drop function if exists public.update_order_payment_method(text,text);
drop function if exists public.admin_list_orders(boolean);
drop function if exists public.admin_update_order_status(uuid,text,text,boolean);
drop function if exists public.admin_update_order_status(uuid,text,text,boolean,boolean);
drop function if exists public.admin_update_order_status(uuid,text,text,boolean,boolean,boolean,text);
drop function if exists public.admin_list_pickup_dates();
drop function if exists public.admin_save_pickup_date(uuid,date,integer,boolean);
drop function if exists public.admin_list_products();
drop function if exists public.admin_update_product_active(uuid,boolean);

create or replace function public.place_order(
  p_pickup_date_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_notes text,
  p_payment_method text,
  p_invoice_requested boolean,
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
    or nullif(trim(p_customer_phone), '') is null then
    raise exception 'Customer name and phone are required';
  end if;

  if length(regexp_replace(p_customer_phone, '\D', '', 'g')) <> 10 then
    raise exception 'A 10-digit phone number is required';
  end if;

  if coalesce(p_invoice_requested, false)
    and nullif(trim(coalesce(p_customer_email, '')), '') is null then
    raise exception 'Email is required when an invoice is requested';
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
  where pickup_date_id = p_pickup_date_id
    and fulfillment_status <> 'canceled';

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
    invoice_requested,
    total_cents,
    total_loaves
  )
  values (
    p_pickup_date_id,
    trim(p_customer_name),
    nullif(trim(coalesce(p_customer_email, '')), ''),
    trim(p_customer_phone),
    nullif(p_notes, ''),
    p_payment_method,
    coalesce(p_invoice_requested, false),
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

create or replace function public.get_order_invoice(
  p_order_code text
)
returns table(
  order_code text,
  pickup_date date,
  customer_name text,
  customer_email text,
  customer_phone text,
  notes text,
  payment_method text,
  invoice_requested boolean,
  total_cents integer,
  total_loaves integer,
  created_at timestamptz,
  items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    o.order_code,
    d.pickup_date,
    o.customer_name,
    o.customer_email,
    o.customer_phone,
    o.notes,
    o.payment_method,
    o.invoice_requested,
    o.total_cents,
    o.total_loaves,
    o.created_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', p.name,
          'quantity', oi.quantity,
          'unit_price_cents', oi.unit_price_cents,
          'display_group', p.display_group,
          'option_label', p.option_label,
          'image_url', p.image_url
        )
        order by coalesce(p.display_group, p.name), p.sort_order, coalesce(p.option_label, p.name), p.name
      ) filter (where oi.id is not null),
      '[]'::jsonb
    ) as items
  from public.orders o
  join public.pickup_dates d on d.id = o.pickup_date_id
  left join public.order_items oi on oi.order_id = o.id
  left join public.products p on p.id = oi.product_id
  where o.order_code = upper(trim(p_order_code))
  group by o.id, d.pickup_date;
end;
$$;

create or replace function public.admin_list_orders(
  p_include_archived boolean default false
)
returns table(
  order_id uuid,
  order_code text,
  pickup_date date,
  customer_name text,
  customer_email text,
  customer_phone text,
  notes text,
  payment_method text,
  payment_status text,
  fulfillment_status text,
  archived boolean,
  invoice_requested boolean,
  invoice_sent boolean,
  total_cents integer,
  total_loaves integer,
  created_at timestamptz,
  items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select
    o.id,
    o.order_code,
    d.pickup_date,
    o.customer_name,
    o.customer_email,
    o.customer_phone,
    o.notes,
    o.payment_method,
    o.payment_status,
    o.fulfillment_status,
    o.archived,
    o.invoice_requested,
    o.invoice_sent,
    o.total_cents,
    o.total_loaves,
    o.created_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', p.name,
          'quantity', oi.quantity,
          'unit_price_cents', oi.unit_price_cents,
          'capacity_units', p.capacity_units,
          'category', p.category,
          'display_group', p.display_group,
          'option_label', p.option_label
        )
        order by coalesce(p.display_group, p.name), coalesce(p.option_label, p.name), p.name
      ) filter (where oi.id is not null),
      '[]'::jsonb
    ) as items
  from orders o
  join pickup_dates d on d.id = o.pickup_date_id
  left join order_items oi on oi.order_id = o.id
  left join products p on p.id = oi.product_id
  where p_include_archived or not o.archived
  group by o.id, d.pickup_date
  order by d.pickup_date asc, o.created_at asc;
end;
$$;

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_payment_status text,
  p_fulfillment_status text,
  p_archived boolean,
  p_invoice_requested boolean,
  p_invoice_sent boolean,
  p_customer_email text
)
returns table(
  order_id uuid,
  payment_status text,
  fulfillment_status text,
  archived boolean,
  invoice_requested boolean,
  invoice_sent boolean,
  customer_email text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_payment_status not in ('pending','paid','refunded') then
    raise exception 'Invalid payment status';
  end if;

  if p_fulfillment_status not in ('new','prepping','ready','fulfilled','canceled') then
    raise exception 'Invalid fulfillment status';
  end if;

  if (coalesce(p_invoice_requested, false) or coalesce(p_invoice_sent, false))
    and nullif(trim(coalesce(p_customer_email, '')), '') is null then
    raise exception 'Receipt email is required when a receipt is requested';
  end if;

  update orders
  set
    payment_status = p_payment_status,
    fulfillment_status = p_fulfillment_status,
    archived = p_archived,
    invoice_requested = coalesce(p_invoice_requested, false) or coalesce(p_invoice_sent, false),
    invoice_sent = coalesce(p_invoice_sent, false),
    customer_email = nullif(trim(coalesce(p_customer_email, '')), '')
  where id = p_order_id;

  if not found then
    raise exception 'Order not found';
  end if;

  return query
  select
    o.id,
    o.payment_status,
    o.fulfillment_status,
    o.archived,
    o.invoice_requested,
    o.invoice_sent,
    o.customer_email
  from orders o
  where o.id = p_order_id;
end;
$$;

create or replace function public.admin_list_pickup_dates()
returns table(
  id uuid,
  pickup_date date,
  capacity integer,
  is_open boolean,
  ordered_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select
    s.id,
    s.pickup_date,
    s.capacity,
    s.is_open,
    s.ordered_count
  from pickup_date_status s
  order by s.pickup_date asc;
end;
$$;

create or replace function public.admin_save_pickup_date(
  p_id uuid,
  p_pickup_date date,
  p_capacity integer,
  p_is_open boolean
)
returns table(saved_id uuid, saved_pickup_date date, saved_capacity integer, saved_is_open boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_capacity <= 0 then
    raise exception 'Capacity must be greater than zero';
  end if;

  if extract(dow from p_pickup_date)::integer <> 5 then
    raise exception 'Pickup date must be a Friday';
  end if;

  if p_id is null then
    insert into public.pickup_dates (pickup_date, capacity, is_open)
    values (p_pickup_date, p_capacity, p_is_open)
    on conflict on constraint pickup_dates_pickup_date_key
    do update set
      capacity = excluded.capacity,
      is_open = excluded.is_open
    returning id into v_id;
  else
    update public.pickup_dates as d
    set
      pickup_date = p_pickup_date,
      capacity = p_capacity,
      is_open = p_is_open
    where d.id = p_id
    returning d.id into v_id;
  end if;

  if v_id is null then
    raise exception 'Pickup date not found';
  end if;

  return query
  select d.id, d.pickup_date, d.capacity, d.is_open
  from public.pickup_dates d
  where d.id = v_id;
end;
$$;

create or replace function public.admin_list_products()
returns table(
  id uuid,
  name text,
  description text,
  price_cents integer,
  capacity_units integer,
  category text,
  display_group text,
  option_label text,
  image_url text,
  active boolean,
  sort_order integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select
    p.id,
    p.name,
    p.description,
    p.price_cents,
    p.capacity_units,
    p.category,
    p.display_group,
    p.option_label,
    p.image_url,
    p.active,
    p.sort_order
  from public.products p
  order by p.category asc, coalesce(p.display_group, p.name) asc, p.sort_order asc, coalesce(p.option_label, p.name) asc;
end;
$$;

create or replace function public.admin_update_product_active(
  p_product_id uuid,
  p_active boolean
)
returns table(saved_id uuid, saved_active boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.products as p
  set active = p_active
  where p.id = p_product_id
  returning p.id, p.active into saved_id, saved_active;

  if saved_id is null then
    raise exception 'Product not found';
  end if;

  return next;
end;
$$;

revoke all on function public.place_order(uuid,text,text,text,text,text,boolean,jsonb) from public;
grant execute on function public.place_order(uuid,text,text,text,text,text,boolean,jsonb) to anon, authenticated;

revoke all on function public.get_order_invoice(text) from public;
grant execute on function public.get_order_invoice(text) to anon, authenticated;

revoke all on function public.update_order_payment_method(text,text) from public;
grant execute on function public.update_order_payment_method(text,text) to anon, authenticated;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.admin_list_orders(boolean) from public;
grant execute on function public.admin_list_orders(boolean) to authenticated;

revoke all on function public.admin_update_order_status(uuid,text,text,boolean,boolean,boolean,text) from public;
grant execute on function public.admin_update_order_status(uuid,text,text,boolean,boolean,boolean,text) to authenticated;

revoke all on function public.admin_list_pickup_dates() from public;
grant execute on function public.admin_list_pickup_dates() to authenticated;

revoke all on function public.admin_save_pickup_date(uuid,date,integer,boolean) from public;
grant execute on function public.admin_save_pickup_date(uuid,date,integer,boolean) to authenticated;

revoke all on function public.admin_list_products() from public;
grant execute on function public.admin_list_products() to authenticated;

revoke all on function public.admin_update_product_active(uuid,boolean) from public;
grant execute on function public.admin_update_product_active(uuid,boolean) to authenticated;

grant select on public.products to anon, authenticated;
grant select on public.pickup_dates to anon, authenticated;
grant select on public.pickup_date_status to anon, authenticated;

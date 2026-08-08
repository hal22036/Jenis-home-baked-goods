# Bakery Ordering Website

Production-ready starter for a small bakery using GitHub Pages for the frontend and Supabase for the backend.

## What it does

- Shows only open future pickup dates.
- Closes ordering the Wednesday at 5 PM before each pickup date.
- Gives every pickup date its own capacity, defaulting to 14 total loaves.
- Lets non-loaf products use `capacity_units = 0` so they do not count against the loaf limit.
- Groups products into owner-editable menu categories.
- Lets customers mix bread varieties while still counting against the same date capacity.
- Prevents overselling with a Supabase transaction function that locks the selected pickup-date row before checking capacity.
- Shows customers a short order code for payment notes instead of a long database ID.
- Accepts Venmo, Zelle, PayPal, CashApp, and Cash at Pickup instructions only.
- Does not accept or process credit cards.
- Keeps bakery name, intro text, pickup note, and payment links in one owner-friendly settings block in `app.js`.

## Files

- `index.html` - static GitHub Pages page
- `styles.css` - responsive design
- `app.js` - Supabase connection, store settings, ordering flow
- `admin.html` - owner order and pickup-date dashboard
- `admin.js` - admin login, order status, archive, and pickup-date tools
- `admin.css` - admin-only styles
- `supabase.sql` - database tables, read policies, and safe order function

## 1. Create Supabase

1. Create a Supabase project.
2. Open SQL Editor.
3. Paste the full contents of `supabase.sql`.
4. Run it.
5. Open Project Settings -> API.
6. Copy your Project URL and anon/public key.

The anon key is safe for browser apps. Never publish a `service_role` key.

## 2. Connect the Website

Open `app.js` and replace:

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

with your real Supabase Project URL and anon key.

## 3. Update Bakery Settings

In `app.js`, edit `STORE_SETTINGS`:

```js
const STORE_SETTINGS = {
  bakeryName: "Jen's Home Baked Goods",
  intro: "Small-batch bread baked to order...",
  pickupWindow: "4-7 pm",
  pickupAddress: "7140 Anchor Terrace St.",
  gateCode: "#7716",
  contactPhone: "801-602-8443",
  pickupNote: "Pickup details are shown after your order is submitted.",
  maxLoavesPerDate: 14,
  orderCutoffWeekday: 3,
  orderCutoffHour: 17,
  bakeryTimeZone: "America/Los_Angeles",
  paymentOptions: {
    Venmo: {
      link: "YOUR_VENMO_LINK",
      instructions: "Send payment by Venmo..."
    },
    Zelle: {
      link: "",
      instructions: "Send payment by Zelle..."
    },
    PayPal: {
      link: "YOUR_PAYPAL_LINK",
      instructions: "Send payment by PayPal..."
    },
    CashApp: {
      link: "YOUR_CASHAPP_LINK",
      instructions: "Send payment by CashApp..."
    },
    CashAtPickup: {
      link: "",
      instructions: "Please bring exact cash..."
    }
  }
};
```

For Zelle, many bakeries leave `link` blank and use the instructions text.

## 4. Change the Bread Menu

In Supabase, open Table Editor -> `products`.

The SQL setup file does not auto-create products, so rerunning it will not bring back starter menu items.

Edit:

- `name`
- `description`
- `price_cents`
- `capacity_units`
- `category`
- `display_group`
- `option_label`
- `image_url`
- `active`
- `sort_order`

Prices are stored in cents:

- `$10.00` = `1000`
- `$12.50` = `1250`

Set `active` to `false` to hide a bread without deleting it.

The storefront alphabetizes product cards inside each category by product name or `display_group`. Grouped choices use `sort_order` first, then `option_label`, so you can place `Plain` before flavored granola or `2 oz` before larger sizes.

Use `image_url` to show a product photo. Put the image file in the repository `assets` folder, commit it to GitHub, then enter a relative path like:

```text
assets/white-sourdough.jpg
```

For grouped products, use the same `image_url` on each option row if they should share one card photo.

Use `capacity_units` to decide whether a product counts against pickup capacity:

- Bread loaves: `1`
- Add-ons or non-loaf products: `0`

Use `category` to group the order screen. Built-in category order:

- `Everyday`
- `Sweet`
- `Savory`
- `Turn Up the Heat`
- `Other Delicious Treats`

Use `display_group` and `option_label` when several product rows should appear in one card with separate choices:

| name | display_group | option_label | price_cents | capacity_units | category |
|---|---|---|---:|---:|---|
| Honey Butter - 2 oz | Honey Butter | 2 oz Container | 150 | 0 | Other Delicious Treats |
| Honey Butter - 4 oz | Honey Butter | 4 oz Container | 300 | 0 | Other Delicious Treats |
| Honey Butter - 16 oz | Honey Butter | 16 oz Container | 1200 | 0 | Other Delicious Treats |
| Granola - Plain | Homemade Granola | Plain | 1200 | 0 | Other Delicious Treats |
| Granola - Craisins | Homemade Granola | Craisins | 1400 | 0 | Other Delicious Treats |

Each option is still its own product row, so it can have its own price. The storefront groups rows with the same `display_group` into one card.

For the most predictable setup, fill in `display_group` and `option_label`. The storefront can also infer simple groups from names like `Granola - Plain` or `Honey Butter 2 oz`, but the columns are easier to maintain.

## 5. Add Pickup Dates

Open Table Editor -> `pickup_dates`.

Add one row per Friday pickup date:

| pickup_date | capacity | is_open |
|---|---:|---|
| 2026-08-14 | 14 | true |
| 2026-08-21 | 14 | true |

Each date tracks its own capacity. One date selling out does not affect another date.

To close ordering for a date, set `is_open` to `false`.

The SQL setup file does not auto-create pickup dates, so rerunning it will not add accidental Saturday dates.

Orders automatically close at 5 PM on the Wednesday before each pickup date. For a Friday pickup, customers can order until Wednesday at 4:59 PM; at 5:00 PM the date will no longer appear.

## 6. Deploy on GitHub Pages

1. Create a GitHub repository.
2. Upload these files to the repository root.
3. Open repository Settings -> Pages.
4. Set Source to `Deploy from a branch`.
5. Set Branch to `main` and Folder to `/ (root)`.
6. Save.

GitHub Pages will give you the public site URL.

## 7. Set Up the Admin Page

The admin page is available at:

```text
https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPO/admin.html
```

It uses Supabase Auth plus an `admin_users` allow-list.

1. Run the latest `supabase.sql`.
2. In Supabase, go to Authentication -> Users.
3. Add or invite your owner email address.
4. Set a password for that user.
5. In SQL Editor, add that same email to the admin allow-list:

```sql
insert into public.admin_users (email)
values ('YOUR_EMAIL@example.com')
on conflict (email) do nothing;
```

The admin page can:

- view orders without opening Supabase
- mark payment status as pending, paid, or refunded
- mark fulfillment status as new, prepping, ready, fulfilled, or canceled
- archive finished orders
- add or edit Friday pickup dates
- open or close pickup dates
- change pickup-date capacity

Use archive instead of delete so order history is not lost accidentally.

## Capacity Protection

Do not remove the `for update` lock in `place_order` inside `supabase.sql`.

That lock is what prevents two customers from claiming the same final loaf spots at the same time. The function:

1. Locks the selected pickup-date row.
2. Counts existing loaves for that date.
3. Counts requested loaves across all bread varieties.
4. Rejects the order if the date would exceed capacity.
5. Inserts the order and order items.

## Security Notes

- GitHub Pages is public, so only use public frontend values there.
- Keep Supabase `service_role` keys private.
- Do not store bank account details in frontend code.
- This site records payment method and instructions, but it does not verify that payment was completed.

## Useful Next Steps

- Add email notifications for new orders with a Supabase Edge Function.
- Add a private admin dashboard for order review.
- Add order status and payment status columns if you want to track fulfillment inside Supabase.

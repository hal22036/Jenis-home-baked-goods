# Bakery Ordering Website

Production-ready starter for a small bakery using GitHub Pages for the frontend and Supabase for the backend.

## What it does

- Shows only open future pickup dates.
- Gives every pickup date its own capacity, defaulting to 14 total loaves.
- Lets customers mix bread varieties while still counting against the same date capacity.
- Prevents overselling with a Supabase transaction function that locks the selected pickup-date row before checking capacity.
- Accepts Venmo, Zelle, and PayPal instructions only.
- Does not accept or process credit cards.
- Keeps bakery name, intro text, pickup note, and payment links in one owner-friendly settings block in `app.js`.

## Files

- `index.html` - static GitHub Pages page
- `styles.css` - responsive design
- `app.js` - Supabase connection, store settings, ordering flow
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
  pickupNote: "Pickup address and timing details...",
  maxLoavesPerDate: 14,
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
    }
  }
};
```

For Zelle, many bakeries leave `link` blank and use the instructions text.

## 4. Change the Bread Menu

In Supabase, open Table Editor -> `products`.

Edit:

- `name`
- `description`
- `price_cents`
- `active`
- `sort_order`

Prices are stored in cents:

- `$10.00` = `1000`
- `$12.50` = `1250`

Set `active` to `false` to hide a bread without deleting it.

## 5. Add Pickup Dates

Open Table Editor -> `pickup_dates`.

Add one row per pickup date:

| pickup_date | capacity | is_open |
|---|---:|---|
| 2026-08-14 | 14 | true |
| 2026-08-21 | 14 | true |

Each date tracks its own capacity. One date selling out does not affect another date.

To close ordering for a date, set `is_open` to `false`.

## 6. Deploy on GitHub Pages

1. Create a GitHub repository.
2. Upload these files to the repository root.
3. Open repository Settings -> Pages.
4. Set Source to `Deploy from a branch`.
5. Set Branch to `main` and Folder to `/ (root)`.
6. Save.

GitHub Pages will give you the public site URL.

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

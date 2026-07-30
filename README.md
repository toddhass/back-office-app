# Back Office App

Real Supabase-wired version of the invoice/inventory/scheduling UI — Capture, Invoices, and Reorder tabs.

## Setup

```bash
npm install
cp .env.example .env   # already filled in with your project's URL + anon key
npm run dev
```

## Important — RLS will block all data right now

Every table has row-level security scoped to `staff_restaurants` (a user only sees
restaurants they're linked to). Right now `staff_restaurants` is empty, so **any
query using the anon key will return zero rows** until you:

1. Create a real Supabase Auth user (e.g. via the Supabase dashboard, or
   `supabase.auth.signUp()` from a login screen you haven't built yet).
2. Insert a row linking that user to the dummy restaurant:
   ```sql
   insert into staff_restaurants (user_id, restaurant_id)
   values ('<the-auth-user-uuid>', '11111111-1111-1111-1111-111111111111');
   ```
3. Sign in from the app (there's no login screen wired up yet — this repo assumes
   you'll add Supabase Auth UI or your own login flow before this becomes usable
   end-to-end).

Until then, you can test the queries directly against the database (e.g. via the
Supabase SQL editor) using the service role key, bypassing RLS.

## Known gaps carried over from the design/testing conversation

- `RESTAURANT_ID` is hardcoded in `src/lib/supabaseClient.js` — swap for the
  logged-in user's actual restaurant once auth exists.
- The `match-line-items` Edge Function only does learned-mapping + trigram
  matching. The embedding fallback needs a provider (e.g. Voyage AI) wired in —
  it's currently skipped.
- Trigram matching on raw invoice abbreviations undershoots — real testing
  showed ~0.41–0.59 similarity on things like "Roma Tom 25# cs" vs "Roma
  Tomatoes, 25lb case", well below the 0.85 auto-match bar. Expect a real chunk
  of line items to land in manual review even after normalization.
- The Digest screen groups items by their most recent supplier via invoice
  history — items with no invoice history yet show under "Unassigned".
- `ANTHROPIC_API_KEY` must be set as a Supabase secret for `extract-invoice` to
  work: `supabase secrets set ANTHROPIC_API_KEY=...`

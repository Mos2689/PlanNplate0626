# PlanNplate support console

The internal view of the support system that ships inside the app. Two screens:
an inbox and a conversation.

## Why it is this small

Everything an early-stage team actually needs to answer a support message is
here, and nothing else is. No assignment, no tags, no priorities, no SLA timers,
no canned replies, no search, no dashboards. Each of those is a feature someone
has to maintain and an agent has to learn, and none of them help you answer the
fourth message of the week faster.

## Authorization

There is no permission system in this app, on purpose.

Access is decided entirely by Postgres row-level security: a signed-in user sees
every support thread if and only if they have an active row in `support_agents`.
Someone who signs in without one gets an empty inbox — not an error screen, not
a redirect, just nothing to see. That means there is no client-side check to
forget, bypass or get wrong.

Adding an agent is a deliberate manual step:

```sql
insert into public.support_agents (user_id, name)
values ('<auth.users.id>', 'Sam');
```

Create the account first in Supabase → Authentication → Users (email + password),
then run the insert with that user's id.

## Setup

```bash
cd admin && npm install
```

Create `.env.local`:

```
VITE_SUPABASE_URL=https://plannplate.supabase.co
VITE_SUPABASE_ANON_KEY=<the project's anon key>
```

The anon key is public by design — it grants nothing on its own, because every
table this app touches is behind RLS.

```bash
npm run dev
```

## Deploy

Static build, no server:

```bash
npm run build
```

Point Vercel (or any static host) at `admin/`, framework preset **Vite**, then
add `admin.plannplate.com.au` as a custom domain.

Two things to do once, in Supabase:

1. **Authentication → URL Configuration** — add `https://admin.plannplate.com.au`
   to the redirect allow-list.
2. **Authentication → Providers → Email** — confirm password sign-in is enabled
   and sign-ups are disabled, so the only accounts that exist are ones you made.

## Replying

Replies go through the `support-reply` edge function rather than a direct table
insert. That is what sends the user's email and push notification; inserting the
row directly would leave the user unaware they'd been answered.

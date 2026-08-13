# PlanNplate Support v1

The design and the reasoning behind the support system. If you're about to
change something in `src/lib/support/`, `src/app/help/`, or the support edge
functions, read the section that covers it first — most of what looks like an
omission here is a decision.

---

## 1. Philosophy

> Support is not a destination. It is a response.

Three principles decide everything below.

**The user explains what happened. We work out the rest.** No categories, no
severity pickers, no "steps to reproduce", no version field. One question, one
text box. Everything a category would have told us, the diagnostics already
know.

**Support appears where frustration happens.** The Settings entry is the
fallback path, not the main one. The system is designed so that most people meet
it as a quiet line under a failed import, not as a menu item they went looking
for.

**Never a dead end.** Every failure, every quick answer, every empty state has a
way forward. This was already the stated contract of `src/lib/failure/types.ts`;
support completes it rather than running alongside it.

### What we deliberately did not build

The conventional Help Centre → FAQ → Contact Us funnel exists to *deflect
volume*. At this stage volume is the product signal — a user who gives up before
telling us is a bug we never hear about. So:

- Quick answers sit **below** the three contact rows, never in front of them.
- There is no search, no categories, no priority, no ticket numbers.
- There is no chat widget and no support tab.

---

## 2. Architecture

```
  ┌─ app ───────────────────────────────────────────────┐
  │  openSupportComposer({ intent, feature })           │
  │      ↑            ↑             ↑            ↑      │
  │  Help home   FailureHost   SupportPrompt  ErrorBoundary
  │      └────────────┴─────────────┴────────────┘      │
  │                     ↓                                │
  │            SupportComposer (global sheet)            │
  │                     ↓                                │
  │   collectDiagnostics() → diagnostics-policy.ts       │
  └─────────────────────┬───────────────────────────────┘
                        ↓ support-submit
  ┌─ supabase ──────────────────────────────────────────┐
  │  support_threads ─┬─ support_messages               │
  │                   └─ support-attachments (private)  │
  │  support_agents (the only authorization decision)   │
  └─────────┬──────────────────────┬────────────────────┘
            ↓ Resend               ↓ RLS
      team inbox            admin.plannplate.com.au
                                   ↓ support-reply
                     email + push + in-app thread
```

Two user-facing surfaces, and that is the whole system:

- **The composer** — a sheet raised from anywhere with context pre-attached.
  Roughly nine in ten support interactions start and end here.
- **Help home** (`/help`) — reached from Settings. Mostly a doorway to the
  composer, plus eight quick answers and your conversations.

---

## 3. Screens

### Help home — `src/app/help/index.tsx`

Premium white, ~75% breathing room, no card containers around the three primary
actions. Rows rather than cards, because cards imply parallel *destinations* and
these are three phrasings of one action. No icons on those rows — a wrench, a
question mark and a lightbulb would be exactly the generic support iconography
this product should never have.

One Instrument Serif accent, on "help?". Use `serifItalicFontStyle` from
`design-tokens.ts`, never a literal `fontStyle: 'italic'` — on Android the OS
drops the serif face entirely when it tries to synthesise italic over a custom
family.

"Your conversations" is **omitted entirely** when empty. An empty state there
would be a box explaining that nothing has happened yet, which is worse than
silence.

### The composer — `src/components/support/SupportComposer.tsx`

Mounted once in `_layout.tsx` beside `PaywallSheet` and `FailureHost`, driven by
a zustand store. That pattern is why a contextual prompt buried three components
deep inside the grocery tab costs one function call and no prop drilling.

A sheet rather than a screen because someone reporting a bug is *interrupted*,
not navigating — it keeps what they were doing visible behind it.

- No subject, no category, no email field. We have the account email.
- No character minimum. "it broke" is a valid report when diagnostics are
  attached.
- Screenshot is offered up front for bugs; for questions and ideas it appears
  only once 40+ characters are typed.
- **The draft lives in the store, not in component state.** A failed send, or an
  accidental dismiss, never costs the user their words. This is the difference
  between "that didn't send, try again" and "that didn't send, write it out
  again".
- Diagnostics are captured at **open** time, not send time. By the time someone
  finishes typing, the current screen is the composer — the screen they were
  actually on is the most useful field in the payload and it's already gone.

### Confirmation

Replaces the composer's content in place, rather than pushing a success screen.
A full screen is a *destination*, implying the user has arrived somewhere and
must now leave. They were in the middle of cooking dinner.

It says four things, in the order someone cares about them: we have it, a person
will read it, roughly when, and where the reply will land. The copy test asserts
the last two survive future edits.

### Conversation — `src/app/help/[threadId].tsx`

Chat-shaped but not a chat: no typing indicators, no read receipts, no avatars.
Those promise *presence* — that someone is there now — and a small team cannot
keep that promise. Status is a sentence, never a badge. **The thread id never
appears on screen.**

---

## 4. Contextual support — completing the failure system

This is the highest-leverage part of the system and it is mostly wiring, not new
UI.

`FailureActionKind` has included `'contact-support'` since the failure system was
written, and `FEATURE_COPY['auth-email:not-configured']` has been rendering a
"Contact support" button with nothing behind it. `FailureHost.runAction` now
handles that kind, so **every existing and future copy entry that chooses it
reaches a person.**

### The three tiers

| Tier | Trigger | Surface |
|---|---|---|
| Recoverable | 1st failure | existing toast / banner — unchanged |
| Persistent | 2nd failure, same `feature:category` | banner grows a second action; blocking dialog's cancel becomes "Tell us what happened" |
| Critical | render crash in `ErrorBoundary` | `FailureState` tertiary link |

The persistent tier needed no new state: `diagnostics.ts` already kept a
50-entry ring, so `consecutiveFailures()` counts from it and `presentFailure()`
stamps `attempt` onto the failure.

**Support appears on the second occurrence, never the first.** Most failures are
transient and the retry works; offering help immediately would make the app feel
fragile rather than helpful.

### One ordering trap worth knowing

`ErrorBoundary` wraps the entire app **including** the globally mounted
`SupportComposer`. While the fallback is showing there is no tree for the sheet
to render into, so `handleContactSupport` clears the boundary *first* and opens
the composer on the next tick.

### Placements

| Where | Condition |
|---|---|
| `import-recipe.tsx` | 2nd failed import in one visit |
| `(tabs)/grocery.tsx` | a generation the user asked for returned 0 items — **not** the ordinary "no list yet" state |
| subscription | handled automatically: purchase failures already carry `feature: 'subscription'` through `presentFailure`, so the persistent tier covers them |

The grocery distinction matters: offering help to someone who simply hasn't
started yet implies the product expects to fail them.

### Two live leaks fixed on the way through

- `import-recipe.tsx` rendered `error?.message` — a raw exception string
  straight to the user, the exact leak `lib/failure` exists to close. Now sourced
  from the copy catalogue.
- Restore-purchases finding nothing was a bare `Alert.alert` with a single OK —
  a dead end at the moment someone who believes they paid is told we can't see
  it. Now a failure whose **primary** action is a person.

---

## 5. Data model

`supabase/migrations/20260814000000_support_v1.sql`

- `support_threads` — one per conversation. `context` holds the sanitised
  diagnostics; `subject` is a denormalised 80-char preview for the admin list
  that the user neither writes nor sees.
- `support_messages` — the trail. Threads + messages **from day one** rather
  than a flat `support_requests`: a single-row design would need rewriting the
  moment agents can reply, and replies are in scope for v1.
- `support_agents` — membership grants access to every user's threads, so it is
  the single authorization decision in the system. Rows are created by hand;
  there is deliberately no self-service path in.
- `user_push_tokens` — keyed on `token`, so a device that changes hands
  re-points rather than delivering one person's replies to another.

RLS: owner policies for users, `is_support_agent()` for staff. The insert policy
on `support_messages` pins `author = 'user'` — without it a user could forge a
reply that appears to come from the team, into their own thread, and screenshot
it.

`is_support_agent()` is `security definer` so the agent policies can read
`support_agents` without that table needing its own SELECT policy — which would
otherwise be a way to enumerate staff accounts.

---

## 6. Diagnostics & privacy

`src/lib/support/diagnostics-policy.ts` is the privacy boundary, split pure from
`diagnostics.ts` exactly as `onboarding-analytics-policy.ts` is split from its
impure half.

**Collected:** app version, build, platform, OS version, device model, locale,
current screen, previous screen, online + connection type, signed-in state,
premium state, feature key, feature UUIDs, last 10 failures as
`{at, category, feature}`, capture timestamp.

**Never collected:** recipe titles, ingredients, dish names, meal-plan or
grocery contents, names, other emails, tokens, precise location, full URLs, and
the `cause` strings from the failure ring — those carry ids and interpolated user
text, so the policy **drops the field rather than scrubbing it**. Scrubbing is a
guess; dropping is a guarantee.

Two enforcement details:

- The module builds its output field by field. No spread, no passthrough
  `Record<string, unknown>`. Adding a field means editing the type *and* the
  builder.
- `support-diagnostics-policy.test.ts` fails on any **unexpected** key, not just
  a missing one. A test that only checked required keys would happily let
  `userEmail` ride along beside them.
- `featureIds` values must match a UUID or they're dropped — the guard against a
  caller reaching for the wrong field and handing over a recipe name.

The in-app disclosure is rendered by `describeDiagnostics()` from the same
object that gets sent, so the list a user sees cannot drift from the payload.

**Screenshots** are user-initiated only. `react-native-view-shot` is installed
and auto-capture would produce better reports, but silently photographing
someone's screen because they tapped "something's not working" is defensible in
a privacy policy and indefensible to a person who finds out.

**Retention:** attachments 90 days · `context` nulled at 12 months · threads 24
months, and immediately on account deletion via `on delete cascade`.

---

## 7. Notifications

Email is the guarantee; push is the convenience. Push depends on a token
round-trip, a native entitlement and a third-party relay, any of which can be
silently wrong in a way we'd only discover from a user saying "nobody ever
replied". `support-reply` therefore sends the email regardless.

`registerPushToken()` **never prompts**. It registers only when permission was
already granted for the meal reminders. Asking someone to enable notifications
at the moment they're reporting a bug is the worst possible timing.

### Getting from a reply to the thread

`support-reply` sends `data: { type: 'support_reply', threadId }`, and
`src/hooks/useSupportNotifications.ts` turns a tap into `/help/<threadId>`.
Three things that hook has to get right:

- **Cold start is not an event.** If the app was killed, no listener fires — the
  launching tap is only readable via `getLastNotificationResponseAsync()`.
- **That call is sticky.** It keeps returning the same response on later
  launches, so the handled identifier is persisted to AsyncStorage. Without
  that, one support reply would hijack every cold start from then on.
- **It waits for the gates.** The root layout redirects un-onboarded and
  unauthenticated users; pushing a thread into that would just get bounced, so
  the intent is queued and fires once the app can show it.

The payload is treated as remote input: anything that isn't
`type === 'support_reply'` with a string `threadId` is ignored, rather than
pushed onto the router.

The reply email carries the same link as `plannplate://help/<threadId>`. Some
email clients refuse to render custom schemes, which is why it's an addition to
the reply rather than the way in — the full reply text is already in the email.

Push needs verification on a native build (remote push does not work in Expo
Go). Everything else works today.

---

## 8. Admin console

`admin/` — Vite + React + TS, ~8 files, deployed static to
`admin.plannplate.com.au`. Setup and agent provisioning are in `admin/README.md`.

There is **no permission check in the client**, on purpose. RLS decides; a
signed-in user without an agent row sees an empty inbox. One rule, one place.
The empty state says so, because otherwise a mis-provisioned account looks like
a quiet week.

Replies go through the `support-reply` edge function rather than a direct insert
— that function is what sends the email and push.

---

## 9. Analytics

Built by `src/lib/support/analytics.ts`, which accepts a bounded shape and can
never be handed free text. Message length travels as a bucket
(`0 | 1-40 | 41-200 | 200+`), never a length and never the text.

The events answer six questions and nothing else: why people contact us, where
problems happen, which repeat, whether quick answers land, where people give up,
and which product areas create friction. `contextual_support_shown` exists so
prompts have a denominator — without it we'd know how often people tapped, not
how often we offered.

---

## 10. Roadmap

**Phase 2** — FAQ suggestions from the composer's first sentence · canned
replies · thread search in admin · attachment annotation · per-feature support
health.

**Phase 3** — AI issue classification and diagnostic summarisation (`context` is
already the right input shape) · duplicate clustering on `fingerprint` ·
proactive outreach when a fingerprint spikes · searchable knowledge base.

**Do not build:** ticket numbers, priorities, SLAs, assignment, satisfaction
surveys, live chat, categories in the composer, or a third admin view.

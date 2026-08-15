# PlanNplate (PNP) — Product & Data Overview for Compliance Review

**Prepared:** 3 August 2026 · **Purpose:** brief a lawyer to assess privacy, consumer-law and AI compliance. Bracketed `[…]` items are to be confirmed by the PNP team.

## 1. What the product is
PlanNplate ("PNP") is a mobile app (iOS and Android) that helps individuals and households plan meals, generate and adapt recipes using AI, build grocery lists, and import recipes from the web/social. Built in React Native (Expo).

- **Operator:** [LEGAL ENTITY NAME], ABN [ABN], [ADDRESS].
- **Website / contact:** plannplate.com.au · privacy contact privacy@heylivingclub.com · [support email].
- **Primary market:** Australia (some sub-processors operate overseas, incl. the US).
- **Users / age:** consumer app; intended minimum age [16]. No dedicated child experience.

## 2. Core features
- Onboarding that captures cooking preferences and (optionally) allergies/dietary restrictions.
- **AI recipe & meal-plan generation** (via OpenAI, called through our own servers).
- Grocery list generation, editing, saving/sharing.
- **Recipe import** from URLs and social/web links (automated extraction).
- **Voice input** ("Speak") — short audio recorded and transcribed to text.
- Optional **paid subscriptions** (premium features).

## 3. Personal information collected
- **Account:** name, email; OAuth identifiers if signing in with Apple / Google / Facebook (no social passwords received).
- **Preferences:** household, cooking days/time, skill, cuisines, equipment, budget, goals, meal habits.
- **Sensitive information:** allergies and dietary restrictions — **collected only with user consent** (a consent timestamp is recorded), used solely to filter/validate recipes; optional and user-editable/removable.
- **User content:** meal plans, recipes (saved/generated/imported), grocery lists, cooking logs, ratings.
- **Voice:** short audio for transcription [confirm whether audio is discarded post-transcription].
- **Usage/analytics & device/technical data.**
- **Subscription status/entitlements** (not full payment card data).

## 4. AI processing
User preferences and provided/imported content are sent through our servers to **OpenAI** to generate, adapt, parse and extract recipes/nutrition, then returned to the app. Stated positions: we **do not sell** data and **do not use user content to train third-party models**. AI output can be inaccurate — disclaimers are surfaced in-app (see §7).

## 5. Third parties / sub-processors
Supabase (auth, database, storage, server functions), OpenAI (AI), RevenueCat (subscriptions), PostHog (analytics), Meta (app events), Pexels (stock imagery), Apple / Google (sign-in + in-app purchases). Payments are processed by the app stores; PNP does not store card details. Some providers process data in the **United States**.

## 6. Permissions & device access
Microphone (voice feature) and notifications; both user-controllable via device settings.

## 7. Current compliance-facing measures
- In-app plain-English privacy summary + link to hosted full policy; Terms link (currently points to Apple's generic EULA — being replaced with PNP Terms).
- **Consent gate** before storing allergy/dietary (sensitive) data.
- Neutral **allergen disclosure** ("Contains: …") on recipes, framed as food-label info, not a personalised warning.
- **In-app account & data deletion.**
- Draft Privacy Policy, Terms & Conditions, and AI-recipe disclaimers prepared (available on request).

## 8. Areas we'd specifically like assessed
1. Handling of **allergy/dietary data** as sensitive information (consent, use limitation, security) under the Privacy Act / APPs.
2. **AI accuracy + food-safety/allergen liability** — adequacy of disclaimers and the "convenience, not a guarantee" framing.
3. **Overseas data disclosure** (US sub-processors) and required notices.
4. **Australian Consumer Law** — non-excludable guarantees vs. our liability limitations/disclaimers.
5. **Subscription** auto-renewal / trial disclosures and store-billing compliance.
6. **Recipe import from social/web** — IP and third-party terms-of-service exposure.
7. **Age gating / children** and any consequent obligations.

## 9. Open items for PNP to confirm
Legal entity name / ABN / registered address; correct operating entity vs. the heylivingclub.com contact; data-retention periods; whether voice recordings are discarded after transcription; final minimum-age and governing-law state.

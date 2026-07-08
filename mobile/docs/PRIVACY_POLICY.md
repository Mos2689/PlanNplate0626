# PlanNplate — Privacy Policy

**Effective date:** [INSERT DATE]
**Last updated:** [INSERT DATE]

> **Fill-in placeholders before publishing** — everything in `[SQUARE BRACKETS]` must be completed:
> `[LEGAL ENTITY NAME]`, `[ABN/NZBN if applicable]`, `[REGISTERED ADDRESS]`, `[PRIVACY CONTACT EMAIL]`, `[SUPPORT EMAIL]`, `[WEBSITE URL]`, `[DELETION REQUEST URL]`.
>
> This document is a template prepared to reflect how the PlanNplate app is built. It is **not legal advice** — have it reviewed by a qualified privacy lawyer in your operating jurisdictions before you publish or submit to the App Store / Play Store.

---

## 1. Introduction

This Privacy Policy explains how **[LEGAL ENTITY NAME]** (“PlanNplate”, “we”, “us”, or “our”) collects, uses, discloses, stores, and protects your personal information when you use the **PlanNplate** mobile application (the “App”) and related services (together, the “Services”).

We are committed to protecting your privacy and complying with:

- the **Australian Privacy Act 1988 (Cth)** and the **13 Australian Privacy Principles (APPs)**, including the Notifiable Data Breaches (NDB) scheme;
- the **New Zealand Privacy Act 2020** and the **13 Information Privacy Principles (IPPs)**;
- the **Apple App Store Review Guidelines** and Apple’s privacy requirements; and
- the **Google Play Developer Program Policies**, including the User Data policy and Data safety requirements.

By creating an account or using the Services, you acknowledge you have read and understood this Policy. Where we rely on your consent (for example, to handle sensitive information — see Section 5), we will ask for it separately in the App.

---

## 2. Who we are and how to contact us

**Data controller / APP entity / IPP agency:** [LEGAL ENTITY NAME]
**ABN / NZBN:** [ABN/NZBN if applicable]
**Address:** [REGISTERED ADDRESS]
**Privacy enquiries:** [PRIVACY CONTACT EMAIL]
**Support:** [SUPPORT EMAIL]

If you have a question, request, or complaint about privacy, contact us at **[PRIVACY CONTACT EMAIL]**. We aim to acknowledge requests within a reasonable period and to respond substantively within **30 days** (or as required by law).

---

## 3. The personal information we collect

We only collect information we need to run the Services. The categories below reflect what the App actually does.

### 3.1 Information you give us

| Category | Examples | Notes |
|---|---|---|
| **Account information** | Email address, password, display name | Passwords are handled by our authentication provider and are stored **hashed** — we never see or store your plaintext password. |
| **Dietary & health preferences** *(sensitive information)* | Allergies and intolerances, dietary restrictions (e.g. vegetarian, halal, gluten-free) | Treated as **sensitive/health information** — collected only **with your consent** (see Section 5). |
| **Cooking preferences** | Preferred cuisines, cooking time/window, skill level, household size, servings, weekly/monthly budget, units (metric/imperial) | Used to personalise meal plans and grocery lists. |
| **Content you create** | Meal plans, saved and imported recipes, grocery lists, cooking logs, meal ratings and feedback | Stored to your account so it syncs across sessions. |
| **Voice input** | Short audio recordings when you use the “speak your grocery list” feature | See Section 3.4 — audio is transcribed and **not retained** after transcription. |
| **Imported recipe links** | URLs you paste to import a recipe, and the recipe content returned | If you import a third-party recipe, we may store the source URL for attribution and link-back. |
| **Communications** | Emails or messages you send us | Used to respond to and support you. |

### 3.2 Information collected automatically

| Category | Examples |
|---|---|
| **Usage data** | Features used and counts (e.g. number of plans generated, grocery lists built, voice entries used) — used to operate free/premium limits and improve the App |
| **Device & technical data** | Device/OS type, app version, approximate **region/locale** derived from your device settings (used to choose measurement units and currency symbol), diagnostic/crash information |
| **Subscription data** | Subscription status, entitlements, and purchase history from the app stores via our subscription provider (see Section 6). We do **not** receive your full payment card details. |

### 3.3 Information from third parties

- **Apple / Google (in-app purchases):** transaction and subscription validation data.
- **RevenueCat (subscription management):** subscription state and anonymised purchase identifiers.
- We do **not** buy personal information from data brokers.

### 3.4 Voice data (specific disclosure)

When you use the optional voice-to-grocery feature:

1. The App accesses your device **microphone** (only after you grant OS permission) to record a short clip while you speak your list.
2. The audio is sent securely to our backend, which forwards it to a **speech-to-text provider** to convert it into text.
3. We keep the **resulting text** items you add to your grocery list. The **audio recording is not stored** on our servers after transcription.

You can use the App without ever using voice input — typing your list is always available.

---

## 4. How and why we use your information (purposes & legal basis)

We use personal information to:

- **Provide the Services** — create and manage your account, generate personalised meal plans, build grocery lists, save/import recipes, and sync your data across sessions.
- **Personalise content** — apply your dietary, allergy, cuisine, time, budget, and household preferences so we don’t suggest meals that don’t fit you (including strictly excluding/flagging allergens).
- **Operate subscriptions & limits** — manage free-tier limits, premium entitlements, and billing through the app stores.
- **Communicate with you** — respond to support requests, send service and account emails, and (if you opt in) send re-engagement/reminder push notifications.
- **Improve and secure the Services** — diagnose problems, prevent fraud and abuse, and enhance features.
- **Comply with legal obligations.**

**Legal bases / handling grounds:** We handle personal information to **perform our contract** with you (providing the App), on the basis of your **consent** (sensitive information, microphone access, marketing/push notifications), for our **legitimate interests** (securing and improving the Services), and to meet **legal obligations**. Under the Australian APPs and NZ IPPs we collect personal information by lawful and fair means, only for purposes reasonably necessary for our functions, and use/disclose it only for those purposes or a directly related purpose you would reasonably expect (APP 3 & 6; IPPs 1–3, 10 & 11).

We do **not** sell your personal information, and we do **not** use your content to train third-party AI models for their own purposes.

---

## 5. Sensitive information and consent

Allergy, intolerance, and dietary-restriction data can reveal information about your **health**, which is **“sensitive information”** under the Australian Privacy Act (APP 3.3) and **health information** under the NZ Privacy Act.

- We collect this information **only with your express consent**, which we request through an in-App consent step during onboarding.
- We use it **solely** to personalise your meal plans and grocery lists and to keep allergens out of (or flagged in) your suggestions.
- We do **not** disclose it for marketing or to any party except the sub-processors needed to deliver the Service (Section 6).
- You can change or clear these preferences at any time in the App, or delete your account (Section 10).

If you do not wish to provide this information, you can decline; some personalisation features may then be limited.

---

## 6. Disclosure of your information and our sub-processors

We disclose personal information only to trusted service providers (“sub-processors”) who help us run the Services, under contractual confidentiality and security obligations, and only for the purposes described in this Policy:

| Sub-processor | Purpose | Data involved |
|---|---|---|
| **Supabase** | Cloud database, authentication, and secure backend functions | Account, profile/preferences, app content |
| **OpenAI** | Recipe generation and voice transcription (via our backend) | Preferences/prompts; voice audio for transcription (not retained by us) |
| **RevenueCat** | Subscription and entitlement management | Purchase/subscription identifiers and status |
| **Apple App Store / Google Play** | In-app purchases and billing | Transaction and subscription data |
| **Pexels** | Recipe image search | Search terms only (no account data) |
| **[Email provider, e.g. Resend]** | Transactional emails (verification, password reset) | Email address |
| **[Push provider, e.g. Expo]** | Sending re-engagement/reminder push notifications (if enabled) | Push token, first name |

We may also disclose personal information where required or authorised by law, to enforce our terms, to protect the rights, safety, or property of any person, or in connection with a business transfer (e.g. merger or acquisition), subject to this Policy.

---

## 7. Overseas / cross-border disclosure

We are based in **[COUNTRY]**, and several of our sub-processors (including Supabase, OpenAI, and RevenueCat) store and process data on servers located **outside Australia and New Zealand**, primarily in the **United States** and other jurisdictions.

- **Australia (APP 8):** Before disclosing your personal information to overseas recipients, we take reasonable steps to ensure they handle it consistently with the APPs, through contractual and technical safeguards. By using the Services, you acknowledge that once information is disclosed overseas we may be unable to guarantee the recipient’s compliance with Australian law, and that Australian courts/regulators may have limited reach over them.
- **New Zealand (IPP 12):** We only disclose personal information to overseas recipients where the recipient is subject to comparable privacy safeguards, is bound by contractual protections, or you have authorised the disclosure after being informed the recipient may not be required to protect the information in a way that provides comparable safeguards to the NZ Privacy Act.

---

## 8. Data retention

We keep personal information only for as long as necessary to provide the Services and for legitimate business or legal purposes:

- **Account and content:** retained while your account is active.
- **Voice audio:** not retained after transcription (Section 3.4).
- **After account deletion:** we delete or de-identify your personal information within a reasonable period, except where we must retain limited records to meet legal, tax, accounting, or dispute-resolution obligations.
- **Backups:** residual copies may persist in secure backups for a limited period before being overwritten.

---

## 9. How we protect your information

We take reasonable technical and organisational measures to protect personal information from misuse, interference, loss, and unauthorised access, modification, or disclosure, including:

- Encryption of data **in transit** (HTTPS/TLS) and encryption at rest by our cloud providers;
- Authentication and access controls; passwords stored **hashed**, never in plaintext;
- Secrets (server API keys) held server-side and never shipped in the App;
- Least-privilege access for staff and providers.

No method of transmission or storage is completely secure. While we strive to protect your information, we cannot guarantee absolute security.

---

## 10. Your privacy rights and choices

Subject to applicable law, you can:

- **Access** the personal information we hold about you (APP 12 / IPP 6).
- **Correct** inaccurate or out-of-date information (APP 13 / IPP 7) — most preferences and content can be edited directly in the App.
- **Delete your account and data** — you can delete your account from within the App (**Profile → account settings**), or by emailing **[PRIVACY CONTACT EMAIL]**. You can also submit a deletion request at **[DELETION REQUEST URL]**. On deletion we remove your account and associated personal information as described in Section 8.
- **Withdraw consent** — change or clear your dietary/health preferences, revoke microphone permission in your device settings, or turn off push notifications at any time.
- **Opt out of non-essential communications** — via the App settings or unsubscribe links.

To protect your account we may need to verify your identity before actioning a request. We will not charge an excessive fee, and if we refuse a request we will tell you why.

---

## 11. Children’s privacy

The Services are intended for users aged **[16]** and over and are not directed at children. We do not knowingly collect personal information from children under this age. If you believe a child has provided us with personal information, contact **[PRIVACY CONTACT EMAIL]** and we will delete it. This aligns with Apple’s and Google’s policies on apps not directed to children.

---

## 12. Push notifications

If you enable notifications, we send reminders and re-engagement messages (for example, prompts to plan your week). We use a push token and your first name to personalise these. You can disable notifications at any time in your device settings or in the App.

---

## 13. Third-party links and imported content

The App may display links to third-party recipe sources (for attribution/“view original”) and other websites. We are not responsible for the privacy practices or content of those third parties. Review their privacy policies before providing them with personal information.

---

## 14. Data breach notification

If a data breach involving your personal information is likely to result in serious harm, we will notify you and the relevant regulator as required by:

- the **Notifiable Data Breaches (NDB) scheme** under the Australian Privacy Act — notifying affected individuals and the **Office of the Australian Information Commissioner (OAIC)**; and
- the **NZ Privacy Act 2020** notifiable-breach requirements — notifying affected individuals and the **Office of the Privacy Commissioner (OPC)**.

---

## 15. Complaints

If you are concerned about how we have handled your personal information, please contact us first at **[PRIVACY CONTACT EMAIL]** so we can try to resolve it. If you are not satisfied, you may complain to your regulator:

- **Australia — Office of the Australian Information Commissioner (OAIC):** www.oaic.gov.au · 1300 363 992
- **New Zealand — Office of the Privacy Commissioner (OPC):** www.privacy.org.nz · 0800 803 909

---

## 16. Changes to this Policy

We may update this Policy from time to time. We will post the updated version in the App and/or on our website and update the “Last updated” date. Material changes will be notified to you where required. Continued use of the Services after changes take effect constitutes acceptance of the updated Policy.

---

## 17. Contact us

**[LEGAL ENTITY NAME]**
Privacy enquiries: **[PRIVACY CONTACT EMAIL]**
Support: **[SUPPORT EMAIL]**
Address: **[REGISTERED ADDRESS]**

---

### Appendix A — App Store / Play Store disclosure mapping (internal reference, not part of the public policy)

Use this to complete the store privacy forms consistently with the Policy above.

**Apple “App Privacy” (nutrition label) — data types to declare:**
- **Contact info:** email address, name → *App functionality, Account management.*
- **Health & Fitness:** dietary/allergy data → *App functionality* (linked to identity; not used for tracking).
- **User content:** recipes, meal plans, grocery lists, audio data (voice input) → *App functionality.*
- **Identifiers:** user ID → *App functionality.*
- **Purchases:** purchase history → *App functionality.*
- **Usage data:** product interaction → *Analytics / App functionality.*
- **Diagnostics:** crash/performance data → *App functionality.*
- **Tracking:** **No** — the App does not track users across other companies’ apps/sites (no ATT prompt required unless you later add tracking SDKs).
- **Account deletion:** in-app account deletion is provided (Apple requirement).

**Google Play “Data safety” — declare:**
- Data **collected**: email, name, health info (dietary/allergies), app activity/usage, purchase history, audio (transient — transcribed then discarded), app info/performance, device identifiers.
- Data **shared** with sub-processors listed in Section 6 for app functionality.
- Security practices: encrypted in transit; users can request deletion (provide **[DELETION REQUEST URL]**).
- Data deletion: account deletion available in-app **and** via web request URL (Google requirement).

> **Action items before submission:**
> 1. Fill every `[PLACEHOLDER]`.
> 2. Confirm the in-app **account deletion** flow actually deletes server-side data end-to-end (Apple & Google both require this to work).
> 3. Publish this Policy at a public URL and link it in App Store Connect, Play Console, and the App’s settings.
> 4. Have a lawyer review for your specific entity, turnover, and jurisdictions (note the Australian Privacy Act reforms progressively taking effect from 2024–2025).

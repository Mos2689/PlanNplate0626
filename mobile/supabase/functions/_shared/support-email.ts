// Support email — the two messages the support loop sends.
//
// Kept out of email-send/index.ts on purpose. That function's templates are
// marketing-shaped (gradients, feature bullets, a 100px logo); a support reply
// that arrives looking like a newsletter reads as automated, which is the exact
// opposite of what the reply needs to convey. These two are plain, narrow and
// quiet — closer to an email from a person than from a system.
//
// The internal digest is the opposite: dense and skimmable, because an agent is
// triaging, not reading.

const SUPPORT_FROM = 'PlanNplate <support@plannplate.com.au>';

/** Where new support requests land. Override with the SUPPORT_INBOX secret. */
export function supportInbox(): string {
  return Deno.env.get('SUPPORT_INBOX') || 'admin@heylivingclub.com.au';
}

async function getResendClient() {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return null;
  const { Resend } = await import('https://esm.sh/resend@3.2.0');
  return new Resend(apiKey);
}

/** Escape user-authored text before it goes anywhere near an HTML email. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Send, and never throw.
 *
 * A support request that was written to the database but whose notification
 * email bounced is a delay. A request that 500s because Resend was down is a
 * lost message and a user who thinks nobody heard them. So delivery failures
 * are logged and swallowed — the row is the source of truth, and the admin
 * inbox polls it regardless.
 */
export async function sendSupportEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  try {
    const resend = await getResendClient();
    if (!resend) {
      console.warn('[SupportEmail] RESEND_API_KEY not set — skipping send.');
      return false;
    }
    const { error } = await resend.emails.send({
      from: SUPPORT_FROM,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      reply_to: opts.replyTo,
    });
    if (error) {
      console.error('[SupportEmail] Send error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[SupportEmail] Unexpected send failure:', e);
    return false;
  }
}

const INTENT_LABEL: Record<string, string> = {
  bug: 'Something not working',
  question: 'Question',
  idea: 'Idea',
};

/**
 * Internal digest — what the team sees when a request arrives.
 *
 * The diagnostics block is the whole point: it is what lets an agent answer
 * without a round trip asking "what version are you on?".
 */
export function internalDigest(input: {
  intent: string;
  message: string;
  feature: string | null;
  userEmail: string | null;
  userId: string;
  threadId: string;
  attachmentCount: number;
  context: Record<string, unknown>;
}): { subject: string; html: string; text: string } {
  const label = INTENT_LABEL[input.intent] ?? 'Support';
  const preview = input.message.replace(/\s+/g, ' ').slice(0, 60);
  const subject = `[${label}] ${preview}${input.message.length > 60 ? '…' : ''}`;

  const rows = Object.entries(input.context)
    .map(([k, v]) => {
      const value = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `<tr><td style="padding:2px 12px 2px 0;color:#6b7280;white-space:nowrap;">${esc(k)}</td><td style="padding:2px 0;color:#111827;font-family:ui-monospace,Menlo,monospace;">${esc(value)}</td></tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;max-width:680px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6a7d56;">${esc(label)}${input.feature ? ` · ${esc(input.feature)}` : ''}</p>
  <h1 style="margin:0 0 16px;font-size:18px;font-weight:600;">From ${esc(input.userEmail ?? 'an account with no email on file')}</h1>
  <div style="white-space:pre-wrap;background:#f9fafb;border-left:3px solid #6a7d56;padding:14px 16px;border-radius:0 8px 8px 0;font-size:15px;line-height:1.6;">${esc(input.message)}</div>
  ${input.attachmentCount > 0 ? `<p style="font-size:13px;color:#6b7280;margin:12px 0 0;">${input.attachmentCount} screenshot${input.attachmentCount === 1 ? '' : 's'} attached — view in the admin console.</p>` : ''}
  <h2 style="margin:24px 0 8px;font-size:13px;font-weight:600;color:#374151;">App details</h2>
  <table style="font-size:12.5px;border-collapse:collapse;">${rows}</table>
  <p style="margin:24px 0 0;font-size:13px;">
    <a href="https://admin.plannplate.com.au/?thread=${esc(input.threadId)}" style="color:#6a7d56;font-weight:600;">Open in the admin console →</a>
  </p>
  <p style="margin:16px 0 0;font-size:11.5px;color:#9ca3af;">user ${esc(input.userId)}</p>
</body></html>`;

  const text = `${label}${input.feature ? ` · ${input.feature}` : ''}
From ${input.userEmail ?? 'an account with no email on file'}

${input.message}

${input.attachmentCount > 0 ? `${input.attachmentCount} screenshot(s) attached.\n` : ''}
App details:
${Object.entries(input.context)
  .map(([k, v]) => `  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
  .join('\n')}

Open: https://admin.plannplate.com.au/?thread=${input.threadId}
user ${input.userId}`;

  return { subject, html, text };
}

/**
 * The reply a user receives.
 *
 * Deliberately unbranded past the sign-off: no logo, no CTA button, no
 * unsubscribe furniture. It should read like someone typed it, because someone
 * did. The original message is quoted underneath so the reply makes sense on
 * its own weeks later.
 */
export function replyEmail(input: {
  agentName: string;
  body: string;
  originalMessage: string;
  threadId: string;
}): { subject: string; html: string; text: string } {
  const subject = 'Re: your message to PlanNplate';

  // Deep link straight into the conversation. `plannplate://` is the scheme
  // declared in app.json, and expo-router maps the path to the route — so this
  // opens the thread rather than the home screen.
  //
  // Caveat worth knowing: some email clients refuse to render custom schemes as
  // links. That's why it is an ADDITION to the reply, never the only way in —
  // the full reply text is already above it, and the push notification carries
  // the same deep link for the common case.
  const deepLink = `plannplate://help/${input.threadId}`;

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#15140F;max-width:560px;margin:0 auto;padding:28px 24px;line-height:1.65;font-size:15.5px;">
  <div style="white-space:pre-wrap;">${esc(input.body)}</div>
  <p style="margin:24px 0 0;">— ${esc(input.agentName)}, PlanNplate</p>
  <p style="margin:22px 0 0;">
    <a href="${esc(deepLink)}" style="color:#546445;font-weight:600;text-decoration:none;">Open the conversation in PlanNplate →</a>
  </p>
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #ECEAE2;color:#9A968B;font-size:13px;">
    <p style="margin:0 0 6px;">You wrote:</p>
    <div style="white-space:pre-wrap;">${esc(input.originalMessage.slice(0, 600))}</div>
  </div>
  <p style="margin:20px 0 0;color:#9A968B;font-size:12.5px;">Reply to this email and it'll reach us, or continue in the app.</p>
</body></html>`;

  const text = `${input.body}

— ${input.agentName}, PlanNplate

Open the conversation in PlanNplate: ${deepLink}

You wrote:
${input.originalMessage.slice(0, 600)}

Reply to this email and it'll reach us, or continue in the app.`;

  return { subject, html, text };
}

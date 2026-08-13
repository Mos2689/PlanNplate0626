/**
 * Support copy purity guard.
 *
 * The sibling of failure-copy.test.ts, and it deliberately reuses that file's
 * rules: support wording is read at exactly the same moments as failure
 * wording, so it must clear the same bar. A support screen that says "we
 * couldn't parse the server response" undoes everything the failure catalogue
 * achieved.
 *
 * It then adds a second list the failure copy doesn't need: the vocabulary of
 * support SOFTWARE. Words like ticket, case and reference number are what make
 * a product feel like it has a support department rather than a team, and they
 * creep in one well-meaning edit at a time.
 */

import { supportCopy, confirmationBody } from '../support/copy';
import { FAQS } from '../support/faqs';

/**
 * Terms that must never appear in anything a user reads. Kept in sync with
 * failure-copy.test.ts — if you change one, change both.
 */
const BANNED_TECHNICAL: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\bsupabase\b/i, why: 'names the database vendor' },
  { pattern: /\bopenai\b|\bgpt\b|\bwhisper\b/i, why: 'names the AI provider' },
  { pattern: /\brevenuecat\b|\bposthog\b|\bfirebase\b|\bresend\b/i, why: 'names a third-party SDK' },
  { pattern: /\bhttp\b|\bhttps\b|\bapi\b|\bendpoint\b|\bserver error\b/i, why: 'exposes transport detail' },
  { pattern: /\bsql\b|\bdatabase\b|\btable\b|\bquery\b|\bschema\b/i, why: 'exposes storage detail' },
  { pattern: /\bstack\b|\bexception\b|\btrace\b|\bnull\b|\bundefined\b|\bNaN\b/i, why: 'exposes runtime internals' },
  { pattern: /\bJSON\b|\bparse\b|\btoken\b|\bpayload\b/i, why: 'exposes serialisation detail' },
  { pattern: /\bmetadata\b|\bdiagnostics\b|\blog file\b/i, why: 'exposes the diagnostics machinery' },
  { pattern: /\b[1-5]\d{2}\b/, why: 'looks like a status code' },
];

/**
 * The vocabulary of support software. Every one of these has a warmer,
 * shorter, more human alternative, which is the whole point of the voice.
 */
const BANNED_SUPPORT_JARGON: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\bticket(s|ed)?\b/i, why: 'we do not have tickets, we have conversations' },
  { pattern: /\bcase (number|id)\b|\bcase#/i, why: 'a case is a record, not a conversation' },
  { pattern: /\bsubmit(ted|ting)?\b/i, why: '"submit" is form language — prefer "send"' },
  { pattern: /\breference number\b|\bref no\b/i, why: 'users should never see an identifier' },
  { pattern: /\bsupport department\b|\bhelp desk\b|\bhelpdesk\b/i, why: 'implies a call centre' },
  { pattern: /\bagent\b|\brepresentative\b/i, why: 'the team are people, not agents' },
  { pattern: /\binquiry\b|\benquiry\b/i, why: 'formal where the voice is plain' },
  { pattern: /\bsuccessfully\b/i, why: 'systems report success; people just say what happened' },
  { pattern: /\bplease be advised\b|\bkindly\b/i, why: 'corporate register' },
  { pattern: /\bescalat(e|ed|ion)\b|\bSLA\b/i, why: 'internal process language' },
];

const ALL_BANNED = [...BANNED_TECHNICAL, ...BANNED_SUPPORT_JARGON];

/** Flatten the nested copy object into [path, string] pairs. */
function flatten(value: unknown, path = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      flatten(child, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

const allSupportStrings = flatten(supportCopy);
const allFaqStrings: Array<[string, string]> = FAQS.flatMap((faq) => [
  [`faq.${faq.id}.question`, faq.question] as [string, string],
  [`faq.${faq.id}.answer`, faq.answer] as [string, string],
]);

describe('support copy is user-safe', () => {
  it('has strings to check (guards against the flattener silently breaking)', () => {
    expect(allSupportStrings.length).toBeGreaterThan(25);
  });

  it.each(allSupportStrings)('%s contains no banned terminology', (key, text) => {
    for (const { pattern, why } of ALL_BANNED) {
      expect({ key, text, why, matched: pattern.test(text) }).toMatchObject({ matched: false });
    }
  });

  it.each(allFaqStrings)('%s contains no banned terminology', (key, text) => {
    for (const { pattern, why } of ALL_BANNED) {
      expect({ key, text, why, matched: pattern.test(text) }).toMatchObject({ matched: false });
    }
  });

  it('has no empty strings', () => {
    const empty = allSupportStrings.filter(([, text]) => !text.trim());
    expect(empty.map(([k]) => k)).toEqual([]);
  });
});

describe('quick answers stay quick', () => {
  it('is a deliberately short list', () => {
    // The moment this grows past a dozen it has become a knowledge base, which
    // is a different product with different rules (search, categories,
    // maintenance). Growing it should be a decision, not a drift.
    expect(FAQS.length).toBeLessThanOrEqual(10);
    expect(FAQS.length).toBeGreaterThanOrEqual(6);
  });

  it('keeps every answer under 60 words', () => {
    const tooLong = FAQS.filter((f) => f.answer.split(/\s+/).length > 60).map((f) => f.id);
    expect(tooLong).toEqual([]);
  });

  it('uses stable, unique ids — they are the analytics key', () => {
    const ids = FAQS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('phrases every entry as a question', () => {
    const notQuestions = FAQS.filter((f) => !f.question.trim().endsWith('?')).map((f) => f.id);
    expect(notQuestions).toEqual([]);
  });
});

describe('the confirmation tells the user where the reply lands', () => {
  it('names the address when we have one', () => {
    const body = confirmationBody('cook@example.com');
    expect(body).toContain('cook@example.com');
    expect(body).not.toContain('{email}');
  });

  it('degrades to a version with no address rather than an empty gap', () => {
    const body = confirmationBody(null);
    expect(body).not.toContain('{email}');
    expect(body.trim().length).toBeGreaterThan(20);
  });

  it('always promises a person and a timeframe', () => {
    // These two facts are the entire job of the confirmation. If a future edit
    // drops either, the state stops doing what it exists to do.
    for (const body of [confirmationBody('a@b.com'), confirmationBody(null)]) {
      expect(body).toMatch(/someone|team|person/i);
      expect(body).toMatch(/day|hours|soon/i);
    }
  });
});

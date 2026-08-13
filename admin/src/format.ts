/** "3m", "2h", "yesterday", "14 Aug" — enough to triage by, no more. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.floor((Date.now() - then) / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return 'yesterday';

  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Turn the diagnostics blob into ordered, readable rows.
 *
 * Explicit ordering rather than `Object.entries`: the fields an agent reaches
 * for first (version, device, screen) should be at the top every time, so the
 * block can be scanned rather than read.
 */
const FIELD_ORDER = [
  'appVersion',
  'buildNumber',
  'platform',
  'osVersion',
  'deviceModel',
  'screen',
  'previousScreen',
  'online',
  'connectionType',
  'isPremium',
  'signedIn',
  'locale',
  'feature',
  'featureIds',
  'recentFailures',
  'capturedAt',
];

const FIELD_LABEL: Record<string, string> = {
  appVersion: 'App version',
  buildNumber: 'Build',
  platform: 'Platform',
  osVersion: 'OS',
  deviceModel: 'Device',
  screen: 'Screen',
  previousScreen: 'Came from',
  online: 'Online',
  connectionType: 'Connection',
  isPremium: 'Premium',
  signedIn: 'Signed in',
  locale: 'Locale',
  feature: 'Area',
  featureIds: 'Ids',
  recentFailures: 'Recent hiccups',
  capturedAt: 'Captured',
};

export function contextRows(
  context: Record<string, unknown>,
): Array<{ label: string; value: string }> {
  const keys = [
    ...FIELD_ORDER.filter((k) => k in context),
    // Anything the app starts sending that this console doesn't know about
    // still shows, rather than being silently dropped.
    ...Object.keys(context).filter((k) => !FIELD_ORDER.includes(k)),
  ];

  return keys.map((key) => {
    const raw = context[key];
    let value: string;

    if (key === 'recentFailures' && Array.isArray(raw)) {
      value = raw.length
        ? raw.map((f: { feature: string; category: string }) => `${f.feature}/${f.category}`).join(', ')
        : 'none';
    } else if (raw && typeof raw === 'object') {
      const entries = Object.entries(raw as Record<string, unknown>);
      value = entries.length ? entries.map(([k, v]) => `${k}=${v}`).join(', ') : 'none';
    } else {
      value = String(raw);
    }

    return { label: FIELD_LABEL[key] ?? key, value };
  });
}

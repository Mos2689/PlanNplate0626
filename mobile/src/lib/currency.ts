// currency.ts — lightweight, dependency-free currency localization.
//
// Mirrors the measurement-system detection in unit-conversion.ts: we read the
// device locale's region via the built-in Intl API (pure JS, no native module)
// and map it to a currency. Falls back to USD when the region is unknown or the
// currency isn't in our table.

export interface CurrencyInfo {
  /** ISO 4217 code, e.g. "AUD". */
  code: string;
  /** Display symbol, e.g. "$", "£", "₹". */
  symbol: string;
}

const USD: CurrencyInfo = { code: 'USD', symbol: '$' };
const EUR: CurrencyInfo = { code: 'EUR', symbol: '€' };

// Region (ISO 3166-1 alpha-2) → currency. Covers the app's launch markets plus
// common ones; anything else falls back to USD.
const REGION_CURRENCY: Record<string, CurrencyInfo> = {
  // Dollar markets
  US: USD,
  CA: { code: 'CAD', symbol: '$' },
  AU: { code: 'AUD', symbol: '$' },
  NZ: { code: 'NZD', symbol: '$' },
  SG: { code: 'SGD', symbol: '$' },
  HK: { code: 'HKD', symbol: '$' },
  // Other symbols
  GB: { code: 'GBP', symbol: '£' },
  IN: { code: 'INR', symbol: '₹' },
  MY: { code: 'MYR', symbol: 'RM' },
  JP: { code: 'JPY', symbol: '¥' },
  CN: { code: 'CNY', symbol: '¥' },
  AE: { code: 'AED', symbol: 'د.إ' },
  ZA: { code: 'ZAR', symbol: 'R' },
  CH: { code: 'CHF', symbol: 'CHF' },
  // Eurozone
  IE: EUR, DE: EUR, FR: EUR, ES: EUR, IT: EUR, NL: EUR, BE: EUR, AT: EUR,
  PT: EUR, FI: EUR, GR: EUR, LU: EUR, SK: EUR, SI: EUR, EE: EUR, LV: EUR,
  LT: EUR, CY: EUR, MT: EUR, HR: EUR,
};

function detectDeviceRegion(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    const match = locale.match(/[-_]([A-Za-z]{2})(?:[-_]|$)/); // e.g. "en-AU" → AU
    return match ? match[1].toUpperCase() : '';
  } catch {
    return '';
  }
}

/** The device's currency, detected once at module load. */
export const DEVICE_CURRENCY: CurrencyInfo = REGION_CURRENCY[detectDeviceRegion()] ?? USD;

/** Just the symbol for the device's currency (e.g. "$", "£", "₹"). */
export function deviceCurrencySymbol(): string {
  return DEVICE_CURRENCY.symbol;
}

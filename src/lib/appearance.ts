// Display currency stored in localStorage: a display preference, not stored data.

export type CurrencyCode = 'CAD' | 'USD';

export interface CurrencyOption {
  code: CurrencyCode;
  label: string;
  symbol: string;
}

export const CURRENCIES: readonly CurrencyOption[] = [
  { code: 'CAD', label: 'Canadian dollar', symbol: 'CA$' },
  { code: 'USD', label: 'US dollar', symbol: 'US$' },
];

export const DEFAULT_CURRENCY: CurrencyCode = 'USD';

export const CURRENCY_STORAGE_KEY = 'tf4900.currency';

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && CURRENCIES.some((c) => c.code === value);
}

export function currencySymbol(code: CurrencyCode): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? CURRENCIES[0].symbol;
}

/** Format an amount for display; empty or non-numeric input returns an empty string. */
export function formatMoney(value: string | number | null | undefined, code: CurrencyCode): string {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text) return '';
  const amount = Number(text.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(amount)) return '';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencySymbol(code)}${amount.toFixed(2)}`;
  }
}
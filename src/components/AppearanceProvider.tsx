'use client';

import * as React from 'react';
import {
  CURRENCY_STORAGE_KEY,
  DEFAULT_CURRENCY,
  type CurrencyCode,
  currencySymbol,
  isCurrencyCode,
} from '@/lib/appearance';

interface AppearanceValue {
  currency: CurrencyCode;
  symbol: string;
  setCurrency: (code: CurrencyCode) => void;
}

const AppearanceContext = React.createContext<AppearanceValue | null>(null);

// Written by this tab; the 'storage' event keeps other tabs in step.
const CHANGE_EVENT = 'tf4900.appearance-change';

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Returns a string, so identity comparison is enough for React. */
function getSnapshot(): CurrencyCode {
  try {
    const raw = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
    return isCurrencyCode(raw) ? raw : DEFAULT_CURRENCY;
  } catch {
    // Storage throws in private browsing and sandboxed iframes.
    return DEFAULT_CURRENCY;
  }
}

/** The server has no storage, so it always renders the default. */
function getServerSnapshot(): CurrencyCode {
  return DEFAULT_CURRENCY;
}

/** Reads currency from storage on every render, so no effect or second pass is needed. */
export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const currency = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setCurrency = React.useCallback((code: CurrencyCode) => {
    try {
      window.localStorage.setItem(CURRENCY_STORAGE_KEY, code);
    } catch {
      // A failed write only costs persistence, not correctness.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const value = React.useMemo<AppearanceValue>(
    () => ({
      currency,
      symbol: currencySymbol(currency),
      setCurrency,
    }),
    [currency, setCurrency],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceValue {
  const value = React.useContext(AppearanceContext);
  if (!value) {
    throw new Error('useAppearance must be used inside AppearanceProvider');
  }
  return value;
}
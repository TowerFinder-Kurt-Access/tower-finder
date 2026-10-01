/** Self-check for appearance helpers. Run: npx tsx scripts/check-appearance.ts */
import assert from 'node:assert/strict';
import {
  CURRENCIES,
  CURRENCY_STORAGE_KEY,
  DEFAULT_CURRENCY,
  currencySymbol,
  formatMoney,
  isCurrencyCode,
} from '../src/lib/appearance';

const checks: Array<[string, () => void]> = [
  ['currency guard rejects a stale stored value', () => {
    assert.equal(isCurrencyCode('CAD'), true);
    assert.equal(isCurrencyCode('usd'), false, 'codes are matched exactly');
    assert.equal(isCurrencyCode('EUR'), false);
    assert.equal(isCurrencyCode(''), false);
  }],

  ['every currency has a distinct symbol', () => {
    const symbols = CURRENCIES.map((c) => currencySymbol(c.code));
    assert.equal(new Set(symbols).size, symbols.length, `duplicate symbols: ${symbols}`);
    assert.ok(symbols.every(Boolean));
  }],

  ['storage key is namespaced', () => {
    assert.ok(CURRENCY_STORAGE_KEY.startsWith('tf4900.'), 'key must not collide');
  }],

  ['formatMoney renders the requested currency', () => {
    assert.equal(formatMoney('1250', 'USD'), '$1,250.00');
    assert.equal(formatMoney('1250', 'CAD'), 'CA$1,250.00');
    assert.equal(formatMoney(99.5, 'USD'), '$99.50');
  }],

  ['formatMoney returns empty for values that are not amounts', () => {
    for (const bad of ['', '   ', null, undefined, 'abc']) {
      assert.equal(formatMoney(bad as string, 'USD'), '', `expected empty for ${String(bad)}`);
    }
  }],

  ['formatMoney tolerates amounts typed with separators', () => {
    assert.equal(formatMoney('1,250', 'USD'), '$1,250.00');
    assert.equal(formatMoney('$1,250.00', 'USD'), '$1,250.00');
  }],

  ['negative amounts survive formatting', () => {
    assert.equal(formatMoney('-40', 'USD'), '-$40.00');
  }],

  ['default currency is a real option', () => {
    assert.ok(CURRENCIES.some((c) => c.code === DEFAULT_CURRENCY));
  }],
];

let failed = 0;
for (const [name, run] of checks) {
  try {
    run();
    console.log(`  pass  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${(error as Error).message}`);
  }
}

console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (failed > 0) process.exit(1);
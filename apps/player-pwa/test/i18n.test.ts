import { describe, it, expect } from 'vitest';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';

type NestedRecord = { [key: string]: string | NestedRecord };

function collectKeys(obj: NestedRecord, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...collectKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

describe('i18n key parity', () => {
  const enKeys = collectKeys(en as unknown as NestedRecord);
  const arKeys = collectKeys(ar as unknown as NestedRecord);

  it('ar.json and en.json have the same number of keys', () => {
    expect(arKeys.length).toBe(enKeys.length);
  });

  it('every key in en.json exists in ar.json', () => {
    for (const key of enKeys) {
      expect(arKeys, `Key "${key}" exists in en.json but not in ar.json`).toContain(key);
    }
  });

  it('every key in ar.json exists in en.json', () => {
    for (const key of arKeys) {
      expect(enKeys, `Key "${key}" exists in ar.json but not in en.json`).toContain(key);
    }
  });

  it('all values in en.json are strings', () => {
    const check = (obj: NestedRecord, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null) {
          check(value, fullKey);
        } else {
          expect(typeof value, `"${fullKey}" should be a string`).toBe('string');
        }
      }
    };
    check(en as unknown as NestedRecord);
  });

  it('all values in ar.json are strings', () => {
    const check = (obj: NestedRecord, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null) {
          check(value, fullKey);
        } else {
          expect(typeof value, `"${fullKey}" should be a string`).toBe('string');
        }
      }
    };
    check(ar as unknown as NestedRecord);
  });

  it('app.title is "KoraLink" in both locales', () => {
    expect(en.app.title).toBe('KoraLink');
    expect(ar.app.title).toBe('KoraLink');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('i18n Localization Integrity', () => {
  const localesDir = path.resolve(process.cwd(), 'public/locales');
  const enPath = path.join(localesDir, 'en.json');
  const taPath = path.join(localesDir, 'ta.json');
  const hiPath = path.join(localesDir, 'hi.json');

  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'));
  const hi = JSON.parse(fs.readFileSync(hiPath, 'utf8'));

  it('en.json, ta.json, and hi.json must have identical key sets', () => {
    const enKeys = Object.keys(en).sort();
    const taKeys = Object.keys(ta).sort();
    const hiKeys = Object.keys(hi).sort();

    assert.deepEqual(taKeys, enKeys, 'ta.json keys must match en.json keys exactly');
    assert.deepEqual(hiKeys, enKeys, 'hi.json keys must match en.json keys exactly');
  });

  it('should not contain any empty string values in en, ta, or hi', () => {
    for (const [key, val] of Object.entries(en)) {
      assert.ok(typeof val === 'string' && val.trim().length > 0, `en.json key "${key}" must not be empty`);
    }
    for (const [key, val] of Object.entries(ta)) {
      assert.ok(typeof val === 'string' && val.trim().length > 0, `ta.json key "${key}" must not be empty`);
    }
    for (const [key, val] of Object.entries(hi)) {
      assert.ok(typeof val === 'string' && val.trim().length > 0, `hi.json key "${key}" must not be empty`);
    }
  });

  it('every messageKey used in src/engine and src/services must exist in en, ta, and hi', () => {
    const directories = [
      path.resolve(process.cwd(), 'src/engine'),
      path.resolve(process.cwd(), 'src/services')
    ];

    const messageKeyRegex = /messageKey:\s*['"]([^'"]+)['"]/g;
    const foundKeys = new Set();

    for (const dir of directories) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        let match;
        while ((match = messageKeyRegex.exec(content)) !== null) {
          foundKeys.add(match[1]);
        }
      }
    }

    assert.ok(foundKeys.size > 0, 'Found messageKey references in engine and services');

    for (const key of foundKeys) {
      assert.ok(key in en, `en.json is missing engine/service messageKey: "${key}"`);
      assert.ok(key in ta, `ta.json is missing engine/service messageKey: "${key}"`);
      assert.ok(key in hi, `hi.json is missing engine/service messageKey: "${key}"`);
    }
  });
});

import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Bootstrap Environment', () => {
  it('should run under Node.js >= 20', () => {
    const majorVersion = parseInt(process.versions.node.split('.')[0], 10);
    assert.ok(majorVersion >= 20, `Expected Node >= 20, got ${process.version}`);
  });
});

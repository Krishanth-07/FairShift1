import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createMemoryRepository } from '../src/repository/memoryRepository.js';
import { seedDemoData } from '../src/repository/seed.js';
import { createFakeClock } from '../src/services/clock.js';
import { createSessionToken } from '../src/services/auth.js';

describe('Security & Transport Hardening', () => {
  const PIN = '5678';
  const SESSION_SECRET = 'sec-test-session-secret-9999999999';
  const clock = createFakeClock('2026-10-27T12:00:00.000Z');

  let server;
  let baseUrl;
  let repo;
  let validToken;

  before(async () => {
    repo = createMemoryRepository();
    await seedDemoData(repo, { clock, pin: PIN });
    validToken = createSessionToken('c_worker_1', SESSION_SECRET);

    const app = createApp({
      config: {
        PORT: 0,
        TZ_OFFSET_MINUTES: 330,
        DEMO_MODE: false,
        NODE_ENV: 'test',
        SESSION_SECRET,
        SITE_SECRET: 'test',
        RECEIPT_SECRET: 'test',
        FEEDBACK_SECRET: 'test',
        SEED_PIN: PIN
      },
      repo,
      clock
    });

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after((done) => {
    server.close(done);
  });

  it('should include strict Content-Security-Policy headers', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, 'CSP header must be present');
    assert.ok(csp.includes("default-src 'self'"));
    assert.ok(csp.includes("script-src 'self'"));
    assert.ok(csp.includes("style-src 'self'"));
    assert.ok(csp.includes("frame-ancestors 'none'"));
  });

  it('should not leak X-Powered-By header', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('should reject state-modifying requests missing the X-Requested-With CSRF header', async () => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: `fs_session=${validToken}`
        // Missing X-Requested-With header
      }
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.error.code, 'CSRF_HEADER_MISSING');
  });

  it('should accept state-modifying requests that supply X-Requested-With: fairshift', async () => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: `fs_session=${validToken}`,
        'X-Requested-With': 'fairshift'
      }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
  });

  it('should reject request payloads exceeding 20kb limit with 413 Payload Too Large', async () => {
    const oversizedString = 'A'.repeat(25 * 1024); // 25kb payload
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'c_worker_1', pin: PIN, padding: oversizedString })
    });

    assert.equal(res.status, 413);
    const data = await res.json();
    assert.equal(data.error.code, 'PAYLOAD_TOO_LARGE');
  });

  it('should reject unknown JSON body keys with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'c_worker_1',
        pin: PIN,
        maliciousExtraProperty: 'exploit_attempt'
      })
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error.code, 'UNKNOWN_FIELD');
    assert.match(data.error.message, /Unknown field "maliciousExtraProperty"/);
  });

  it('should trigger rate limit after 10 login attempts', async () => {
    // We create an isolated app with its own limiter state to avoid test interference
    const rateLimitApp = createApp({
      config: {
        PORT: 0,
        TZ_OFFSET_MINUTES: 330,
        DEMO_MODE: false,
        NODE_ENV: 'test',
        SESSION_SECRET,
        SITE_SECRET: 'test',
        RECEIPT_SECRET: 'test',
        FEEDBACK_SECRET: 'test',
        SEED_PIN: PIN
      },
      repo,
      clock
    });

    const rlServer = rateLimitApp.listen(0);
    const rlPort = rlServer.address().port;

    try {
      // Send 10 failed login requests (allowed)
      for (let i = 0; i < 10; i++) {
        await fetch(`http://127.0.0.1:${rlPort}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'c_worker_1', pin: '0000' })
        });
      }

      // 11th request must be rejected with 429
      const rateLimitedRes = await fetch(`http://127.0.0.1:${rlPort}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'c_worker_1', pin: '0000' })
      });

      assert.equal(rateLimitedRes.status, 429);
      const data = await rateLimitedRes.json();
      assert.equal(data.error.code, 'RATE_LIMIT_EXCEEDED');
      assert.match(data.error.message, /Too many login attempts/);
    } finally {
      rlServer.close();
    }
  });
});

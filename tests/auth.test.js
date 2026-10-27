import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createMemoryRepository } from '../src/repository/memoryRepository.js';
import { seedDemoData } from '../src/repository/seed.js';
import { createFakeClock } from '../src/services/clock.js';
import { createSessionToken } from '../src/services/auth.js';

describe('Authentication & Session Management', () => {
  const PIN = '4321';
  const SESSION_SECRET = 'test-session-secret-9999999999999999';
  const clock = createFakeClock('2026-10-27T12:00:00.000Z');

  let server;
  let baseUrl;
  let repo;

  before(async () => {
    repo = createMemoryRepository();
    await seedDemoData(repo, { clock, pin: PIN });

    const app = createApp({
      config: {
        PORT: 0,
        TZ_OFFSET_MINUTES: 330,
        DEMO_MODE: false,
        NODE_ENV: 'test',
        SESSION_SECRET,
        SITE_SECRET: 'test-site',
        RECEIPT_SECRET: 'test-receipt',
        FEEDBACK_SECRET: 'test-feedback',
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

  it('should authenticate valid worker credentials and set httpOnly session cookie', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'c_worker_1', pin: PIN })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.user.id, 'c_worker_1');
    assert.equal(data.user.name, 'Rajesh Kumar');
    assert.equal(data.user.role, 'worker');
    assert.equal(data.user.pinHash, undefined); // Sensitive hash omitted

    const cookie = res.headers.get('set-cookie');
    assert.ok(cookie, 'Set-Cookie header must be present');
    assert.ok(cookie.includes('fs_session='));
    assert.ok(cookie.toLowerCase().includes('httponly'));
    assert.ok(cookie.toLowerCase().includes('samesite=strict'));
  });

  it('should return identical 401 error for incorrect PIN and non-existent user', async () => {
    // 1. Existing user, wrong PIN
    const wrongPinRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'c_worker_1', pin: '9999' })
    });
    const wrongPinData = await wrongPinRes.json();

    // 2. Non-existent user
    const unknownUserRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'ghost_worker_999', pin: '4321' })
    });
    const unknownUserData = await unknownUserRes.json();

    // Responses must be completely indistinguishable to prevent user enumeration
    assert.equal(wrongPinRes.status, 401);
    assert.equal(unknownUserRes.status, 401);
    assert.deepEqual(wrongPinData, unknownUserData);
    assert.equal(wrongPinData.error.code, 'INVALID_CREDENTIALS');
  });

  it('should reject requests with expired session token', async () => {
    // Create token expired 1 hour ago
    const expiredToken = createSessionToken('c_worker_1', SESSION_SECRET, -3600000);

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: `fs_session=${expiredToken}` }
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error.code, 'SESSION_EXPIRED');
  });

  it('should reject requests with cryptographically tampered session token', async () => {
    const validToken = createSessionToken('c_worker_1', SESSION_SECRET);
    // Tamper with base64 signature portion
    const tamperedToken = `${validToken.slice(0, -6)}xxxxxx`;

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: `fs_session=${tamperedToken}` }
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error.code, 'SESSION_EXPIRED');
  });

  it('should return 404 for /api/auth/demo-login when DEMO_MODE is false', async () => {
    const res = await fetch(`${baseUrl}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'c_worker_1' })
    });
    assert.equal(res.status, 404);
  });

  it('should allow /api/auth/demo-login when DEMO_MODE is true', async () => {
    // Create dedicated app instance with DEMO_MODE=true
    const demoApp = createApp({
      config: {
        PORT: 0,
        TZ_OFFSET_MINUTES: 330,
        DEMO_MODE: true,
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

    const demoServer = demoApp.listen(0);
    const demoPort = demoServer.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${demoPort}/api/auth/demo-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'h_worker_2' })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.user.id, 'h_worker_2');
      const cookie = res.headers.get('set-cookie');
      assert.ok(cookie && cookie.includes('fs_session='));
    } finally {
      demoServer.close();
    }
  });

  it('should serve /healthz endpoint', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.timestamp, clock.now());
  });
});

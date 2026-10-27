/**
 * @file Server Entry Point
 *
 * Bootstraps repository, seeds demo data if repository is empty, binds Express
 * application to configured PORT, and manages graceful shutdown signals.
 */

import config from './config/env.js';
import { systemClock } from './services/clock.js';
import { createMemoryRepository } from './repository/memoryRepository.js';
import { seedDemoData } from './repository/seed.js';
import { createApp } from './app.js';

async function bootstrap() {
  const repo = createMemoryRepository();

  // Populate realistic cross-sector scenarios if empty
  if (repo.isEmpty()) {
    console.log('[FairShift] Seeding initial demo scenarios...');
    await seedDemoData(repo, { clock: systemClock, pin: config.SEED_PIN });
    console.log('[FairShift] Repository initialized with construction and hospital data.');
  }

  const app = createApp({ config, repo, clock: systemClock });

  const server = app.listen(config.PORT, () => {
    console.log(`[FairShift] Server listening on http://localhost:${config.PORT} (env: ${config.NODE_ENV})`);
    if (config.DEMO_MODE) {
      console.log('[FairShift] DEMO_MODE is active. Fast-login endpoints available.');
    }
  });

  // Graceful shutdown handling
  function shutdown(signal) {
    console.log(`[FairShift] Received ${signal}. Closing HTTP server...`);
    server.close(() => {
      console.log('[FairShift] HTTP server closed cleanly. Exiting.');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[FairShift] Fatal startup error:', err);
  process.exit(1);
});

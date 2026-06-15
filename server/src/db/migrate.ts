// CLI entry point: `npm run migrate`. Opens the DB, applies migrations, exits.
import { getDb, closeDb } from './db';
import { runMigrations } from './migrations';
import { logger } from '../utils/logger';

function main(): void {
  const db = getDb();
  const applied = runMigrations(db);
  logger.info('Migrations complete', { applied });
  closeDb();
}

main();

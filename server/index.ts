import app from './app.js';
import { getDb } from './db.js';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main() {
  await getDb();
  app.listen(PORT, HOST, () => {
    console.log(`Basecamp server running at http://${HOST}:${PORT}`);
    console.log(`Database: ${process.env.DATABASE_URL ? 'Postgres (DATABASE_URL)' : 'SQLite (local file)'}`);
  });
}
main().catch(err => { console.error('Failed to start server:', err); process.exit(1); });

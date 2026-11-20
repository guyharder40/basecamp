// Vercel serverless entry for /api/*.
// The Express app is bundled from ../server/app. Set DATABASE_URL in Vercel
// (Supabase free Postgres) for shared persistence; without it the function
// uses an ephemeral SQLite file in /tmp and data will not persist.
import app from '../server/app.js';
export default app;

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { POSTGRES_SCHEMA } from './schemaPostgres.js';

const require = createRequire(import.meta.url);

export interface RunResult { lastInsertRowid?: number; changes: number; }
export interface Db {
  kind: 'sqlite' | 'postgres';
  all<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = any>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  exec(sql: string): Promise<void>;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
// Package root: works both under tsx (server/) and compiled
// (dist-server/server/), by walking up to the dir with package.json + server/.
function findRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'server'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}
const ROOT = findRoot(__dirname);

function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Postgres folds unquoted identifiers to lowercase, so SELECT * returns
// keys like `firstname`, `owneruserid`, `huntingstate` — but the whole app
// reads camelCase (`row.firstName`). SQLite preserves case, which is why
// this never showed up in local testing: on Postgres every read came back
// empty even though the rows were saved fine. That is exactly what Guy
// saw on 2026-11-19 — Save "worked" (the home screen flashed), then the
// re-read looked empty and sent him back to setup. Remap row keys back
// to the camelCase names declared in the schema. Built from the schema
// itself, so it covers every table and column (including ones the
// migrations add — they are declared there too).
const PG_KEY_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const re = /^\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:TEXT|INTEGER|BOOLEAN|JSONB|SERIAL|DOUBLE)\b/gm;
  for (const m of POSTGRES_SCHEMA.matchAll(re)) map[m[1].toLowerCase()] = m[1];
  return map;
})();

function remapRow(row: any): any {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  const out: any = {};
  for (const [k, v] of Object.entries(row)) out[PG_KEY_MAP[k] ?? k] = v;
  return out;
}

// Per-table column sets parsed from the schema. run() uses them to decide
// whether an INSERT target actually has an `id` column: camp_wind_cache is
// keyed by campId and has NO id, so appending RETURNING id to its inserts
// throws `column "id" does not exist`. That is what silently killed the
// weather on the deployed app — the fetch succeeded every time, but saving
// the snapshot to the cache crashed, and the wind endpoints read that
// crash as "weather unavailable".
const PG_TABLE_COLUMNS: Record<string, Set<string>> = (() => {
  const tables: Record<string, Set<string>> = {};
  const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\);/g;
  for (const m of POSTGRES_SCHEMA.matchAll(re)) {
    const cols = new Set<string>();
    for (const cm of m[2].matchAll(/^\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:TEXT|INTEGER|BOOLEAN|JSONB|SERIAL|DOUBLE)\b/gm)) cols.add(cm[1].toLowerCase());
    tables[m[1].toLowerCase()] = cols;
  }
  return tables;
})();

class SqliteDb implements Db {
  kind = 'sqlite' as const;
  private db: any;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    // node:sqlite is built into Node 22+. Loaded via require so a missing
    // binding produces a clear error instead of a crash at import time.
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
  }
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> { return this.db.prepare(sql).all(...params) as T[]; }
  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> { return this.db.prepare(sql).get(...params) as T | undefined; }
  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const r = this.db.prepare(sql).run(...params);
    return { lastInsertRowid: typeof r.lastInsertRowid === 'number' ? r.lastInsertRowid : Number(r.lastInsertRowid), changes: r.changes };
  }
  async exec(sql: string): Promise<void> { this.db.exec(sql); }
}

class PostgresDb implements Db {
  kind = 'postgres' as const;
  private pool: any;
  constructor(url: string) {
    const { Pool } = require('pg') as typeof import('pg');
    this.pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  }
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.pool.query(toPg(sql), params);
    return (r.rows as T[]).map(remapRow);
  }
  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.all<T>(sql, params);
    return rows[0];
  }
  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const trimmed = sql.trim().toUpperCase();
    let q = toPg(sql);
    if (trimmed.startsWith('INSERT') && !q.toUpperCase().includes('RETURNING')) {
      const m = /INSERT\s+INTO\s+(\w+)/i.exec(sql);
      const cols = m ? PG_TABLE_COLUMNS[m[1].toLowerCase()] : undefined;
      // Only ask for the new id when the table has one (see PG_TABLE_COLUMNS).
      if (!cols || cols.has('id')) q += ' RETURNING id';
    }
    const r = await this.pool.query(q, params);
    return { lastInsertRowid: r.rows?.[0]?.id, changes: r.rowCount ?? 0 };
  }
  async exec(sql: string): Promise<void> { await this.pool.query(sql); }
}

let instance: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (instance) return instance;
  instance = (async (): Promise<Db> => {
    const databaseUrl = process.env.DATABASE_URL;
    let db: Db;
    if (databaseUrl) {
      db = new PostgresDb(databaseUrl);
      // Schema is inlined as a module (schemaPostgres.ts) so it is always in
      // the server bundle. Fall back to the .sql file on disk if the inline
      // copy is ever empty (local dev keeps working either way). Files read
      // with readFileSync at runtime are NOT bundled by Vercel's file tracing,
      // which is why the tables were never created on the first deploy.
      let schemaSql = POSTGRES_SCHEMA;
      if (!schemaSql) {
        const candidates = [join(process.cwd(), 'server', 'schema-postgres.sql'), join(ROOT, 'server', 'schema-postgres.sql')];
        for (const p of candidates) {
          if (existsSync(p)) { schemaSql = readFileSync(p, 'utf8'); break; }
        }
      }
      if (schemaSql) await db.exec(schemaSql);
      else console.error('Basecamp schema not found (neither bundled nor on disk) — tables will not be created.');
    } else {
      const sqlitePath = process.env.SQLITE_PATH || (process.env.VERCEL ? '/tmp/basecamp.db' : join(ROOT, 'data', 'basecamp.db'));
      console.log(`Basecamp DB: ${sqlitePath} (ROOT=${ROOT})`);
      db = new SqliteDb(sqlitePath);
      const schemaPath = join(ROOT, 'server', 'schema.sql');
      console.log(`Basecamp schema: ${schemaPath} exists=${existsSync(schemaPath)}`);
      if (existsSync(schemaPath)) await db.exec(readFileSync(schemaPath, 'utf8'));
    }
    // Migrate existing databases created before 2026-11-17 (new columns).
    // Postgres supports ADD COLUMN IF NOT EXISTS; SQLite does not, so each
    // SQLite ALTER is attempted and duplicate-column errors are ignored.
    const migrations: { table: string; column: string; ddlSqlite: string; ddlPg: string }[] = [
      { table: 'profile', column: 'ownerUserId', ddlSqlite: "ALTER TABLE profile ADD COLUMN ownerUserId TEXT NOT NULL DEFAULT 'seed-owner'", ddlPg: "ALTER TABLE profile ADD COLUMN IF NOT EXISTS ownerUserId TEXT NOT NULL DEFAULT 'seed-owner'" },
      { table: 'profile', column: 'pinnedBadges', ddlSqlite: "ALTER TABLE profile ADD COLUMN pinnedBadges TEXT NOT NULL DEFAULT '[]'", ddlPg: "ALTER TABLE profile ADD COLUMN IF NOT EXISTS pinnedBadges JSONB NOT NULL DEFAULT '[]'::jsonb" },
      { table: 'profile', column: 'discoverable', ddlSqlite: 'ALTER TABLE profile ADD COLUMN discoverable INTEGER NOT NULL DEFAULT 1', ddlPg: 'ALTER TABLE profile ADD COLUMN IF NOT EXISTS discoverable BOOLEAN NOT NULL DEFAULT TRUE' },
      { table: 'profile', column: 'profileVisibility', ddlSqlite: "ALTER TABLE profile ADD COLUMN profileVisibility TEXT NOT NULL DEFAULT 'friends'", ddlPg: "ALTER TABLE profile ADD COLUMN IF NOT EXISTS profileVisibility TEXT NOT NULL DEFAULT 'friends'" },
      { table: 'profile', column: 'createdAt', ddlSqlite: "ALTER TABLE profile ADD COLUMN createdAt TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE profile ADD COLUMN IF NOT EXISTS createdAt TEXT NOT NULL DEFAULT ''" },
      { table: 'camps', column: 'ownerUserId', ddlSqlite: "ALTER TABLE camps ADD COLUMN ownerUserId TEXT NOT NULL DEFAULT 'seed-owner'", ddlPg: "ALTER TABLE camps ADD COLUMN IF NOT EXISTS ownerUserId TEXT NOT NULL DEFAULT 'seed-owner'" },
      { table: 'camps', column: 'mapView', ddlSqlite: "ALTER TABLE camps ADD COLUMN mapView TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE camps ADD COLUMN IF NOT EXISTS mapView TEXT NOT NULL DEFAULT ''" },
      { table: 'camp_members', column: 'userId', ddlSqlite: "ALTER TABLE camp_members ADD COLUMN userId TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE camp_members ADD COLUMN IF NOT EXISTS userId TEXT NOT NULL DEFAULT ''" },
      { table: 'checkins', column: 'userId', ddlSqlite: "ALTER TABLE checkins ADD COLUMN userId TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE checkins ADD COLUMN IF NOT EXISTS userId TEXT NOT NULL DEFAULT ''" },
      { table: 'reservations', column: 'userId', ddlSqlite: "ALTER TABLE reservations ADD COLUMN userId TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS userId TEXT NOT NULL DEFAULT ''" },
      { table: 'messages', column: 'authorUserId', ddlSqlite: "ALTER TABLE messages ADD COLUMN authorUserId TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE messages ADD COLUMN IF NOT EXISTS authorUserId TEXT NOT NULL DEFAULT ''" },
      { table: 'photos', column: 'authorUserId', ddlSqlite: "ALTER TABLE photos ADD COLUMN authorUserId TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE photos ADD COLUMN IF NOT EXISTS authorUserId TEXT NOT NULL DEFAULT ''" },
      { table: 'photos', column: 'harvestClass', ddlSqlite: "ALTER TABLE photos ADD COLUMN harvestClass TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE photos ADD COLUMN IF NOT EXISTS harvestClass TEXT NOT NULL DEFAULT ''" },
      { table: 'photos', column: 'weightLbs', ddlSqlite: 'ALTER TABLE photos ADD COLUMN weightLbs REAL', ddlPg: 'ALTER TABLE photos ADD COLUMN IF NOT EXISTS weightLbs DOUBLE PRECISION' },
      { table: 'photos', column: 'antlerScore', ddlSqlite: 'ALTER TABLE photos ADD COLUMN antlerScore REAL', ddlPg: 'ALTER TABLE photos ADD COLUMN IF NOT EXISTS antlerScore DOUBLE PRECISION' },
      { table: 'photos', column: 'antlerPoints', ddlSqlite: 'ALTER TABLE photos ADD COLUMN antlerPoints INTEGER', ddlPg: 'ALTER TABLE photos ADD COLUMN IF NOT EXISTS antlerPoints INTEGER' },
      { table: 'hunts', column: 'harvested', ddlSqlite: 'ALTER TABLE hunts ADD COLUMN harvested INTEGER NOT NULL DEFAULT 0', ddlPg: 'ALTER TABLE hunts ADD COLUMN IF NOT EXISTS harvested BOOLEAN NOT NULL DEFAULT FALSE' },
      { table: 'hunts', column: 'campId', ddlSqlite: 'ALTER TABLE hunts ADD COLUMN campId INTEGER', ddlPg: 'ALTER TABLE hunts ADD COLUMN IF NOT EXISTS campId INTEGER' },
      { table: 'community_posts', column: 'harvestClass', ddlSqlite: "ALTER TABLE community_posts ADD COLUMN harvestClass TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS harvestClass TEXT NOT NULL DEFAULT ''" },
      { table: 'community_posts', column: 'weightLbs', ddlSqlite: 'ALTER TABLE community_posts ADD COLUMN weightLbs REAL', ddlPg: 'ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS weightLbs DOUBLE PRECISION' },
      { table: 'community_posts', column: 'antlerScore', ddlSqlite: 'ALTER TABLE community_posts ADD COLUMN antlerScore REAL', ddlPg: 'ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS antlerScore DOUBLE PRECISION' },
      { table: 'community_posts', column: 'antlerPoints', ddlSqlite: 'ALTER TABLE community_posts ADD COLUMN antlerPoints INTEGER', ddlPg: 'ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS antlerPoints INTEGER' },
      // Multi-user build-out (2026-11-23): private rows belong to an account.
      { table: 'friends', column: 'ownerUserId', ddlSqlite: "ALTER TABLE friends ADD COLUMN ownerUserId TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE friends ADD COLUMN IF NOT EXISTS ownerUserId TEXT NOT NULL DEFAULT ''" },
      { table: 'gear', column: 'ownerUserId', ddlSqlite: "ALTER TABLE gear ADD COLUMN ownerUserId TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE gear ADD COLUMN IF NOT EXISTS ownerUserId TEXT NOT NULL DEFAULT ''" },
      { table: 'hunts', column: 'ownerUserId', ddlSqlite: "ALTER TABLE hunts ADD COLUMN ownerUserId TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE hunts ADD COLUMN IF NOT EXISTS ownerUserId TEXT NOT NULL DEFAULT ''" },
      { table: 'licenses', column: 'ownerUserId', ddlSqlite: "ALTER TABLE licenses ADD COLUMN ownerUserId TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE licenses ADD COLUMN IF NOT EXISTS ownerUserId TEXT NOT NULL DEFAULT ''" },
      { table: 'app_settings', column: 'ownerUserId', ddlSqlite: "ALTER TABLE app_settings ADD COLUMN ownerUserId TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS ownerUserId TEXT NOT NULL DEFAULT ''" },
      { table: 'pins', column: 'createdByUserId', ddlSqlite: "ALTER TABLE pins ADD COLUMN createdByUserId TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE pins ADD COLUMN IF NOT EXISTS createdByUserId TEXT NOT NULL DEFAULT ''" },
      { table: 'trails', column: 'createdByUserId', ddlSqlite: "ALTER TABLE trails ADD COLUMN createdByUserId TEXT NOT NULL DEFAULT ''", ddlPg: "ALTER TABLE trails ADD COLUMN IF NOT EXISTS createdByUserId TEXT NOT NULL DEFAULT ''" },
    ];
    for (const m of migrations) {
      try { await db.exec(db.kind === 'postgres' ? m.ddlPg : m.ddlSqlite); }
      catch (e) { if (db.kind === 'postgres') console.error('Migration failed:', m.table, m.column, e); }
    }
    // Postgres only: profile and app_settings were created as singleton
    // tables (id PRIMARY KEY CHECK (id = 1)) in the single-user era. Other
    // hunters need their own rows, so drop the check and let the id
    // generate. Idempotent; SQLite keeps its single row in local mode.
    if (db.kind === 'postgres') {
      const pgSingletonFixes = [
        'ALTER TABLE profile DROP CONSTRAINT IF EXISTS profile_id_check',
        'ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_id_check',
        "DO $$ BEGIN BEGIN ALTER TABLE profile ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (START WITH 1000); EXCEPTION WHEN OTHERS THEN NULL; END; END $$",
        "DO $$ BEGIN BEGIN ALTER TABLE app_settings ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (START WITH 1000); EXCEPTION WHEN OTHERS THEN NULL; END; END $$",
      ];
      for (const sql of pgSingletonFixes) {
        try { await db.exec(sql); } catch (e) { console.error('PG singleton fix failed:', e); }
      }
    }
    // Seed from data/seed.json on first run (empty profile table)
    try {
      const count = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM profile');
      if (!count || Number(count.c) === 0) {
        const { seedFromFile } = await import('./seed.js');
        await seedFromFile(db);
      }
    } catch (e) { console.error('Seed check failed:', e); }
    return db;
  })();
  return instance;
}

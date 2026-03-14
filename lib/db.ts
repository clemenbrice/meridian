import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// DATA_DIR can be overridden via env var to point at a Railway persistent volume
// e.g. set DATA_DIR=/data in Railway and mount a volume at /data
const DB_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'meridian.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initSchema(db);
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      network TEXT NOT NULL,
      campaign_name TEXT NOT NULL,
      campaign_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_unique
      ON campaigns(network, campaign_name);

    CREATE TABLE IF NOT EXISTS daily_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
      date TEXT NOT NULL,
      ad_spend REAL NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      attributed_revenue REAL NOT NULL DEFAULT 0,
      attributed_orders INTEGER NOT NULL DEFAULT 0,
      new_to_brand_orders INTEGER NOT NULL DEFAULT 0,
      new_to_brand_revenue REAL NOT NULL DEFAULT 0
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_metrics_unique
      ON daily_metrics(campaign_id, date);

    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      network TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ── Query helpers ──────────────────────────────────────────────────────────────

export interface MetricsRow {
  network: string;
  campaign_name: string;
  date: string;
  ad_spend: number;
  impressions: number;
  clicks: number;
  attributed_revenue: number;
  attributed_orders: number;
  new_to_brand_orders: number;
  new_to_brand_revenue: number;
}

export function queryMetrics(startDate: string, endDate: string, networks?: string[]): MetricsRow[] {
  const db = getDb();
  const networkFilter = networks && networks.length > 0
    ? `AND c.network IN (${networks.map(() => '?').join(',')})`
    : '';

  const params: (string | number)[] = [startDate, endDate];
  if (networks && networks.length > 0) params.push(...networks);

  return db.prepare(`
    SELECT
      c.network,
      c.campaign_name,
      m.date,
      m.ad_spend,
      m.impressions,
      m.clicks,
      m.attributed_revenue,
      m.attributed_orders,
      m.new_to_brand_orders,
      m.new_to_brand_revenue
    FROM daily_metrics m
    JOIN campaigns c ON c.id = m.campaign_id
    WHERE m.date >= ? AND m.date <= ?
    ${networkFilter}
    ORDER BY m.date ASC
  `).all(...params) as MetricsRow[];
}

export function upsertCampaign(network: string, campaign_name: string, campaign_id?: string): number {
  const db = getDb();
  db.prepare(`
    INSERT INTO campaigns (network, campaign_name, campaign_id)
    VALUES (?, ?, ?)
    ON CONFLICT(network, campaign_name) DO UPDATE SET campaign_id = excluded.campaign_id
  `).run(network, campaign_name, campaign_id ?? null);

  const row = db.prepare(
    'SELECT id FROM campaigns WHERE network = ? AND campaign_name = ?'
  ).get(network, campaign_name) as { id: number };
  return row.id;
}

export interface NormalizedRow {
  campaign_name: string;
  campaign_id?: string;
  date: string;
  ad_spend: number;
  impressions: number;
  clicks: number;
  attributed_revenue: number;
  attributed_orders: number;
  new_to_brand_orders: number;
  new_to_brand_revenue: number;
}

export function insertMetrics(network: string, rows: NormalizedRow[]): number {
  const db = getDb();
  let inserted = 0;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO daily_metrics
      (campaign_id, date, ad_spend, impressions, clicks,
       attributed_revenue, attributed_orders, new_to_brand_orders, new_to_brand_revenue)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const run = db.transaction((rows: NormalizedRow[]) => {
    for (const row of rows) {
      const campaignId = upsertCampaign(network, row.campaign_name, row.campaign_id);
      const result = insert.run(
        campaignId,
        row.date,
        row.ad_spend,
        row.impressions,
        row.clicks,
        row.attributed_revenue,
        row.attributed_orders,
        row.new_to_brand_orders,
        row.new_to_brand_revenue
      );
      if (result.changes > 0) inserted++;
    }
  });

  run(rows);
  return inserted;
}

export function logUpload(filename: string, network: string, row_count: number) {
  getDb().prepare(
    'INSERT INTO uploads (filename, network, row_count) VALUES (?, ?, ?)'
  ).run(filename, network, row_count);
}

export function getNetworks(): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT network FROM campaigns ORDER BY network').all() as { network: string }[];
  return rows.map(r => r.network);
}

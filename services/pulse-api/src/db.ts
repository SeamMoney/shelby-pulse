import Database from 'better-sqlite3';
import path from 'path';
import { logger } from './logger';

// Database instance (singleton)
let db: Database.Database | null = null;

// Data directory for SQLite file
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'shelby-pulse.db');

/**
 * Initialize the database connection and create tables
 */
export function initDatabase(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  const fs = require('fs');
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better write performance
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Create tables
  createTables(db);

  logger.info({ dbPath: DB_PATH }, 'Database initialized');
  return db;
}

/**
 * Get the database instance (must call initDatabase first)
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Create all required tables and indexes
 */
function createTables(db: Database.Database): void {
  // Raw activities table - stores all ShelbyUSD activities for future queries
  db.exec(`
    CREATE TABLE IF NOT EXISTS shelbyusd_activities (
      transaction_version INTEGER PRIMARY KEY,
      event_index INTEGER DEFAULT 0,
      address TEXT NOT NULL,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('deposit', 'withdraw', 'mint', 'burn')),
      timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  // Indexes for common query patterns
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_activities_address ON shelbyusd_activities(address);
    CREATE INDEX IF NOT EXISTS idx_activities_type ON shelbyusd_activities(type);
    CREATE INDEX IF NOT EXISTS idx_activities_version_desc ON shelbyusd_activities(transaction_version DESC);
  `);

  // Address stats - pre-computed aggregates per address
  db.exec(`
    CREATE TABLE IF NOT EXISTS address_stats (
      address TEXT PRIMARY KEY,
      tx_count INTEGER DEFAULT 0,
      total_deposited INTEGER DEFAULT 0,
      total_withdrawn INTEGER DEFAULT 0,
      total_minted INTEGER DEFAULT 0,
      total_burned INTEGER DEFAULT 0,
      last_version INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  // Leaderboard cache - stores pre-computed leaderboard JSON
  db.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard_cache (
      type TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  // Sync state - tracks incremental sync progress
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  // Continuous farming jobs - persistent farming sessions
  db.exec(`
    CREATE TABLE IF NOT EXISTS farming_jobs (
      id TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'paused', 'stopped', 'completed')),
      started_at INTEGER NOT NULL,
      stopped_at INTEGER,
      total_minted INTEGER DEFAULT 0,
      waves_completed INTEGER DEFAULT 0,
      droplets_created INTEGER DEFAULT 0,
      droplets_failed INTEGER DEFAULT 0,
      last_wave_at INTEGER,
      config TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_farming_jobs_status ON farming_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_farming_jobs_wallet ON farming_jobs(wallet_address);
  `);

  // Farming waves - track each deployment wave
  db.exec(`
    CREATE TABLE IF NOT EXISTS farming_waves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      wave_number INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      regions TEXT NOT NULL,
      droplets_per_region INTEGER NOT NULL,
      total_droplets INTEGER NOT NULL,
      droplets_succeeded INTEGER DEFAULT 0,
      droplets_failed INTEGER DEFAULT 0,
      estimated_minted INTEGER DEFAULT 0,
      FOREIGN KEY (job_id) REFERENCES farming_jobs(id)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_farming_waves_job ON farming_waves(job_id);
  `);

  // Blob events table - stores all blob registered events for accurate counts
  db.exec(`
    CREATE TABLE IF NOT EXISTS blob_events (
      transaction_version INTEGER NOT NULL,
      event_index INTEGER NOT NULL DEFAULT 0,
      blob_id TEXT NOT NULL,
      owner_address TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      encoding TEXT,
      blob_name TEXT,
      creation_timestamp INTEGER,
      expiration_timestamp INTEGER,
      PRIMARY KEY (transaction_version, event_index)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_blob_events_owner ON blob_events(owner_address);
    CREATE INDEX IF NOT EXISTS idx_blob_events_version_desc ON blob_events(transaction_version DESC);
    CREATE INDEX IF NOT EXISTS idx_blob_events_creation ON blob_events(creation_timestamp DESC);
  `);

  logger.info('Database tables created/verified');
}

// ============================================================================
// Sync State Operations
// ============================================================================

export function getSyncState(key: string): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSyncState(key: string, value: string): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO sync_state (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, Date.now());
}

// ============================================================================
// Activity Operations
// ============================================================================

export interface ActivityRecord {
  transaction_version: number;
  event_index: number;
  address: string;
  amount: number;
  type: 'deposit' | 'withdraw' | 'mint' | 'burn';
  timestamp: number;
}

/**
 * Insert activities in a batch transaction (much faster than individual inserts)
 */
export function insertActivities(activities: ActivityRecord[]): number {
  if (activities.length === 0) return 0;

  const db = getDatabase();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO shelbyusd_activities
    (transaction_version, event_index, address, amount, type, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items: ActivityRecord[]) => {
    let inserted = 0;
    for (const item of items) {
      const result = insert.run(
        item.transaction_version,
        item.event_index,
        item.address,
        item.amount,
        item.type,
        item.timestamp
      );
      if (result.changes > 0) inserted++;
    }
    return inserted;
  });

  const inserted = insertMany(activities);
  logger.info({ inserted, total: activities.length }, 'Inserted activities into database');
  return inserted;
}

/**
 * Get the highest transaction version in the database
 */
export function getLastSyncedVersion(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT MAX(transaction_version) as max_version FROM shelbyusd_activities').get() as { max_version: number | null };
  return row?.max_version ?? 0;
}

/**
 * Get total activity count
 */
export function getActivityCount(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(*) as count FROM shelbyusd_activities').get() as { count: number };
  return row.count;
}

/**
 * Get recent activities (for recent transactions display)
 */
export function getRecentActivities(limit: number): ActivityRecord[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM shelbyusd_activities
    ORDER BY transaction_version DESC
    LIMIT ?
  `).all(limit) as ActivityRecord[];
}

// ============================================================================
// Address Stats Operations
// ============================================================================

export interface AddressStatsRecord {
  address: string;
  tx_count: number;
  total_deposited: number;
  total_withdrawn: number;
  total_minted: number;
  total_burned: number;
  last_version: number;
}

/**
 * Update address stats from new activities (incremental)
 */
export function updateAddressStats(activities: ActivityRecord[]): void {
  if (activities.length === 0) return;

  const db = getDatabase();

  // Aggregate by address first
  const statsMap = new Map<string, {
    tx_count: number;
    deposited: number;
    withdrawn: number;
    minted: number;
    burned: number;
    last_version: number;
  }>();

  for (const activity of activities) {
    const existing = statsMap.get(activity.address) || {
      tx_count: 0,
      deposited: 0,
      withdrawn: 0,
      minted: 0,
      burned: 0,
      last_version: 0,
    };

    existing.tx_count++;
    existing.last_version = Math.max(existing.last_version, activity.transaction_version);

    switch (activity.type) {
      case 'deposit':
        existing.deposited += activity.amount;
        break;
      case 'withdraw':
        existing.withdrawn += activity.amount;
        break;
      case 'mint':
        existing.minted += activity.amount;
        break;
      case 'burn':
        existing.burned += activity.amount;
        break;
    }

    statsMap.set(activity.address, existing);
  }

  // Upsert all address stats
  const upsert = db.prepare(`
    INSERT INTO address_stats (address, tx_count, total_deposited, total_withdrawn, total_minted, total_burned, last_version, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      tx_count = address_stats.tx_count + excluded.tx_count,
      total_deposited = address_stats.total_deposited + excluded.total_deposited,
      total_withdrawn = address_stats.total_withdrawn + excluded.total_withdrawn,
      total_minted = address_stats.total_minted + excluded.total_minted,
      total_burned = address_stats.total_burned + excluded.total_burned,
      last_version = MAX(address_stats.last_version, excluded.last_version),
      updated_at = excluded.updated_at
  `);

  const upsertMany = db.transaction(() => {
    const now = Date.now();
    for (const [address, stats] of statsMap) {
      upsert.run(
        address,
        stats.tx_count,
        stats.deposited,
        stats.withdrawn,
        stats.minted,
        stats.burned,
        stats.last_version,
        now
      );
    }
  });

  upsertMany();
  logger.info({ addressCount: statsMap.size }, 'Updated address stats');
}

/**
 * Get top addresses by transaction count
 */
export function getTopByTxCount(limit: number): AddressStatsRecord[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM address_stats
    ORDER BY tx_count DESC
    LIMIT ?
  `).all(limit) as AddressStatsRecord[];
}

/**
 * Get top spenders (by total_withdrawn)
 */
export function getTopSpenders(limit: number): AddressStatsRecord[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM address_stats
    WHERE total_withdrawn > 0
    ORDER BY total_withdrawn DESC
    LIMIT ?
  `).all(limit) as AddressStatsRecord[];
}

/**
 * Get top minters
 */
export function getTopMinters(limit: number): AddressStatsRecord[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM address_stats
    WHERE total_minted > 0
    ORDER BY total_minted DESC
    LIMIT ?
  `).all(limit) as AddressStatsRecord[];
}

/**
 * Get all-time aggregated stats
 */
export function getAllTimeAggregates(): {
  totalTransactions: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalMinted: number;
  totalBurned: number;
  uniqueAddresses: number;
} {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      SUM(tx_count) as total_tx,
      SUM(total_deposited) as total_deposited,
      SUM(total_withdrawn) as total_withdrawn,
      SUM(total_minted) as total_minted,
      SUM(total_burned) as total_burned,
      COUNT(*) as unique_addresses
    FROM address_stats
  `).get() as any;

  return {
    totalTransactions: row?.total_tx ?? 0,
    totalDeposited: row?.total_deposited ?? 0,
    totalWithdrawn: row?.total_withdrawn ?? 0,
    totalMinted: row?.total_minted ?? 0,
    totalBurned: row?.total_burned ?? 0,
    uniqueAddresses: row?.unique_addresses ?? 0,
  };
}

// ============================================================================
// Leaderboard Cache Operations
// ============================================================================

export function getCachedLeaderboard(type: string): { data: string; updated_at: number } | null {
  const db = getDatabase();
  const row = db.prepare('SELECT data, updated_at FROM leaderboard_cache WHERE type = ?').get(type) as { data: string; updated_at: number } | undefined;
  return row ?? null;
}

export function setCachedLeaderboard(type: string, data: string): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO leaderboard_cache (type, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(type) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(type, data, Date.now());
}

export function invalidateLeaderboard(type: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM leaderboard_cache WHERE type = ?').run(type);
}

export function invalidateAllLeaderboards(): void {
  const db = getDatabase();
  db.prepare('DELETE FROM leaderboard_cache').run();
}

// ============================================================================
// Maintenance Operations
// ============================================================================

/**
 * Clear all data and reset sync state (for force resync)
 */
export function resetDatabase(): void {
  const db = getDatabase();
  db.exec(`
    DELETE FROM shelbyusd_activities;
    DELETE FROM address_stats;
    DELETE FROM leaderboard_cache;
    DELETE FROM sync_state;
  `);
  logger.info('Database reset complete');
}

/**
 * Reset farming stats after a network reset
 * Keeps jobs active but zeroes out the cumulative stats
 */
export function resetFarmingStats(): { jobsReset: number; wavesDeleted: number } {
  const db = getDatabase();

  // Count jobs and waves before reset
  const jobCount = (db.prepare('SELECT COUNT(*) as c FROM farming_jobs').get() as { c: number }).c;
  const waveCount = (db.prepare('SELECT COUNT(*) as c FROM farming_waves').get() as { c: number }).c;

  // Reset all job stats to 0 but keep them active
  db.exec(`
    UPDATE farming_jobs SET
      total_minted = 0,
      waves_completed = 0,
      droplets_created = 0,
      droplets_failed = 0,
      last_wave_at = NULL;
    DELETE FROM farming_waves;
  `);

  logger.info({ jobsReset: jobCount, wavesDeleted: waveCount }, 'Farming stats reset complete');
  return { jobsReset: jobCount, wavesDeleted: waveCount };
}

/**
 * Run VACUUM to reclaim space and optimize
 */
export function vacuumDatabase(): void {
  const db = getDatabase();
  db.exec('VACUUM');
  logger.info('Database vacuum complete');
}

/**
 * Get database stats for monitoring
 */
export function getDatabaseStats(): {
  activityCount: number;
  addressCount: number;
  lastSyncedVersion: number;
  dbSizeBytes: number;
} {
  const db = getDatabase();
  const fs = require('fs');

  const activityCount = (db.prepare('SELECT COUNT(*) as c FROM shelbyusd_activities').get() as { c: number }).c;
  const addressCount = (db.prepare('SELECT COUNT(*) as c FROM address_stats').get() as { c: number }).c;
  const lastVersion = getLastSyncedVersion();

  let dbSize = 0;
  try {
    const stats = fs.statSync(DB_PATH);
    dbSize = stats.size;
  } catch {
    // File might not exist yet
  }

  return {
    activityCount,
    addressCount,
    lastSyncedVersion: lastVersion,
    dbSizeBytes: dbSize,
  };
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

// ============================================================================
// Farming Job Operations
// ============================================================================

export interface FarmingJobConfig {
  regions: string[];
  dropletsPerRegion: number;
  waveIntervalMs: number;
  maxWaves?: number;
}

export interface FarmingJob {
  id: string;
  wallet_address: string;
  status: 'active' | 'paused' | 'stopped' | 'completed';
  started_at: number;
  stopped_at: number | null;
  total_minted: number;
  waves_completed: number;
  droplets_created: number;
  droplets_failed: number;
  last_wave_at: number | null;
  config: FarmingJobConfig;
}

export interface FarmingWave {
  id: number;
  job_id: string;
  wave_number: number;
  started_at: number;
  completed_at: number | null;
  regions: string[];
  droplets_per_region: number;
  total_droplets: number;
  droplets_succeeded: number;
  droplets_failed: number;
  estimated_minted: number;
}

/**
 * Create a new farming job
 */
export function createFarmingJob(
  walletAddress: string,
  config: FarmingJobConfig
): FarmingJob {
  const db = getDatabase();
  const id = `cfarm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  db.prepare(`
    INSERT INTO farming_jobs (id, wallet_address, status, started_at, config)
    VALUES (?, ?, 'active', ?, ?)
  `).run(id, walletAddress, now, JSON.stringify(config));

  logger.info({ jobId: id, walletAddress }, 'Created continuous farming job');

  return {
    id,
    wallet_address: walletAddress,
    status: 'active',
    started_at: now,
    stopped_at: null,
    total_minted: 0,
    waves_completed: 0,
    droplets_created: 0,
    droplets_failed: 0,
    last_wave_at: null,
    config,
  };
}

/**
 * Get a farming job by ID
 */
export function getFarmingJob(jobId: string): FarmingJob | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM farming_jobs WHERE id = ?').get(jobId) as any;
  if (!row) return null;

  return {
    ...row,
    config: JSON.parse(row.config),
  };
}

/**
 * Get active farming job for a wallet (only one active per wallet)
 */
export function getActiveFarmingJob(walletAddress: string): FarmingJob | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT * FROM farming_jobs
    WHERE wallet_address = ? AND status = 'active'
    ORDER BY started_at DESC
    LIMIT 1
  `).get(walletAddress) as any;

  if (!row) return null;

  return {
    ...row,
    config: JSON.parse(row.config),
  };
}

/**
 * Get all active farming jobs
 */
export function getAllActiveFarmingJobs(): FarmingJob[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM farming_jobs WHERE status = 'active'
  `).all() as any[];

  return rows.map(row => ({
    ...row,
    config: JSON.parse(row.config),
  }));
}

/**
 * Update farming job stats after a wave
 */
export function updateFarmingJobAfterWave(
  jobId: string,
  dropletsCreated: number,
  dropletsFailed: number,
  estimatedMinted: number
): void {
  const db = getDatabase();
  const now = Date.now();

  db.prepare(`
    UPDATE farming_jobs SET
      waves_completed = waves_completed + 1,
      droplets_created = droplets_created + ?,
      droplets_failed = droplets_failed + ?,
      total_minted = total_minted + ?,
      last_wave_at = ?
    WHERE id = ?
  `).run(dropletsCreated, dropletsFailed, estimatedMinted, now, jobId);
}

/**
 * Stop a farming job
 */
export function stopFarmingJob(jobId: string, status: 'stopped' | 'completed' = 'stopped'): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE farming_jobs SET status = ?, stopped_at = ? WHERE id = ?
  `).run(status, Date.now(), jobId);

  logger.info({ jobId, status }, 'Stopped farming job');
}

/**
 * Get farming job history for a wallet
 */
export function getFarmingJobHistory(walletAddress: string, limit: number = 10): FarmingJob[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM farming_jobs
    WHERE wallet_address = ?
    ORDER BY started_at DESC
    LIMIT ?
  `).all(walletAddress, limit) as any[];

  return rows.map(row => ({
    ...row,
    config: JSON.parse(row.config),
  }));
}

/**
 * Create a farming wave record
 */
export function createFarmingWave(
  jobId: string,
  waveNumber: number,
  regions: string[],
  dropletsPerRegion: number
): FarmingWave {
  const db = getDatabase();
  const now = Date.now();
  const totalDroplets = regions.length * dropletsPerRegion;

  const result = db.prepare(`
    INSERT INTO farming_waves (job_id, wave_number, started_at, regions, droplets_per_region, total_droplets)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(jobId, waveNumber, now, JSON.stringify(regions), dropletsPerRegion, totalDroplets);

  return {
    id: Number(result.lastInsertRowid),
    job_id: jobId,
    wave_number: waveNumber,
    started_at: now,
    completed_at: null,
    regions,
    droplets_per_region: dropletsPerRegion,
    total_droplets: totalDroplets,
    droplets_succeeded: 0,
    droplets_failed: 0,
    estimated_minted: 0,
  };
}

/**
 * Complete a farming wave with results
 */
export function completeFarmingWave(
  waveId: number,
  dropletsSucceeded: number,
  dropletsFailed: number,
  estimatedMinted: number
): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE farming_waves SET
      completed_at = ?,
      droplets_succeeded = ?,
      droplets_failed = ?,
      estimated_minted = ?
    WHERE id = ?
  `).run(Date.now(), dropletsSucceeded, dropletsFailed, estimatedMinted, waveId);
}

/**
 * Get waves for a farming job
 */
export function getFarmingWaves(jobId: string, limit: number = 50): FarmingWave[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM farming_waves
    WHERE job_id = ?
    ORDER BY wave_number DESC
    LIMIT ?
  `).all(jobId, limit) as any[];

  return rows.map(row => ({
    ...row,
    regions: JSON.parse(row.regions),
  }));
}

/**
 * Get summary stats for all farming jobs
 */
export function getFarmingSummary(): {
  activeJobs: number;
  totalJobs: number;
  totalMinted: number;
  totalWaves: number;
  totalDropletsCreated: number;
} {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'active' THEN 1 END) as active_jobs,
      COUNT(*) as total_jobs,
      COALESCE(SUM(total_minted), 0) as total_minted,
      COALESCE(SUM(waves_completed), 0) as total_waves,
      COALESCE(SUM(droplets_created), 0) as total_droplets
    FROM farming_jobs
  `).get() as any;

  return {
    activeJobs: row.active_jobs || 0,
    totalJobs: row.total_jobs || 0,
    totalMinted: row.total_minted || 0,
    totalWaves: row.total_waves || 0,
    totalDropletsCreated: row.total_droplets || 0,
  };
}

// ============================================================================
// Blob Events Operations
// ============================================================================

export interface BlobEventRecord {
  transaction_version: number;
  event_index: number;
  blob_id: string;
  owner_address: string;
  size_bytes: number;
  encoding: string | null;
  blob_name: string | null;
  creation_timestamp: number | null;
  expiration_timestamp: number | null;
}

/**
 * Insert blob events in a batch transaction
 */
export function insertBlobEvents(events: BlobEventRecord[]): number {
  if (events.length === 0) return 0;

  const db = getDatabase();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO blob_events
    (transaction_version, event_index, blob_id, owner_address, size_bytes, encoding, blob_name, creation_timestamp, expiration_timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items: BlobEventRecord[]) => {
    let inserted = 0;
    for (const item of items) {
      const result = insert.run(
        item.transaction_version,
        item.event_index,
        item.blob_id,
        item.owner_address,
        item.size_bytes,
        item.encoding,
        item.blob_name,
        item.creation_timestamp,
        item.expiration_timestamp
      );
      if (result.changes > 0) inserted++;
    }
    return inserted;
  });

  const inserted = insertMany(events);
  logger.info({ inserted, total: events.length }, 'Inserted blob events into database');
  return inserted;
}

/**
 * Get the highest transaction version for blob events
 */
export function getLastBlobSyncedVersion(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT MAX(transaction_version) as max_version FROM blob_events').get() as { max_version: number | null };
  return row?.max_version ?? 0;
}

/**
 * Get total blob count from local database
 */
export function getBlobCount(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(*) as count FROM blob_events').get() as { count: number };
  return row.count;
}

/**
 * Get total storage from local database
 */
export function getTotalBlobStorage(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT COALESCE(SUM(size_bytes), 0) as total FROM blob_events').get() as { total: number };
  return row.total;
}

/**
 * Get unique blob owners count
 */
export function getUniqueBlobOwners(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(DISTINCT owner_address) as count FROM blob_events').get() as { count: number };
  return row.count;
}

/**
 * Get blob stats aggregated by owner
 */
export function getBlobStatsByOwner(limit: number = 10): Array<{
  owner_address: string;
  blob_count: number;
  total_bytes: number;
}> {
  const db = getDatabase();
  return db.prepare(`
    SELECT
      owner_address,
      COUNT(*) as blob_count,
      SUM(size_bytes) as total_bytes
    FROM blob_events
    GROUP BY owner_address
    ORDER BY total_bytes DESC
    LIMIT ?
  `).all(limit) as Array<{ owner_address: string; blob_count: number; total_bytes: number }>;
}

/**
 * Get blob stats by file type (inferred from encoding/name)
 */
export function getBlobStatsByType(): Array<{
  file_type: string;
  count: number;
  total_bytes: number;
}> {
  const db = getDatabase();
  return db.prepare(`
    SELECT
      CASE
        WHEN blob_name LIKE '%.json' OR encoding = 'application/json' THEN 'json'
        WHEN blob_name LIKE '%.png' OR blob_name LIKE '%.jpg' OR blob_name LIKE '%.jpeg' OR blob_name LIKE '%.gif' OR blob_name LIKE '%.webp' THEN 'image'
        WHEN blob_name LIKE '%.mp4' OR blob_name LIKE '%.webm' OR blob_name LIKE '%.mov' THEN 'video'
        WHEN blob_name LIKE '%.mp3' OR blob_name LIKE '%.wav' OR blob_name LIKE '%.ogg' THEN 'audio'
        WHEN blob_name LIKE '%.txt' OR blob_name LIKE '%.md' THEN 'text'
        WHEN blob_name LIKE '%.pdf' THEN 'document'
        WHEN blob_name LIKE '%.zip' OR blob_name LIKE '%.tar' OR blob_name LIKE '%.gz' THEN 'archive'
        ELSE 'other'
      END as file_type,
      COUNT(*) as count,
      SUM(size_bytes) as total_bytes
    FROM blob_events
    GROUP BY file_type
    ORDER BY count DESC
  `).all() as Array<{ file_type: string; count: number; total_bytes: number }>;
}

/**
 * Get recent blob events
 */
export function getRecentBlobEvents(limit: number = 20): BlobEventRecord[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM blob_events
    ORDER BY transaction_version DESC
    LIMIT ?
  `).all(limit) as BlobEventRecord[];
}

/**
 * Get blob sync statistics
 */
export function getBlobSyncStats(): {
  totalBlobs: number;
  totalStorage: number;
  uniqueOwners: number;
  lastVersion: number;
} {
  const db = getDatabase();
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_blobs,
      COALESCE(SUM(size_bytes), 0) as total_storage,
      COUNT(DISTINCT owner_address) as unique_owners,
      COALESCE(MAX(transaction_version), 0) as last_version
    FROM blob_events
  `).get() as any;

  return {
    totalBlobs: stats.total_blobs || 0,
    totalStorage: stats.total_storage || 0,
    uniqueOwners: stats.unique_owners || 0,
    lastVersion: stats.last_version || 0,
  };
}

/**
 * portfolio.cjs
 * P&L snapshot engine using sql.js (pure-JS SQLite — no native build required).
 * Stores daily portfolio value snapshots for historical charting.
 */

const path = require("path");
const fs = require("fs");

let db = null;
let SQL = null;
const DB_FILENAME = "hub-portfolio.db";

/**
 * Initialize sql.js and open (or create) the database.
 * Must be called once from main.cjs after app.whenReady().
 * @param {string} userDataPath - app.getPath("userData")
 */
async function initDB(userDataPath) {
  if (db) return db; // already open

  // sql.js ships a WASM binary; load it from node_modules
  const initSqlJs = require("sql.js");
  SQL = await initSqlJs();

  const dbPath = path.join(userDataPath, DB_FILENAME);

  if (fs.existsSync(dbPath)) {
    // Load existing DB from disk
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    // Create a fresh database
    db = new SQL.Database();
  }

  // Ensure the snapshots table exists
  db.run(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      total_usd REAL    NOT NULL,
      breakdown TEXT    NOT NULL DEFAULT '{}'
    );
  `);

  // Persist the DB to disk immediately after creation
  persistDB(userDataPath);

  console.log("[Portfolio DB] Initialized at:", dbPath);
  return db;
}

/**
 * Write the in-memory database back to disk.
 * @param {string} userDataPath
 */
function persistDB(userDataPath) {
  if (!db) return;
  const dbPath = path.join(userDataPath, DB_FILENAME);
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

/**
 * Take a portfolio snapshot.
 * Calculates total USD value from exchange balances and stores it.
 *
 * @param {string} userDataPath
 * @param {Object} balancesMap - { binance: { BTC: 0.5, USDT: 100 }, ... }
 * @param {Object} prices - { BTC: 65000, ETH: 3500, ... } — current prices
 */
function takeSnapshot(userDataPath, balancesMap, prices) {
  if (!db) {
    console.warn("[Portfolio DB] DB not initialized. Cannot take snapshot.");
    return null;
  }

  let totalUsd = 0;
  const breakdown = {};

  for (const [exchange, assets] of Object.entries(balancesMap)) {
    breakdown[exchange] = {};
    for (const [coin, amount] of Object.entries(assets)) {
      if (!amount || amount <= 0) continue;

      let usdValue = 0;
      if (coin === "USDT" || coin === "BUSD" || coin === "USDC") {
        usdValue = amount;
      } else if (prices[coin]) {
        usdValue = amount * prices[coin];
      }
      // If no price available, record the amount but not in USD
      breakdown[exchange][coin] = { amount, usdValue };
      totalUsd += usdValue;
    }
  }

  const timestamp = Date.now();
  db.run(
    "INSERT INTO snapshots (timestamp, total_usd, breakdown) VALUES (?, ?, ?)",
    [timestamp, totalUsd, JSON.stringify(breakdown)]
  );

  persistDB(userDataPath);

  console.log(`[Portfolio DB] Snapshot taken: $${totalUsd.toFixed(2)} USD`);
  return { timestamp, totalUsd, breakdown };
}

/**
 * Get the last N days of snapshots sorted by timestamp ascending.
 * @param {number} days - how many days of history to return
 * @returns {Array<{id, timestamp, total_usd, breakdown}>}
 */
function getHistory(days = 30) {
  if (!db) return [];

  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const stmt = db.prepare(
    "SELECT id, timestamp, total_usd, breakdown FROM snapshots WHERE timestamp >= ? ORDER BY timestamp ASC"
  );
  stmt.bind([since]);

  const rows = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    rows.push({
      id: row.id,
      timestamp: row.timestamp,
      total_usd: row.total_usd,
      breakdown: JSON.parse(row.breakdown || "{}"),
    });
  }
  stmt.free();
  return rows;
}

/**
 * Get the most recent snapshot.
 */
function getLatestSnapshot() {
  if (!db) return null;
  const stmt = db.prepare(
    "SELECT id, timestamp, total_usd, breakdown FROM snapshots ORDER BY timestamp DESC LIMIT 1"
  );
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return {
      id: row.id,
      timestamp: row.timestamp,
      total_usd: row.total_usd,
      breakdown: JSON.parse(row.breakdown || "{}"),
    };
  }
  stmt.free();
  return null;
}

module.exports = {
  initDB,
  persistDB,
  takeSnapshot,
  getHistory,
  getLatestSnapshot,
};

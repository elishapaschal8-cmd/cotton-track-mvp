import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'data', 'cotton_track.db');

sqlite3.verbose();

const db = new sqlite3.Database(dbPath, (error) => {
  if (error) {
    console.error('Could not initialize SQLite database:', error.message);
  }
});

async function initializeDatabase() {
  const schema = `
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buying_center TEXT NOT NULL,
      farmer_name TEXT NOT NULL,
      farmer_phone TEXT NOT NULL,
      farmer_phone_normalized TEXT NOT NULL,
      weight_kg REAL NOT NULL,
      weight_grams INTEGER NOT NULL,
      weight_source TEXT NOT NULL CHECK(weight_source IN ('MANUAL', 'SCALE_SIMULATOR')),
      price_per_kg_tzs REAL NOT NULL,
      total_tzs INTEGER NOT NULL,
      transaction_ref TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'SAVED' CHECK(status IN ('DRAFT', 'WEIGHING', 'WEIGHT_LOCKED', 'CONFIRMING', 'SAVED')),
      sms_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(sms_status IN ('PENDING', 'SENT', 'FAILED')),
      sms_message TEXT,
      sms_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
  `;

  await new Promise((resolve, reject) => {
    db.exec(schema, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function getDb() {
  return db;
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onComplete(error) {
      if (error) {
        reject(error);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
      } else {
        resolve(row);
      }
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
      } else {
        resolve(rows || []);
      }
    });
  });
}

function closeDb() {
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

export { dbPath, initializeDatabase, getDb, runQuery, getQuery, allQuery, closeDb };

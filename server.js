import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import dotenv from 'dotenv';

import { initializeDatabase, getDb, runQuery, getQuery, allQuery } from './database.js';
import { sendSms } from './sms.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const VALID_WEIGHT_SOURCES = new Set(['MANUAL', 'SCALE_SIMULATOR']);

function roundHalfUp(value, decimalPlaces = 0) {
  const factor = 10 ** decimalPlaces;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(value) * factor) + 0.5) / factor;
}

function getTanzaniaDateStamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date);
  const values = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  return `${values.year}${values.month}${values.day}`;
}

function calculateWeightGrams(weightKg) {
  return Number(roundHalfUp(Number(weightKg) * 1000, 0));
}

function calculateTotalTzs(weightKg, pricePerKgTzs) {
  const weightGrams = calculateWeightGrams(weightKg);
  const rawTotal = (weightGrams / 1000) * Number(pricePerKgTzs);
  return Number(roundHalfUp(rawTotal, 0));
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function normalizePhone(phoneValue) {
  const raw = String(phoneValue ?? '').trim();
  if (!raw) {
    return '';
  }

  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  let normalized = digits;
  if (normalized.startsWith('0')) {
    normalized = `255${normalized.slice(1)}`;
  }

  return normalized;
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  return NaN;
}

function parseWeightKg(value) {
  const number = toNumber(value);
  if (!Number.isFinite(number) || number <= 0 || number > 5000) {
    return null;
  }

  const decimals = Number(value.toString().split('.')[1]?.length || 0);
  if (decimals > 2) {
    return null;
  }

  return Number(number.toFixed(2));
}

function parsePricePerKg(value) {
  const number = toNumber(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1000000) {
    return null;
  }

  return Number(number.toFixed(2));
}

function validateTransactionPayload(payload) {
  const errors = [];

  const buyingCenter = typeof payload.buying_center === 'string' ? payload.buying_center.trim() : '';
  const farmerName = typeof payload.farmer_name === 'string' ? payload.farmer_name.trim() : '';
  const farmerPhone = typeof payload.farmer_phone === 'string' ? payload.farmer_phone.trim() : '';
  const weightSource = typeof payload.weight_source === 'string' ? payload.weight_source.trim().toUpperCase() : '';

  if (!buyingCenter) {
    errors.push('buying_center');
  }

  if (!farmerName) {
    errors.push('farmer_name');
  }

  if (!farmerPhone || normalizePhone(farmerPhone).length < 9) {
    errors.push('farmer_phone');
  }

  const weightKg = parseWeightKg(payload.weight_kg);
  if (weightKg === null) {
    errors.push('weight_kg');
  }

  if (!VALID_WEIGHT_SOURCES.has(weightSource)) {
    errors.push('weight_source');
  }

  const pricePerKg = parsePricePerKg(payload.price_per_kg_tzs);
  if (pricePerKg === null) {
    errors.push('price_per_kg_tzs');
  }

  return {
    valid: errors.length === 0,
    errors,
    cleaned: {
      buying_center: buyingCenter,
      farmer_name: farmerName,
      farmer_phone: farmerPhone,
      farmer_phone_normalized: normalizePhone(farmerPhone),
      weight_kg: weightKg,
      weight_source: weightSource,
      price_per_kg_tzs: pricePerKg
    }
  };
}

async function generateTransactionRef() {
  const now = new Date();
  const dateStamp = getTanzaniaDateStamp(now);

  const row = await getQuery(
    `SELECT transaction_ref FROM transactions WHERE transaction_ref LIKE ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    [`CT-${dateStamp}-%`]
  );

  let nextSequence = 1;
  if (row && row.transaction_ref) {
    const lastSequence = Number.parseInt(row.transaction_ref.slice(-4), 10);
    if (!Number.isNaN(lastSequence)) {
      nextSequence = lastSequence + 1;
    }
  }

  return `CT-${dateStamp}-${String(nextSequence).padStart(4, '0')}`;
}

async function findDuplicateTransaction({ farmerPhoneNormalized, weightGrams, pricePerKgTzs, buyingCenter }) {
  const db = getDb();

  const duplicate = await getQuery(
    `SELECT id, transaction_ref, created_at
     FROM transactions
     WHERE buying_center = ?
       AND farmer_phone_normalized = ?
       AND weight_grams = ?
       AND price_per_kg_tzs = ?
       AND status = 'SAVED'
       AND created_at >= datetime('now', '-5 minutes')
     ORDER BY created_at DESC
     LIMIT 1;`,
    [buyingCenter, farmerPhoneNormalized, weightGrams, pricePerKgTzs]
  );

  return duplicate;
}

async function createTransactionRecord(payload) {
  const db = getDb();
  const weightGrams = calculateWeightGrams(payload.weight_kg);
  const totalTzs = calculateTotalTzs(payload.weight_kg, payload.price_per_kg_tzs);

  await new Promise((resolve, reject) => {
    db.run('BEGIN IMMEDIATE', (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  try {
    const transactionRef = await generateTransactionRef();
    const duplicate = await findDuplicateTransaction({
      farmerPhoneNormalized: payload.farmer_phone_normalized,
      weightGrams,
      pricePerKgTzs: payload.price_per_kg_tzs,
      buyingCenter: payload.buying_center
    });

    if (duplicate) {
      throw Object.assign(new Error('duplicate'), { statusCode: 409, code: 'DUPLICATE_TRANSACTION' });
    }

    const result = await runQuery(
      `INSERT INTO transactions (
        buying_center,
        farmer_name,
        farmer_phone,
        farmer_phone_normalized,
        weight_kg,
        weight_grams,
        weight_source,
        price_per_kg_tzs,
        total_tzs,
        transaction_ref,
        status,
        sms_status,
        sms_message,
        sms_error,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SAVED', 'PENDING', NULL, NULL, datetime('now'), datetime('now'))`,
      [
        payload.buying_center,
        payload.farmer_name,
        payload.farmer_phone,
        payload.farmer_phone_normalized,
        payload.weight_kg,
        weightGrams,
        payload.weight_source,
        payload.price_per_kg_tzs,
        totalTzs,
        transactionRef
      ]
    );

    const savedRow = await getQuery(`SELECT * FROM transactions WHERE id = ?`, [result.id]);
    await new Promise((resolve, reject) => {
      db.run('COMMIT', (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    return savedRow;
  } catch (error) {
    await new Promise((resolve) => {
      db.run('ROLLBACK', () => resolve());
    });
    throw error;
  }
}

async function updateTransactionSmsStatus(transactionId, smsInfo) {
  const status = smsInfo.status === 'SENT' ? 'SENT' : 'FAILED';
  const message = smsInfo.message || '';
  const error = smsInfo.error || '';

  await runQuery(
    `UPDATE transactions
     SET sms_status = ?, sms_message = ?, sms_error = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [status, message, error, transactionId]
  );
}

app.post('/api/transactions', async (req, res) => {
  try {
    const validation = validateTransactionPayload(req.body || {});

    if (!validation.valid) {
      return res.status(422).json({
        error: 'Validation failed.',
        details: validation.errors
      });
    }

    const created = await createTransactionRecord(validation.cleaned);
    const smsResponse = await sendSms({
      phone: created.farmer_phone_normalized,
      amount: created.total_tzs,
      transactionRef: created.transaction_ref
    });

    await updateTransactionSmsStatus(created.id, smsResponse);

    const updatedTransaction = await getQuery(`SELECT * FROM transactions WHERE id = ?`, [created.id]);

    return res.status(201).json({
      message: 'Transaction saved successfully.',
      transaction: {
        id: updatedTransaction.id,
        transaction_ref: updatedTransaction.transaction_ref,
        buying_center: updatedTransaction.buying_center,
        farmer_name: updatedTransaction.farmer_name,
        farmer_phone: updatedTransaction.farmer_phone,
        weight_kg: Number(updatedTransaction.weight_kg),
        weight_grams: updatedTransaction.weight_grams,
        weight_source: updatedTransaction.weight_source,
        price_per_kg_tzs: Number(updatedTransaction.price_per_kg_tzs),
        total_tzs: updatedTransaction.total_tzs,
        status: updatedTransaction.status,
        sms_status: updatedTransaction.sms_status,
        created_at: updatedTransaction.created_at
      }
    });
  } catch (error) {
    if (error && error.statusCode === 409) {
      return res.status(409).json({
        error: 'Duplicate transaction detected within the previous 5 minutes.'
      });
    }

    return res.status(500).json({
      error: 'Unable to process the transaction at the moment.'
    });
  }
});

app.use((error, _req, res, _next) => {
  if (error && error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed request body.' });
  }

  return res.status(500).json({ error: 'Unable to process the transaction at the moment.' });
});

app.get('/api/transactions', async (_req, res) => {
  try {
    const rows = await allQuery(
      `SELECT * FROM transactions ORDER BY created_at DESC, id DESC`
    );

    return res.json({
      transactions: rows.map((row) => ({
        id: row.id,
        transaction_ref: row.transaction_ref,
        buying_center: row.buying_center,
        farmer_name: row.farmer_name,
        farmer_phone: row.farmer_phone,
        weight_kg: Number(row.weight_kg),
        weight_grams: row.weight_grams,
        weight_source: row.weight_source,
        price_per_kg_tzs: Number(row.price_per_kg_tzs),
        total_tzs: row.total_tzs,
        status: row.status,
        sms_status: row.sms_status,
        created_at: row.created_at,
        updated_at: row.updated_at
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to load transactions.' });
  }
});

app.get('/api/transactions/:transaction_ref', async (req, res) => {
  const { transaction_ref } = req.params;

  try {
    const row = await getQuery(`SELECT * FROM transactions WHERE transaction_ref = ?`, [transaction_ref]);

    if (!row) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    return res.json({
      transaction: {
        id: row.id,
        transaction_ref: row.transaction_ref,
        buying_center: row.buying_center,
        farmer_name: row.farmer_name,
        farmer_phone: row.farmer_phone,
        weight_kg: Number(row.weight_kg),
        weight_grams: row.weight_grams,
        weight_source: row.weight_source,
        price_per_kg_tzs: Number(row.price_per_kg_tzs),
        total_tzs: row.total_tzs,
        status: row.status,
        sms_status: row.sms_status,
        created_at: row.created_at,
        updated_at: row.updated_at
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to load transaction.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function startServer(port = Number(process.env.PORT || 3000)) {
  await initializeDatabase();

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
  });
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectExecution) {
  startServer().then((server) => {
    const { port } = server.address();
    console.log(`Cotton Track MVP running on http://localhost:${port}`);
  });
}

export { app, startServer, generateTransactionRef, roundHalfUp, calculateTotalTzs, calculateWeightGrams, getTanzaniaDateStamp };

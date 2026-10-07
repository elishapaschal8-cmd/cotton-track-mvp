import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const testDbPath = path.join(process.cwd(), 'data', 'cotton_track_test.db');
await fs.rm(testDbPath, { force: true });
process.env.COTTON_TRACK_SMS_MODE = 'sandbox';
process.env.COTTON_TRACK_DB_PATH = testDbPath;

const { startServer, generateTransactionRef, getTanzaniaDateStamp } = await import('../server.js');

let server;
let baseUrl;

function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

test.before(async () => {
  server = await startServer(0);
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
});

test('transaction creation works and returns valid data', async () => {
  const payload = {
    buying_center: 'Mwanza Cotton Hub',
    farmer_name: 'Asha Msuya',
    farmer_phone: '0712345678',
    weight_kg: 120,
    weight_source: 'SCALE_SIMULATOR',
    price_per_kg_tzs: 1000
  };

  const response = await request('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  assert.equal(response.status, 201);
  const data = await response.json();
  assert.ok(data.transaction.transaction_ref.startsWith('CT-'));
  assert.equal(data.transaction.status, 'SAVED');
  assert.equal(data.transaction.sms_status, 'SENT');
  assert.equal(data.transaction.total_tzs, 120000);
  assert.equal(data.transaction.weight_grams, 120000);
});

test('history and look-up endpoints return transaction records', async () => {
  const listResponse = await request('/api/transactions');
  assert.equal(listResponse.status, 200);
  const listData = await listResponse.json();
  assert.ok(Array.isArray(listData.transactions));
  assert.ok(listData.transactions.length > 0);

  const item = listData.transactions[0];
  const detailResponse = await request(`/api/transactions/${item.transaction_ref}`);
  assert.equal(detailResponse.status, 200);
  const detailData = await detailResponse.json();
  assert.equal(detailData.transaction.transaction_ref, item.transaction_ref);
});

test('duplicate detection blocks repeated transactions within five minutes', async () => {
  const payload = {
    buying_center: 'Mwanza Cotton Hub',
    farmer_name: 'Asha Msuya',
    farmer_phone: '0712345678',
    weight_kg: 120,
    weight_source: 'SCALE_SIMULATOR',
    price_per_kg_tzs: 1000
  };

  const response = await request('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  assert.equal(response.status, 409);
  const data = await response.json();
  assert.match(data.error, /Duplicate/i);
});

test('validation rejects malformed transaction payloads', async () => {
  const response = await request('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      buying_center: '',
      farmer_name: '',
      farmer_phone: 'bad',
      weight_kg: 0,
      weight_source: 'INVALID',
      price_per_kg_tzs: 0
    })
  });

  assert.equal(response.status, 422);
});

test('transaction reference uses Tanzania local calendar date', async () => {
  const ref = await generateTransactionRef();
  const dateStamp = getTanzaniaDateStamp(new Date());

  assert.match(ref, /^CT-\d{8}-\d{4}$/);
  assert.ok(ref.startsWith(`CT-${dateStamp}-`));
});

test('SMS failure keeps the transaction saved', async () => {
  process.env.COTTON_TRACK_SMS_MODE = 'fail';

  const payload = {
    buying_center: 'Kigoma Cotton Hub',
    farmer_name: 'Juma Said',
    farmer_phone: '0765432109',
    weight_kg: 85.5,
    weight_source: 'MANUAL',
    price_per_kg_tzs: 1500
  };

  const response = await request('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(data.transaction.status, 'SAVED');
  assert.equal(data.transaction.sms_status, 'FAILED');

  process.env.COTTON_TRACK_SMS_MODE = 'sandbox';
});

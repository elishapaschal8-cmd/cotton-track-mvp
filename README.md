# Cotton Track MVP

Cotton Track MVP is a small mobile-first transaction app for cotton buying operations. It captures farmer details, simulates or records crop weight, calculates totals using the approved backend logic, stores saved transactions in SQLite, and sends SMS through the configured backend provider integration.

## Purpose

This MVP supports the approved Cotton Track workflow:

- capture farmer information
- collect weight from the simulator or manual input
- validate the transaction payload on the backend
- calculate total using the authoritative backend formula
- save a durable transaction record
- view transaction history
- send SMS status updates through the backend provider flow

## Local setup

```bash
npm install
cp .env.example .env
npm start
```

Then open the app in a browser at:

```text
http://localhost:3000
```

## Required environment variables

Use placeholders in `.env` only. Do not commit real secrets.

```env
PORT=3000
AFRICAS_TALKING_USERNAME=sandbox
AFRICAS_TALKING_API_KEY=replace-with-your-api-key
COTTON_TRACK_SMS_MODE=sandbox
```

## Current MVP scope

- Node.js + Express backend
- SQLite database
- HTML + TailwindCSS + JavaScript frontend
- exactly three API endpoints
- exactly one database table for durable transactions
- scale simulator and manual weight fallback
- SMS lifecycle with PENDING → SENT / FAILED
- transaction history lookup and display
- automated tests with Node.js built-in test runner

## Automated test status

```bash
npm test
```

The current test suite is passing under the existing MVP scope.

# KetKat-EcoFarm

[![CI](https://github.com/Kettailor/CNM--Farm-Product-Traceability/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/Kettailor/CNM--Farm-Product-Traceability/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-14.2-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)
![Version](https://img.shields.io/badge/version-1.0.0-238636)

KetKat-EcoFarm is a Smart Farm Management System for farm operations, digital farm maps, livestock traceability, work planning, warehouse records, documents, notifications, and public QR lookup.

## Live Demo

Demo website: [https://kettailor.io.vn/smart-farm-management-system](https://kettailor.io.vn/smart-farm-management-system)

Demo account:

```text
Email:    demo@kettailor.io.vn
Password: Demo@123456
```

The demo account is provided for evaluation only. Please do not enter private or sensitive data.

## Preview

![KetKat-EcoFarm dashboard demo](./public/assets/demo-dashboard.png)

## Features

- Farm dashboard with operation summaries, data coverage, and traceability flow.
- Digital farm map with zones, resources, paddocks, water sources, and public sharing.
- Livestock groups, individual animal profiles, treatments, events, QR codes, and public lookup.
- Grazing plans, Gantt-style scheduling, activity history, and paddock rotation records.
- Work management with task items, assignment emails, status tracking, and notifications.
- Warehouse and chemical profile management for farm supplies and compliance records.
- User, role, document, and farm settings management.
- Public pages for farm map and livestock traceability.

## Tech Stack

- **Framework:** Next.js 14 App Router, React 18, TypeScript
- **Database:** PostgreSQL, `pg`
- **Maps:** MapLibre GL, Leaflet
- **Charts/UI:** Recharts, Sass, CSS Modules, Bootstrap assets
- **QR/Scanning:** ZXing, jsQR
- **Runtime:** Node.js 22.18+ and npm 10.8+

## Getting Started

Clone the repository and install dependencies:

```bash
git clone https://github.com/Kettailor/CNM--Farm-Product-Traceability.git
cd CNM--Farm-Product-Traceability
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Configure at least:

```env
DATABASE_URL=postgresql://farmhub:farmhub@localhost:55432/farmhub
APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=KetKat-EcoFarm
AUTH_SECRET=change-me-use-a-long-random-secret
NEXTAUTH_SECRET=change-me-use-a-long-random-secret
CRON_SECRET=change-me-cron-secret
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database

The PostgreSQL schema is available at:

```text
database/FarmHub_schema.sql
```

If you use the included Docker Compose setup, PostgreSQL runs on `127.0.0.1:55432`.

Common local database values:

```text
Database: farmhub
Username: farmhub
Password: farmhub
Host:     127.0.0.1
Port:     55432
```

## Docker Local Environment

Start app, PostgreSQL, Adminer, and Nginx locally:

```bash
docker compose up --build
```

Useful URLs:

| Service | URL |
| --- | --- |
| App | http://localhost:3000 |
| Nginx | http://localhost |
| Adminer | http://localhost:8080 |

Stop and remove local containers:

```bash
docker compose down
```

## Available Scripts

```bash
npm run dev        # Start local development server
npm run build      # Build production bundle
npm run start      # Start production server
npm run lint       # Run Next.js lint
npm run typecheck  # Run TypeScript checks
npm run quality    # Run lint, typecheck, and build
```

## Project Structure

```text
.
|-- database/          # PostgreSQL schema
|-- nginx/             # Local reverse proxy config
|-- public/            # Static assets
|-- scripts/           # Local helper scripts
|-- src/app/           # Next.js routes and API routes
|-- src/components/    # Shared UI components
|-- src/lib/           # Auth, database, schema, and domain services
|-- docker-compose.yml
|-- Dockerfile
`-- package.json
```

## Environment And Security Notes

- Do not commit `.env`, `.env.local`, database dumps, certificates, private keys, or uploaded user files.
- Use long random values for `AUTH_SECRET`, `NEXTAUTH_SECRET`, and `CRON_SECRET`.
- Use `.env.example` only as a safe template.
- Runtime uploads under `public/uploads/` are intentionally ignored by Git.
- Demo credentials are public and should only be used with demo data.

## Quality Checks

Before opening a pull request or publishing changes:

```bash
npm run quality
```

Health check endpoint:

```text
GET /api/health
```

Expected response:

```json
{ "ok": true, "service": "KetKat-EcoFarm" }
```

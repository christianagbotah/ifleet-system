# iFleetPro — Complete Knowledge Base

## 1. PROJECT OVERVIEW
- **Name**: iFleetPro Fleet Management System
- **Tech Stack**: Next.js 16 App Router, Prisma ORM, MariaDB/MySQL, TailwindCSS, shadcn/ui, Lucide Icons.
- **Runtime**: Bun in deployment; Node-compatible local tooling.
- **Output Mode**: Next.js standalone.
- **Repository**: `christianagbotah/ifleet-system`.
- Production credentials, origin addresses, signing keys, tokens, and customer data must never be recorded in this file.

## 2. SERVER INFRASTRUCTURE
Production infrastructure is managed outside git. Host addresses and administrative access details belong in the approved operations/password-management system, not repository documentation.

### Database
- Engine: MariaDB/MySQL.
- Runtime connection variable: `DATABASE_URL`.
- Development, test, staging, and production must use separate databases and credentials.
- Database network access must be restricted to approved hosts/private connectivity; do not expose the database broadly to the internet.
- Local development must never default to the production database.

### Reverse Proxy / Process Runtime
- The deployed application runs behind the managed Webuzo reverse proxy and PM2 process runtime.
- Environment-specific paths and origin addresses are intentionally omitted from tracked documentation.
- Do not duplicate reverse-proxy directives already managed by the hosting platform.

## 3. AUTO-DEPLOY PIPELINE (GitHub → VPS)
Production deployment is triggered from reviewed GitHub changes and must pass the repository CI gate.

### Deployment requirements
1. Install dependencies from the lockfile.
2. Run secret scanning, lint, typecheck, tests, Prisma validation, and build checks.
3. Run deployment preflight and verify a backup/checkpoint is available.
4. Apply versioned schema changes with `prisma migrate deploy`.
5. Build the application.
6. Restart the PM2 service.
7. Run smoke/health checks and surface failures.

### Runtime-only configuration
- Deployment signing credential: runtime-only; never commit its value.
- Application `.env`: runtime-only; never commit production values.
- Deployment scripts must not print or persist secret values in logs.

### Critical deployment rules
- Do not mutate the Prisma provider during deployment.
- Do not use `prisma db push` as the normal production migration path.
- Preserve deployment locking to prevent concurrent releases.
- Static assets must be copied correctly for standalone output where required.

## 4. APPLICATION ARCHITECTURE

### Prisma Schema
- Canonical provider: MySQL/MariaDB.
- Core models include User, Role, Driver, Truck, Trip, Item, Client, Invoice, FuelLog, CashAdvance, DriverWallet, DriverSettlement, LoadingCity, LoadingPoint, DestinationCity, DestinationZone, ZoneRate, PerformanceBenchmark, and related operations/compliance entities.
- Business-critical mileage, fuel, and financial calculations must be derived from authoritative event/ledger records rather than silently overwritten summary fields.

### Database URL
- Required variable: `DATABASE_URL`.
- The value is supplied by the process environment only.
- Use `.env.example` for placeholders; never copy production values into tracked files.

### Key Pages/Routes
- Dashboard: `/`
- Trips: `/trips`
- Trucks: `/trucks`
- Drivers: `/drivers`
- Loading Cities / Points and Destination Cities / Zones support factory-to-customer haul configuration.
- Finance and operational modules include zone rates, cash advances, invoices, payroll, fuel, maintenance, reports, tracking, warehouses, tolls, insurance, compliance, and settlements.

### Trip Operations
- Trip creation supports truck/driver assignment, loading points, destination zones, cargo, rate/revenue information, customer/waybill references, mileage evidence, multi-item loads, and multi-drop delivery.
- Core integrity work introduces transaction-safe trip creation, authoritative odometer readings, reconciled fuel, canonical weighbridge variance, and trip reconciliation snapshots.

### File Upload
- Evidence uploads are used for odometer photos, receipts, waybills, POD, and other operational documents.
- Production storage paths and credentials are environment-specific and must not be committed.

## 5. PROCESS CONFIGURATION
- Application process name/configuration is defined by the repository deployment configuration.
- Operational commands and host-specific paths should live in deployment documentation without embedding credentials or origin addresses.

## 6. COMMON ISSUES & PRINCIPLES
| Issue | Required approach |
|---|---|
| Stale reverse-proxy/browser assets | Flush/reload through the approved deployment smoke process. |
| Large JSON strings | Keep schema annotations compatible with MariaDB text limits. |
| Schema changes | Use reviewed Prisma migrations, not production `db push`. |
| Development DB accidentally points to production | Fail closed; `DATABASE_URL` must be explicitly configured per environment. |
| Trip/fuel partial writes | Use database transactions and propagate failures. |
| Odometer rollback | Reject normal lower readings; corrections require explicit audited adjustment workflow. |
| Multi-fill fuel | Aggregate all eligible events; never overwrite a trip with only the latest fill. |

## 7. CURRENT FOUNDATION PRIORITIES
1. Environment/security isolation and secret hygiene.
2. Deterministic tests and GitHub Actions CI.
3. Versioned core-integrity schema and migrations.
4. Odometer ledger and continuity enforcement.
5. Fuel reconciliation and transactional fuel posting.
6. Transaction-safe trip numbering/creation.
7. Canonical weighbridge variance contract.
8. Trip reconciliation snapshots and trustworthy analytics.
9. Migration-based deployment and smoke gates.
10. Integration release gate against an isolated MariaDB test database.

## 8. ENVIRONMENT VARIABLES
Tracked documentation records names only. Values belong in local/runtime secret configuration.

Core names:
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `INTERNAL_API_KEY`
- `WARMUP_SECRET`

Optional integration names as enabled:
- `GROQ_API_KEY`, `GROQ_MODEL`
- `HUBTEL_CLIENT_ID`, `HUBTEL_API_SECRET`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `CORS_ORIGIN`, `UPLOAD_DIR`

## 9. CRITICAL RULES FOR THE AGENT
1. Never commit real credentials, private keys, tokens, signing values, or production connection strings.
2. Never use the production database as the default developer/test database.
3. Keep `main` deployment-safe: implementation happens on reviewed branches and must pass CI before promotion.
4. Use database transactions for business-critical multi-write workflows.
5. Use versioned Prisma migrations for production schema changes.
6. Do not bypass or suppress failed projection/reconciliation writes.
7. Treat `Truck.currentMileage`, `Trip.totalMileage`, `Trip.fuelUsed`, and `Trip.fuelCost` as compatibility projections, not independent truth.
8. Advanced AI features consume authoritative operational data; they do not replace deterministic accounting, authorization, compliance, or safety rules.
9. Use `.env.example` for placeholders only; runtime values remain outside git.

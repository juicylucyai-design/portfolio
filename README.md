# NKSquared Portfolio Manager

Tracks every NKSquared investment from the IC-approved plan onward. All amounts are in USD.

**In this release**
- Sign-in with a users table. Every page and API call requires a session.
- Investments: the deal register.
- IC Case: what the committee approved, with tranches, entry valuation, dilution and exit year → projected IRR and MOIC.
  A revised IC memo adds a new version; earlier versions are never edited.

**Next, per the architecture blueprint:** Documents, Closing, Capital Events, Performance + Statement Intake, Carry.

## Architecture

Layers × modules. Each module owns its tables and exposes one `index.ts`; layers only call downward.

```
web/                      View: Next.js pages, exported as static files
  app/                    login, dashboard, investment, investments/new
  components/             AppShell, IcCaseForm
  lib/api.ts              the only code that calls the server
contracts/index.d.ts      request/response types shared by web and server
server/
  src/main.ts             starts Nest, runs migrations, creates the first admin, serves web/out behind the sign-in gate
  src/common/             cross-cutting: validation, @Public(), page gate
  src/database/           Postgres pool, migration runner, /api/health
  src/shared/             pure kernel: returns-engine (XIRR, MOIC), money
  src/modules/
    users/                users + sessions, login/logout, auth guard
    portfolio/            companies + investments
    ic-case/              ic_cases + ic_tranches, projection
  db/migrations/          one SQL file per module, applied in order on startup
  test/                   node:test unit tests for the money math
```

`npm run check:boundaries` fails if a module reaches into another module's internals, a controller touches a repository,
the shared kernel imports anything app-specific, or the web app imports server code.

## Deploying on Railway

1. **Create a project** from this GitHub repo.
2. **Add PostgreSQL** to the project (New → Database → PostgreSQL).
3. On the app service, set **Variables**:
   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `ADMIN_USERNAME` | the first admin's username |
   | `ADMIN_PASSWORD` | the first admin's password |
   | `ADMIN_DISPLAY_NAME` | optional, shown in the header |
4. **Generate a domain** under Settings → Networking.

Railway uses `railway.json`: `npm run build`, then `npm start`, health check on `/api/health`.
On first start the tables are created and the admin user is added. The admin is only created if that username doesn't exist,
so later changes to `ADMIN_PASSWORD` have no effect; use the script below to reset a password.

### Adding users or resetting a password

From a machine linked to the Railway project:

```bash
railway run --service <app-service> env SET_USERNAME=jane SET_PASSWORD='choose-a-strong-one' SET_ROLE=member npm run set-password -w server
```

Changing a password signs that user out everywhere.

## Running locally

Requires Node.js 22+.

```bash
npm install
npm run db:local          # Postgres-compatible local database (PGlite) on :5432, data kept in ./.local-db
```

In a second terminal (PowerShell shown):

```powershell
$env:DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres?sslmode=disable"
$env:DATABASE_POOL_MAX="1"; $env:ADMIN_USERNAME="admin"; $env:ADMIN_PASSWORD="local-only-password"
npm run build
npm start                  # http://localhost:3000
```

For live-reloading UI work, run `npm run dev:server` and `npm run dev:web` (http://localhost:3001, API calls are forwarded to :3000).

## Checks

```bash
npm test                   # XIRR (checked against Excel), MOIC, IC projections
npm run typecheck
npm run check:boundaries
```

## Security notes

- Passwords are hashed with scrypt. Sessions are random tokens in an HttpOnly, SameSite=Lax cookie; only their SHA-256 hash is stored.
- Five failed sign-ins from the same address lock that username for 15 minutes.
- API writes must be JSON, which blocks cross-site form posts.
- `npm audit` reports a `multer` advisory inside `@nestjs/platform-express` 11. Multer only runs on file-upload routes and this
  release has none. Resolve it (patched multer or Nest 12) before the Documents module adds uploads.

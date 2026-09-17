# NKSquared Portfolio Manager

Tracks every NKSquared investment from the IC-approved plan onward. All amounts are in USD.

**In this release**
- Sign-in with a users table. Every page, API call and document download requires a session.
- Investments: the deal register.
- IC Case: what the committee approved, with tranches, entry valuation, dilution and exit year → projected IRR and MOIC.
  A revised IC memo adds a new version; earlier versions are never edited.
- New investment from an IC memo: upload the PDF, Claude reads it and fills in the company and IC case, you check and save.
  The PDF is kept in the document repository, linked to IC version 1.
- Documents: every saved PDF is listed on its investment, to open or download.
- Closings: upload the closing document (allotment letter, SSA, closing memo, funds flow); Claude reads the shares
  allotted, price, amount paid (converted to USD at the stated rate), post-money, ownership and expenses; you check and save.
  One closing per IC tranche. **Once any closing exists, closing figures are the record of the transaction**: cost
  (invested plus expenses), shares and ownership come from closings, and the IC approval only supplies exit assumptions
  (exit year, exit valuation, dilution) for projected returns.
- Current position on every investment and on the dashboard, from closings when closed and from the IC approval before that.
  Status moves to Partly drawn or Closed automatically as tranches close.
- Delete investment: removes the investment, its closings and expenses, IC versions and tranches, its documents and file
  contents, and everything Claude extracted from them. Requires typing the company name. Single closings can be deleted too.

**Next, per the architecture blueprint:** Capital Events, statements (Performance + Statement Intake), Carry.

## Architecture

Layers × modules. Each module owns its tables and exposes one `index.ts`; layers only call downward.

```
web/                      View: Next.js pages, exported as static files
  app/                    login, dashboard, investment, investments/new
  components/             AppShell, IcCaseForm (fields + live projection), DeleteInvestment
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
    closing/              closings + closing_expenses
    performance/          current position (pure position.ts); no tables yet, statements join later
    documents/            documents + document_files (PDF bytes)
    intake/               extractions of IC memos and closing documents; claude.client.ts is the only code that calls Claude
    lifecycle/            create-from-IC-memo, save/delete closing, delete investment: work spanning modules; owns no tables
  db/migrations/          one SQL file per module, applied in order on startup
  test/                   node:test unit tests: money math, IC projections, checks on Claude's answers
```

`npm run check:boundaries` fails if a module reaches into another module's internals, a controller touches a repository,
the shared kernel imports anything app-specific, or the web app imports server code.

### How create and delete stay modular

`lifecycle` is the only module that knows about all the others. Each module offers its own small operations
(`portfolio.delete`, `icCases.deleteForInvestment`, `documents.deleteByIds`, `intake.deleteForDocuments`), and Lifecycle
calls them in order:

- **Create from memo:** check the IC case → create investment → record IC v1 → attach the memo. If a step fails, the
  investment and IC case are removed again and the uploaded memo is kept so the person can retry.
- **Save closing:** check the tranche → save closing and expenses → attach its document → set status (Partly drawn
  while IC tranches remain undrawn, otherwise Closed). Deleting a closing reverses this.
- **Delete:** extractions → documents and files → closings → IC versions → investment (and the company, if nothing else uses it).
  It runs from the outside in, so if a step fails the investment is still listed and deleting again finishes the job.
- **Abandoned uploads** (uploaded but never saved with an investment) are removed after 24 hours.

## Reading IC memos with Claude

`server/src/modules/intake/ic-memo.extraction.ts` holds the prompt, the JSON schema Claude must answer in
(structured outputs), and the checks applied to the answer before it reaches the form. Out-of-range or malformed values
are dropped with a warning rather than passed on. Every attempt is stored in `extractions` with the model and prompt version.

- Model: `claude-opus-5` by default (override with `CLAUDE_MODEL`). Requests opt into server-side fallbacks, so if the
  model declines a document on policy grounds the API retries on its recommended fallback model.
- The PDF is sent directly (no text conversion), so tables and charts in the memo are read as they appear.
- Non-USD memos: amounts are converted with the exchange rate stated in the memo; without one, the fields are left empty
  with a warning.
- Uploads are limited to 20 MB so the request stays under the Claude API's size limit.

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
   | `ANTHROPIC_API_KEY` | Claude API key, to read IC memos. Without it, memos are still stored and the form is filled in by hand |
   | `CLAUDE_MODEL` | optional, defaults to `claude-opus-5` |
4. **Generate a domain** under Settings → Networking.

Railway uses `railway.json`: `npm run build`, then `npm start`, health check on `/api/health`.
On first start the tables are created and the admin user is added. The admin is only created if that username doesn't exist,
so later changes to `ADMIN_PASSWORD` have no effect; use the script below to reset a password.

### Storage

PDFs are stored in Postgres (`document_files`), so they're included in database backups and deleted in the same place as
everything else. Deleting documents frees that space for new data inside the database; Postgres doesn't shrink the volume
itself. If the document library grows large, moving files to object storage only changes `documents.repository.ts`.

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
$env:ANTHROPIC_API_KEY="..."   # optional, to read memos
npm run build
npm start                  # http://localhost:3000
```

For live-reloading UI work, run `npm run dev:server` and `npm run dev:web` (http://localhost:3001, API calls are forwarded to :3000).

### Local staging

A persistent local copy of the app, separate from production, on the `staging` branch:

```bash
npm run build
npm run staging            # http://localhost:3100, data kept in .staging-db/
```

Settings (admin user, optional `ANTHROPIC_API_KEY`) go in `.env.staging.local`, which git ignores.
Delete `.staging-db/` to start over with an empty database.

## Checks

```bash
npm test                   # XIRR (checked against Excel), MOIC, IC projections, checks on Claude's answers
npm run typecheck
npm run check:boundaries
```

## Security notes

- Passwords are hashed with scrypt. Sessions are random tokens in an HttpOnly, SameSite=Lax cookie; only their SHA-256 hash is stored.
- Five failed sign-ins from the same address lock that username for 15 minutes.
- API writes must be JSON, or a raw PDF for uploads. Browsers can't send either cross-site without a preflight, which blocks
  cross-site form posts.
- Uploads are checked for the PDF file signature, capped at 20 MB, and served back with `Cache-Control: no-store`.
- `npm audit` reports a `multer` advisory inside `@nestjs/platform-express` 11. Multer only parses multipart requests; uploads
  here are sent as the raw PDF body and multipart requests are rejected, so it never runs. Upgrading to NestJS 12 removes the warning.
- Deleting an investment is logged with the user, counts and bytes removed.

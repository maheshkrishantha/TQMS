# TQMS

Tender Quotation Management System, built in phases from the supplied SRS.

## Phase 1 foundation

The initial release includes role-based accounts, company profile settings, item and competitor masters, institution records, supplier registration history and renewals, payment records, audit logs, Sri Lankan province/district selectors, and operational notifications.

Item categories, brands, units, and suppliers have separate pages under the Administration submenu. Institutions and supplier registrations have separate pages. These records are stored in PostgreSQL. Item, competitor, institution, registration, user, category, brand, unit, supplier, and notification lists support search and page-size controls (10, 25, or 50 records per page).

The item catalogue can be exported to Excel or imported from an `.xlsx` workbook with Item Code, Item Name, Category, Brand, Model / Specification, Unit, Warranty (months), and Status columns. A blank template is available from the item page. Category, brand, and unit values must match active item-master entries. Imports accept up to 500 new items per workbook, reject duplicate codes without overwriting existing items, and are audit-logged.

Administrators can create and update user accounts, change email addresses and role assignments, reset another user's password, and deactivate or reactivate accounts. Password resets invalidate the user's existing sessions, and the last active Administrator cannot be removed or demoted. Built-in roles are fixed; custom roles are created from a built-in role's permissions and can only reduce that role's access. Assign custom roles when creating or editing a user. Sales Reps can be assigned a province or selected districts; they can work on their own tenders and tenders in assigned areas, while tender creation remains assigned to the creating rep.

Use Administration → Sales reps & users to create a Sales Rep account and assign all districts in a province or selected districts. Administrators can also choose the company-wide Forest Green, Ocean Blue, or Plum application theme in Business Settings.

Administrators maintain supplier contact records under Administration → Suppliers. Tender supplier prices select an active supplier from this database-backed list; historical supplier names remain attached to existing prices.

Bid and performance bond bank selectors use 4-digit Sri Lankan LankaPay bank codes, displayed alongside each bank name. The API validates the selected code; existing bond records keep displaying their stored bank value.

## Phase 2 tender intake and quotations

The tender register captures Open, Letters, and Walk-In tenders, customer and item details, assigned representatives, closing dates, and bid-bond information. Tender documents and addenda can be uploaded and downloaded by authorized users. Teams can add supplier prices from a modal by selecting both the tender item and supplier, update price details in a modal, and create versioned quotations using lowest, average, or selected supplier cost bases, either percentage margins or direct selling prices, and additional per-unit costs, discounts, and VAT. Quotation approval follows the Sales Rep → Tender Manager → Director workflow. Approved customer quotations can be printed without exposing supplier costs or internal margins.

## Phase 3 tender results and procurement

After submission, teams can record telephone or visit readings, add expected bidders, compare complete bid totals from lowest to highest, and view each competing company's recorded unit price side by side for every tender item. The report highlights the lowest recorded price per item, shows our position and price gap, and keeps correction editor/date history. Competitor records are reused or created when an unlisted bidder is entered.

The results workflow records whole-tender or item-wise awards with winner, quantity, unit price, and loss reason. Award quantities are checked against requested quantities, and purchase orders can be linked to approved quotations and recorded in partial quantities. Each order tracks delivery, invoice and payment status, plus performance-bond details and lifecycle status. Purchase-order documents can be uploaded and downloaded alongside each order. A tender can be completed only after its purchase orders are delivered and paid and any required bonds are returned or expired.

Supplier registration payments support optional cheque-photo and receipt-copy attachments. Authorized Accounts, Costing, and Administrator users can add, download, replace, or remove each document from the registration payment history. PDF, JPEG, PNG, and WebP files up to 5 MB are stored privately in the database; documents are not required to record a payment. Tender and purchase-order attachments support the same file types up to 20 MB.

Notifications are scoped to active recipients and cover tender closing dates, registration expiry, bid and performance bond expiry, supplier-price validity, pending quotation approvals, and overdue tender readings. Users can acknowledge or snooze alerts. Configure SMTP to send alert emails; production requires `SMTP_HOST` and `SMTP_FROM`.

## Phase 4 management reports

The Reports page summarizes tender win/loss outcomes, win rate, awarded value, purchase-order value, delivery/payment and outstanding-bond status. It breaks results down by representative, institution, and province/district and aggregates comparable competitor bids. Reports can be filtered by tender closing-date range, status, and representative, and exported to CSV or Excel, or printed/saved as PDF. Detailed report data is capped at 500 tenders per request; the page identifies truncated results so users can narrow the filters. Sales Representatives' reports follow their own-tender and assigned-area access.

## Phase 5 price guessing model

The tender details page provides an advisory item-level prediction using historical awarded unit prices and the lowest recorded competitor unit prices. It shows a low/most-likely/high range, an empirical win probability at a proposed price, a recommended bid for a selected target probability, expected gross profit against the lowest current supplier cost, and supporting tenders. A recommended price can be copied into the quotation builder. Prediction runs are retained, and the Reports page compares ready predictions with later award prices and reports mean absolute percentage error.

To avoid misleading estimates, the rule-based model requires at least 100 tender readings overall and at least five context-matched awarded-price and competitor-price samples for the catalog item. It prefers matching customer, district, tender type, month, and similar quantities when enough data exists. Unlinked custom tender lines and insufficient histories return an explicit explanation instead of a prediction. Historical prices are not inflation- or exchange-rate-adjusted because no such data series is configured. Model output is advisory; the user makes the final pricing decision.

The web client is a React/Vite static site intended for Cloudflare Pages. The Node.js API and PostgreSQL database run on your server. The client communicates with the API using an explicitly configured URL.

## Requirements

- Node.js 20.19+ (Node.js 22 LTS recommended)
- PostgreSQL 14+
- HTTPS for the production API

## Local setup

### Docker (recommended)

Docker Compose runs PostgreSQL, the API, database migrations, and the web app. Database data is kept in a named volume; PostgreSQL is not exposed outside Docker. Open `http://127.0.0.1:5173` or `http://localhost:5173`. The API health check is at `http://127.0.0.1:4000/api/health`.

The root `.env` stores a generated local database password. `api/.env` stores the API bootstrap email, password and signing secret. Keep both files private; they are git-ignored.

Start the app from the project folder:

```powershell
docker compose up --build -d
docker compose ps
```

The migration container applies the database schema before the API starts. The API creates the initial Administrator from `ADMIN_EMAIL` and `ADMIN_PASSWORD` if no Administrator exists in this Docker database.

Login attempt limits are applied per client IP and account email, and successful sign-ins do not count against the limit.

Useful commands:

```powershell
docker compose logs -f api
docker compose down
```

`docker compose down` preserves the database volume. To permanently erase the local database, run `docker compose down -v`; this deletes all TQMS data in the Docker volume.

### Without Docker

1. Install workspace dependencies from the project root:

   ```powershell
   npm ci
   ```

2. Create a PostgreSQL database and user. Copy `api/.env.example` to `api/.env`, then set `DATABASE_URL`, a random `JWT_SECRET` of at least 32 characters, `ADMIN_EMAIL`, and a strong `ADMIN_PASSWORD` of at least 12 characters.

3. Generate the Prisma client and apply the database migrations:

   ```powershell
   npm run db:generate --workspace=api
   npm run db:deploy --workspace=api
   ```

4. Start the API and web client in separate terminals:

   ```powershell
   npm run dev:api
   npm run dev:web
   ```

   The Vite development server proxies `/api` to `http://localhost:4000`.

The API creates the first Administrator account from the environment variables at startup if that email does not already exist. Sign in with that account and change its password from **Security**.

## Production deployment

### API server

1. Install dependencies and build from the project root:

   ```powershell
   npm ci
   npm run db:generate --workspace=api
   npm run db:deploy --workspace=api
   npm run build --workspace=api
   ```

2. Configure these environment variables for the API process:

   - `DATABASE_URL`: PostgreSQL connection string
   - `JWT_SECRET`: unique random secret, at least 32 characters
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD`: initial Administrator credentials
   - `CLIENT_ORIGIN`: exact public web-client origin
   - `NODE_ENV=production`
   - `PORT`: API listen port (defaults to `4000`)
   - `HOST`: API bind address (defaults to `0.0.0.0`; set to `127.0.0.1` for a native install behind a same-server proxy)
   - `SMTP_HOST` and `SMTP_FROM`: alert email server and sender; `SMTP_PORT` defaults to `587`, `SMTP_SECURE` defaults to `false`, and `SMTP_USER`/`SMTP_PASSWORD` must be supplied together when authentication is required

3. Run `npm run start --workspace=api` under your server's process manager and put the API behind HTTPS. Permit inbound API traffic only as required by your hosting setup.

For a native install behind Tailscale Serve/Funnel or another same-server reverse proxy, set `HOST=127.0.0.1` so the API is not directly reachable on other network interfaces. Leave `HOST` unset for Docker Compose so the container can accept connections through its Docker network.

### Docker API server and Cloudflare Pages

For a Docker-based API/PostgreSQL server, copy `.env.production.example` to `.env.production`, replace every placeholder, and set `DATABASE_URL` to use the Compose database service (`db`). Use a long URL-safe database password or URL-encode it in the connection string. Set `CLIENT_ORIGIN` to the exact Cloudflare Pages custom-domain origin and generate a unique `JWT_SECRET`.

Start the production API and database from the project directory:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml up --build -d
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

The API binds to `127.0.0.1:4000`; configure the server's HTTPS reverse proxy to forward the API hostname to that local port. The production Compose file does not run the web container because the frontend is hosted on Cloudflare Pages. Configure Pages with `VITE_API_URL=https://<your-api-host>`. After creating the first Administrator, remove `ADMIN_PASSWORD` from the production environment.

The readiness endpoint (`/api/ready`) checks PostgreSQL connectivity and is used by the production container health check. `/api/health` is a liveness endpoint.

Schedule a daily database backup and copy it to a separate offsite location:

```sh
./scripts/backup-db.sh /var/backups/tqms 30 .env.production
```

This keeps 30 days of compressed backups on the server. Configure an independent offsite copy with your hosting provider's backup service or an approved transfer tool; test restoring a backup to a separate recovery database before relying on it.

### Cloudflare Pages frontend

- Build command: `npm run build --workspace=client`
- Build output directory: `client/dist`
- Build environment variable: `VITE_API_URL=https://<your-api-host>`

Set `CLIENT_ORIGIN` on the API to the exact Pages custom-domain origin. A custom domain for Pages and an API hostname under the same registered domain is recommended so browsers treat the secure session cookie as same-site. If using a `pages.dev` address, check browser third-party-cookie restrictions for your target browsers.

The API allows one configured client origin; set the production value separately for each deployment environment. Do not expose `.env` files or place database credentials in frontend build variables.

## Build and checks

```powershell
npm run build
npm run lint
npm audit --omit=dev
```

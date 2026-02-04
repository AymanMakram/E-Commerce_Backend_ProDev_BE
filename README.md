# Velo Store (Django 5.2 + DRF + Vanilla JS)

Velo Store is a modern e-commerce platform for the Egyptian market (Amazon/Jumia style): a clean, RTL-first shopping experience for customers and an operational dashboard for sellers. The system is built as a **decoupled** backend (Django + DRF) with a **Vanilla JavaScript, template-hosted SPA-like frontend**.

This repository contains the backend + the frontend assets/templates that consume it.

---

## Project Vision

Build a high-performance, production-ready commerce foundation tailored for Egypt:

- **Arabic/RTL-first UI**, EGP pricing display, and Egypt-ready forms.
- **Robust catalog model** (Products + SKUs + variations/options).
- **Multi-vendor fulfillment** via per-line order statuses (seller updates only their own lines).
- **Predictable checkout integrity**: server-side totals + atomic stock handling.

---

## Core Features (What’s Built)

### Customer Flow

- [x] **Product browsing** with category filtering + search + pagination (`/products/`)
- [x] **Product details** with SKU/variation selection + stock display (`/products/<id>/`)
- [x] **Session-authenticated cart (browser UI)** + add/update/remove items (`/api/cart/…`)
- [x] **Atomic checkout** (locks cart/SKUs, validates stock, computes totals server-side)
- [x] **Order history** and **order tracking page** (`/orders/`, `/orders/track/<id>/`)
- [x] **Localized profile**: Countries/Addresses + Payment Methods (default supported)

### Seller Flow

- [x] **Seller dashboard** (server-side session protected): product CRUD + publish/hide (`/seller/`)
- [x] **Inventory management**: SKU creation/management (`ProductItem`) + option assignment (`ProductConfiguration`)
- [x] **Seller orders dashboard** with line-level updates (`/seller/orders/`)
- [x] **Multi-vendor safe fulfillment**: sellers can update **only their own order lines**
- [x] **Privacy-by-default**: sellers do **not** receive other sellers’ lines in API responses

### Platform Behaviors

- [x] **Browser UI auth = Django session + CSRF**: frontend pages authenticate via same-origin session cookies (no JWT storage in the browser).
- [x] **JWT login + Django session bridging**: `/api/accounts/login/` returns JWTs for API clients and also creates a Django session so server-rendered pages work without redirect loops.
- [x] **Payment status automation**: `Transaction.payment_status` is synced from `ShopOrder.order_status` via signals.
- [x] **Invoice model + automation**: invoice is created when a transaction becomes `Success`.

---

## Technical Architecture

### Decoupled Design

- **Backend**: Django + Django REST Framework (DRF)
- **Auth**:
  - **Browser UI**: Django **sessions** (cookie-based) + **CSRF** for unsafe requests.
  - **External API clients**: SimpleJWT (Bearer tokens).
- **Frontend**: Django templates as entry points + Vanilla JS modules under `frontend/frontend/js/` that call REST APIs using `fetch`.

### Data Model Highlights

- **Product Variations (category-driven):**
  - `Variation` / `VariationOption` define dimensions (e.g., Size/Color) per `ProductCategory`.
  - `ProductItem` is the purchasable SKU.
  - `ProductConfiguration` attaches options to a SKU.
- **Egypt-ready addressing:**
  - Normalized `Country` + `Address` with fields like `unit_number`, `street_number`, `region`, `postal_code`.
  - `UserAddress` links multiple addresses per user and supports `is_default`.
- **Multi-vendor orders:**
  - `ShopOrder` holds the customer-level order.
  - `OrderLine` holds per-SKU quantities and **per-line fulfillment status** (`line_status`, `line_shipped_at`, `line_delivered_at`).

---

## Project Structure

```text
.
├─ accounts/                  # Users, profiles, addresses, payment methods, auth
│  └─ management/commands/    # seed_data management command
├─ products/                  # Catalog: categories, products, SKUs, variations
├─ cart/                      # ShoppingCart + ShoppingCartItem APIs (user + session)
├─ orders/                    # Checkout + order/line lifecycle + seller endpoints
├─ finance/                   # Transaction + PaymentStatus + signals
├─ invoices/                  # Invoice + generation signals
├─ core/                      # Django settings + global URLs
├─ templates/                 # Server-rendered HTML entry points (RTL)
├─ frontend/                  # Frontend assets (Vanilla JS SPA-like modules)
│  └─ frontend/js/            # api.js, base.js, products.js, seller_dashboard.js, ...
├─ static/                    # Static assets (CSS/images + some cart scripts)
├─ media/                     # Uploaded images (product/product_items)
├─ db.sqlite3                 # Local dev DB (default)
└─ manage.py
```

---

## Installation & Setup

### Requirements

- Python **3.11+**
- Windows/macOS/Linux

### Quick Start (Windows PowerShell)

```powershell
# 1) Create + activate venv
python -m venv venv
venv\Scripts\Activate.ps1

# 2) Install dependencies
pip install -r requirements.txt

# 3) Migrate
python manage.py migrate

# 4) Seed realistic data (recommended)
python manage.py seed_data

# 5) Run
python manage.py runserver
```

### Seeding Data (Management Command)

The project includes a production-grade seeder:

```bash
python manage.py seed_data
python manage.py seed_data --products 80 --orders 12 --carts 3
```

Notes:

- It resets relevant domain tables while preserving superusers.
- It creates: sellers/customers, catalog data (with SKUs + variation options), carts, orders, transactions, and optional invoices via signals.

---

## Running the App (Entry Pages)

- Customer catalog: `GET /products/`
- Product details: `GET /products/<product_id>/`
- Cart page: `GET /cart/`
- Customer profile: `GET /profile/`
- Customer orders: `GET /orders/`
- Track order: `GET /orders/track/<order_id>/`

Seller (session-protected):

- Seller dashboard: `GET /seller/`
- Seller profile: `GET /seller/profile/`
- Seller orders: `GET /seller/orders/`

Admin:

- Django admin: `GET /admin/`

---

## API Documentation

Once the server is running:

- Swagger UI (drf-spectacular): `/api/docs/`
- Redoc (drf-spectacular): `/api/redoc/`
- Swagger UI (drf-yasg): `/swagger/`

---

## API Endpoints (Brief)

### Auth & Accounts

- `POST /api/accounts/register/` (customer or seller)
- `POST /api/accounts/login/` (returns JWTs for API clients + establishes Django session for browser UI)
- `GET /api/accounts/csrf/` (ensure CSRF cookie; returns token for SPA-style requests)
- `POST /api/accounts/logout/` (session logout)
- `POST /api/accounts/token/refresh/`
- `GET|PUT /api/accounts/profile/me/`
- `GET /api/accounts/countries/`
- `GET /api/accounts/payment-types/`

Customer-only profile actions:

- `POST /api/accounts/profile/add-address/`
- `PUT|PATCH|DELETE /api/accounts/profile/addresses/<address_id>/`
- `PATCH /api/accounts/profile/addresses/<address_id>/set-default/`
- `GET|POST /api/accounts/profile/payment-methods/`
- `PUT|PATCH|DELETE /api/accounts/profile/payment-methods/<payment_id>/`
- `PATCH /api/accounts/profile/payment-methods/<payment_id>/set-default/`

### Catalog

- `GET /api/categories/`
- `GET /api/products/` (supports `?category=`, `?seller=`, `?search=`, pagination)
- `GET|POST|PUT|PATCH|DELETE /api/products/` (seller-scoped CRUD)
- `GET|POST|PUT|PATCH|DELETE /api/product-items/` (seller-scoped, supports `?product=<id>`)
- `PUT /api/product-items/<id>/options/` (replace SKU option set)
- `GET /api/variations/` (read-only)

### Cart

- `GET /api/cart/` (returns/create cart for user or session)
- `GET|POST|PUT|PATCH|DELETE /api/cart/cart-items/`

### Orders

- `POST /api/orders/` (checkout from cart)
- `GET /api/orders/my-orders/` (customer)
- `GET /api/orders/seller-orders/` (seller)
- `GET /api/orders/statuses/` (status list)

Seller actions:

- `PATCH /api/orders/<id>/set-line-status/` (seller updates only owned line)
- `PATCH /api/orders/<id>/set-status/` (single-vendor orders only)

---

## UI/UX Highlights

- **Skeleton loaders** for product details and order history (loading states)
- **Toast notifications** (`window.showToast`) for success/error feedback
- **Branding**: Cyan accent (`#00BCD4`) + Dark Navy navigation (`#0f172a`)

---

## Project Timeline (19-01-2026 → 04-02-2026)

The timeline below is a **delivery-style view of implemented milestones** during this period (grouped by day ranges). If you need exact timestamps per change, use `git log`.

| Date Range (2026) | Milestone | Key Deliverables |
|---|---|---|
| **19–20 Jan** | Foundation & Domain Baseline | Verified modular apps (`accounts`, `products`, `cart`, `orders`, `finance`, `invoices`) and DRF router structure under `/api/`. |
| **21–22 Jan** | Production-Grade Seeder | Added/standardized `python manage.py seed_data` management command for realistic Egypt-oriented data (sellers/customers, addresses, payment methods, catalog, SKUs/options, carts, orders). |
| **23–24 Jan** | Auth Alignment (JWT + Sessions) | Implemented JWT login that also establishes a Django session so server-rendered pages (especially seller dashboard) work consistently without redirect loops. |
| **25–26 Jan** | Payment Status Automation | Implemented signal-based sync from `ShopOrder.order_status` → `Transaction.payment_status` to avoid UI guessing and keep payment badges consistent. |
| **27–28 Jan** | Cart & Checkout Integrity | Strengthened cart validation (stock-aware quantity handling) and implemented atomic checkout: locks cart/SKUs, validates stock, computes totals server-side, decrements inventory, clears cart safely. |
| **29–30 Jan** | Order Lifecycle Rules | Added/enforced predictable order status transitions and inventory reconciliation rules for cancel/return flows. |
| **31 Jan–01 Feb** | Multi-Vendor Fulfillment | Introduced per-line fulfillment: `OrderLine.line_status` + line timestamps; seller can update only owned lines via `PATCH /api/orders/<id>/set-line-status/`; global order status is derived from line statuses. |
| **02–03 Feb** | Seller Privacy & Aggregation | Ensured sellers do not receive other sellers’ lines in API responses; improved aggregation rules for partial/mixed fulfillment states; kept single-vendor global updates in sync with line statuses. |
| **04 Feb** | Hardening, Documentation & Deployment Plan | Expanded regression tests (seller privacy, stock restore, timestamp behavior, aggregation edge cases) and updated README for crystal-clear onboarding and endpoint discovery. Defined a **single-server AWS EC2** deployment approach (Django + static + media on one instance) using **PostgreSQL** as the primary database. |

Planned next step (post 04 Feb): deploy to AWS EC2 as a single node (app + static + media) backed by PostgreSQL (self-managed on the instance or a managed Postgres service like RDS).

---

## Environment Variables

The project reads `.env` from the repo root.

Recommended values:

```env
SECRET_KEY=change-me
DEBUG=True
ALLOWED_HOSTS=127.0.0.1,localhost

# Optional. If omitted, SQLite is used automatically.
# DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/velo

DEFAULT_FROM_EMAIL=no-reply@velo.local
```

---

## Development Notes

- Seller pages are protected using Django session auth (`login_required`). JWT login intentionally creates a session.
- Cart endpoints support both authenticated user carts and anonymous session carts (`ShoppingCart.session_id`).
- Order lifecycle is enforced with allowed transitions; multi-vendor orders rely on per-line statuses and recomputed global status.

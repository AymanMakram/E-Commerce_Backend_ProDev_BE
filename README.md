# E-Commerce Backend (Django + DRF)

Django-based backend for an e-commerce platform. The project is organized by domain apps: `accounts`, `products`, `cart`, `orders`, `finance`, and `invoices`.

## Requirements

- Windows / macOS / Linux
- Python 3.11+ (venv recommended)

## Quick Start (Windows PowerShell)

From the repo root:

```powershell
# 1) Create + activate venv
python -m venv venv
venv\Scripts\Activate.ps1

# 2) Install dependencies
pip install -r requirements.txt

# 3) Create .env (optional but recommended)
# If DATABASE_URL is not set, SQLite will be used (db.sqlite3)

# 4) Apply migrations
python manage.py migrate

# 5) (Optional) create an admin user
python manage.py createsuperuser

# 6) Run the server
python manage.py runserver
```

Server will be available at:

- HTML entry points: `http://127.0.0.1:8000/products/`
- Admin: `http://127.0.0.1:8000/admin/`

## Environment Variables (.env)

The project reads `.env` from the repo root.

Minimum recommended values:

```env
SECRET_KEY=change-me
DEBUG=True
ALLOWED_HOSTS=127.0.0.1,localhost

# Optional. If omitted, SQLite is used automatically.
# Example Postgres:
# DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/ecommerce

# Email "from" used by password reset emails (in DEBUG emails print to console)
DEFAULT_FROM_EMAIL=no-reply@velo.local
```

Notes:

- In `DEBUG=True`, password reset uses Django console email backend (emails are printed in the server output).
- Static configuration uses both `static/` and `frontend/` via `STATICFILES_DIRS`.

## API Documentation

Once the server is running:

- Swagger UI (drf-spectacular): `http://127.0.0.1:8000/api/docs/`
- Redoc (drf-spectacular): `http://127.0.0.1:8000/api/redoc/`
- Swagger UI (drf-yasg): `http://127.0.0.1:8000/swagger/`

## Authentication (JWT)

JWT authentication is provided by `djangorestframework-simplejwt`.

Key endpoints:

- Register: `POST /api/accounts/register/`
- Login (get tokens): `POST /api/accounts/login/`
- Refresh token: `POST /api/accounts/token/refresh/`

### Register

`user_type` must be `customer` or `seller`.

- Customer required fields: `username`, `password`, `email`, `user_type=customer`, `phone_number`
- Seller required fields: `username`, `password`, `email`, `user_type=seller`, `store_name`, `tax_number`, `seller_phone`

Example:

```bash
curl -X POST http://127.0.0.1:8000/api/accounts/register/ \
	-H "Content-Type: application/json" \
	-d '{
		"username": "customer1",
		"password": "StrongPass123!",
		"email": "customer1@example.com",
		"user_type": "customer",
		"phone_number": "01012345678"
	}'
```

### Login (token obtain)

```bash
curl -X POST http://127.0.0.1:8000/api/accounts/login/ \
	-H "Content-Type: application/json" \
	-d '{"username":"customer1","password":"StrongPass123!"}'
```

Response contains `access` and `refresh`.

### Using the access token

```bash
curl http://127.0.0.1:8000/api/accounts/profile/me/ \
	-H "Authorization: Bearer <ACCESS_TOKEN>"
```

## Core APIs (high level)

Routes are registered under `/api/` via a DRF router.

- Categories: `/api/categories/` (read-only)
- Products: `/api/products/` (public read, seller CRUD)
- Product items (SKUs): `/api/product-items/` (seller CRUD)
- Orders: `/api/orders/` (authenticated)
- Variations: `/api/variations/` (read-only list + options)

## Checkout prerequisites

Order creation expects:

- A non-empty cart
- At least one saved address
- At least one saved payment method

If a `shipping_address_id` / `payment_method_id` is not provided, the API will try to use the default (or first available) address/payment method.

## Useful scripts

The repo includes scripts for seeding and setup (run from the repo root):

- `python seed_customers.py`
- `python seed_data_pro.py`
- `python setup_payment_statuses.py`
- `python setup_pro_payments.py`

## Repository structure

- `core/`: Django project settings + global URLs
- `accounts/`, `products/`, `cart/`, `orders/`, `finance/`, `invoices/`: domain apps
- `templates/`: HTML templates used by the UI pages
- `static/`, `frontend/`: static assets (JS/CSS)
- `media/`: user uploaded images (ignored in git)

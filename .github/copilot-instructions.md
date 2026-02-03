# Copilot Instructions for E-Commerce_Backend_ProDev_BE

## Project Overview
This is a Django-based backend for an e-commerce platform. The codebase is organized by domain-driven modules: `accounts`, `cart`, `core`, `finance`, `invoices`, `orders`, and `products`. Each module contains Django models, serializers, views, URLs, and migrations. The project uses SQLite for local development (`db.sqlite3`).

## Architecture & Data Flow
- **Modular Structure:** Each app (e.g., `accounts`, `cart`, `orders`) encapsulates its own models, views, serializers, and migrations. Cross-app communication is handled via Django signals and model relationships.
- **Core Settings:** Global configuration is in `core/settings.py`. URL routing is managed in `core/urls.py` and per-app `urls.py` files.
- **Media & Static Files:** Product images and other media are stored in `media/`. Static assets are in `static/` and `staticfiles/`.

## Developer Workflows
- **Run Server:** Use `python manage.py runserver` from the project root.
- **Migrations:** Apply with `python manage.py migrate`. Create new migrations with `python manage.py makemigrations <appname>`.
- **Seeding Data:** Use scripts like `seed_customers.py`, `seed_data_pro.py`, `setup_payment_statuses.py`, and `setup_pro_payments.py` for initial/test data.
- **Testing:** Run tests per app with `python manage.py test <appname>`. Test files are named `tests.py` in each app.

## Project-Specific Patterns
- **Serializers:** All API data exchange uses DRF serializers, found in each app's `serializers.py`.
- **Signals:** Business logic for side effects (e.g., payment status updates, invoice generation) is handled in `signals.py` files.
- **Permissions:** Custom permissions are defined in `accounts/permissions.py`.
- **Session Cart:** The `cart` app supports session-based carts via the `session_id` field in models and views.

## Integration Points
- **Payments:** Payment status and setup logic are managed in `finance/` and `setup_payment_statuses.py`.
- **Invoices:** Invoice generation and updates are handled in `invoices/signals.py`.
- **User Types:** The `accounts` app distinguishes user types (customer, seller) via the `user_type` field and related models.

## Conventions & Tips
- **App Naming:** Each Django app is singular and domain-focused.
- **Scripts:** Use provided Python scripts for setup and data seeding; do not modify migrations directly.
- **Media/Static:** Reference media and static files using Django's settings and URL patterns.
- **Extending Models:** Add new fields via migrations; do not edit initial migration files.

## Key Files & Directories
- `core/settings.py`, `core/urls.py`: Global config and routing
- `accounts/`, `cart/`, `orders/`, `products/`, `finance/`, `invoices/`: Main domain apps
- `media/`, `static/`, `staticfiles/`: Asset storage
- `db.sqlite3`: Local development database
- `requirements.txt`: Python dependencies

---
For questions about workflows or architecture, review the relevant app's files and the provided setup scripts. If a pattern is unclear, ask for clarification or examples from the user.

#!/usr/bin/env sh
set -eu

# Run DB migrations/collectstatic only for the web process.
# Worker/beat containers override the command to start Celery.
if [ "${1:-}" = "gunicorn" ] || [ "${1:-}" = "python" ]; then
  python manage.py migrate --noinput
  python manage.py collectstatic --noinput
fi

exec "$@"

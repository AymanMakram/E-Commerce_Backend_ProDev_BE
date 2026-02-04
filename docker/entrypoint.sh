#!/usr/bin/env sh
set -eu

APP_USER="${APP_USER:-appuser}"
APP_GROUP="${APP_GROUP:-appuser}"

# Named volumes are typically owned by root when first mounted.
# Fix ownership once at startup, then drop privileges.
mkdir -p /app/staticfiles /app/media
chown -R "$APP_USER:$APP_GROUP" /app/staticfiles /app/media

run_as_appuser() {
  gosu "$APP_USER" "$@"
}

# Run DB migrations/collectstatic only for the web process.
# Worker/beat containers override the command to start Celery.
if [ "${1:-}" = "gunicorn" ] || [ "${1:-}" = "python" ]; then
  run_as_appuser python manage.py migrate --noinput
  run_as_appuser python manage.py collectstatic --noinput
fi

exec gosu "$APP_USER" "$@"

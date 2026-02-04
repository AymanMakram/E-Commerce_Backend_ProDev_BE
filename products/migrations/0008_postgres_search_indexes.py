"""PostgreSQL-optimized search indexes for product search.

This migration is a no-op on non-PostgreSQL databases (e.g., SQLite).

Indexes added (Postgres only):
- Trigram GIN indexes for fast ILIKE/contains search on name/description (published products)
- Full-text GIN index on a combined tsvector of name + description (published products)

These are created with CONCURRENTLY to minimize locking.
"""

from __future__ import annotations

from django.db import migrations


def _is_postgres(schema_editor) -> bool:
    return getattr(schema_editor.connection, "vendor", None) == "postgresql"


def _has_extension(cursor, extname: str) -> bool:
    cursor.execute("SELECT 1 FROM pg_extension WHERE extname = %s", [extname])
    return cursor.fetchone() is not None


def forwards(apps, schema_editor):
    if not _is_postgres(schema_editor):
        return

    connection = schema_editor.connection
    with connection.cursor() as cursor:
        # Determine whether pg_trgm exists; try to create it if missing.
        has_trgm = _has_extension(cursor, "pg_trgm")
        if not has_trgm:
            try:
                cursor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
                has_trgm = True
            except Exception:
                # On some managed databases, CREATE EXTENSION may be disallowed.
                # In that case we still create the full-text index, and skip trigram indexes.
                has_trgm = False

        # Customer-facing product search always filters to published items.
        # Partial indexes keep index size smaller and improve cache locality.
        if has_trgm:
            cursor.execute(
                """
                CREATE INDEX CONCURRENTLY IF NOT EXISTS products_product_pub_name_trgm_gin
                ON products_product
                USING GIN (name gin_trgm_ops)
                WHERE is_published
                """.strip()
            )
            cursor.execute(
                """
                CREATE INDEX CONCURRENTLY IF NOT EXISTS products_product_pub_desc_trgm_gin
                ON products_product
                USING GIN (description gin_trgm_ops)
                WHERE is_published
                """.strip()
            )

        cursor.execute(
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS products_product_pub_fts_gin
            ON products_product
            USING GIN (
                to_tsvector(
                    'simple',
                    coalesce(name, '') || ' ' || coalesce(description, '')
                )
            )
            WHERE is_published
            """.strip()
        )


def backwards(apps, schema_editor):
    if not _is_postgres(schema_editor):
        return

    connection = schema_editor.connection
    with connection.cursor() as cursor:
        # Drop indexes if they exist. We use CONCURRENTLY to avoid blocking writes.
        cursor.execute("DROP INDEX CONCURRENTLY IF EXISTS products_product_pub_fts_gin")
        cursor.execute("DROP INDEX CONCURRENTLY IF EXISTS products_product_pub_desc_trgm_gin")
        cursor.execute("DROP INDEX CONCURRENTLY IF EXISTS products_product_pub_name_trgm_gin")


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("products", "0007_product_products_pr_is_publ_95a232_idx_and_more"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]

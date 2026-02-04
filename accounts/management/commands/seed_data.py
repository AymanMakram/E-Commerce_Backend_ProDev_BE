"""Seed realistic sample data for the e-commerce platform.

Creates Amazon-like catalog data with:
- Sellers + SellerProfile
- Customers + CustomerProfile
- Countries, Addresses + UserAddress (default flags)
- Payment types + UserPaymentMethod (default flags)
- Categories
- Products + ProductItems (SKUs) + Variation/VariationOption + ProductConfiguration
- Orders (ShopOrder) + lines (OrderLine) + Transactions + optional Invoices via signals
- Optional carts for customers

This command intentionally resets relevant tables first, while preserving superusers.

Usage:
  python manage.py seed_data
  python manage.py seed_data --products 80 --orders 12 --carts 3
"""

from __future__ import annotations

import random
import string
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import re
import urllib.parse
import urllib.request
import json
import time
import concurrent.futures
from pathlib import Path
from io import BytesIO

import requests
from PIL import Image, ImageDraw, ImageFont

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.core.files.base import ContentFile
from django.contrib.auth.hashers import make_password
from django.db import transaction as db_transaction


def _money(value: float | Decimal) -> Decimal:
    d = Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return d


def _rand_digits(n: int) -> str:
    return ''.join(random.choice(string.digits) for _ in range(n))


def _choice_weighted(items: list[str], weights: list[int]) -> str:
    return random.choices(items, weights=weights, k=1)[0]


def _choice_weighted_objs(items: list[object], weights: list[int]) -> object:
    return random.choices(items, weights=weights, k=1)[0]


def _slugify(value: str) -> str:
    value = (value or '').strip().lower()
    value = re.sub(r'[^a-z0-9\s\-_/&]+', '', value)
    value = re.sub(r'[\s/_&\-]+', '-', value).strip('-')
    return value or 'item'


def _stable_seed(text: str, *, length: int = 18) -> str:
    digest = hashlib.sha1(text.encode('utf-8', errors='ignore')).hexdigest()
    return digest[:length]


def _image_url_for_name(*, name: str, extra: str = '', provider: str = 'picsum', width: int = 900, height: int = 700) -> str:
    """Return a deterministic placeholder image URL derived from product name.

    - picsum: stable per seed
    - unsplash: contextual but may change
    """

    provider = (provider or 'picsum').strip().lower()
    base = (name or '').strip() or 'product'
    seed_text = f"{_slugify(base)}:{_slugify(extra)}" if extra else _slugify(base)

    # Note: 'wikimedia' is handled by the seeder when --download-images is enabled.
    # Here we keep a safe fallback URL behavior.
    if provider == 'wikimedia':
        provider = 'picsum'

    if provider == 'unsplash':
        # Mandated sample format: https://source.unsplash.com/featured/?<keyword>
        # Add a stable signature to reduce identical caching across many requests.
        q_raw = f"{base} {extra}".strip()[:140]
        q = urllib.parse.quote_plus(q_raw)
        sig = _stable_seed(seed_text or q_raw, length=10)
        return f"https://source.unsplash.com/featured/?{q}&sig={sig}"

    seed = _stable_seed(seed_text)
    return f"https://picsum.photos/seed/{seed}/{width}/{height}"


def _loremflickr_url(*, category_keyword: str, lock_text: str, width: int = 640, height: int = 480) -> str:
    """Deterministic, category-contextual image URL using loremflickr.

    loremflickr supports a `lock` query parameter; we derive it from lock_text
    to keep image selection stable across runs when --seed is used.
    """

    kw = (category_keyword or '').strip().lower() or 'product'
    lock = int(_stable_seed(lock_text or kw, length=8), 16) % 10_000_000
    # Allow comma-separated keywords.
    kw = re.sub(r'\s+', ',', kw)
    kw = re.sub(r',+', ',', kw).strip(',')
    safe_kw = urllib.parse.quote(kw, safe=',')
    # Avoid an always-on location tag (e.g., egypt) since it can dominate results and
    # cause many products to share the same non-product photo.
    return f"https://loremflickr.com/{int(width)}/{int(height)}/{safe_kw},product,studio?lock={lock}"


def _pick_font(size: int) -> ImageFont.ImageFont:
    # Best-effort: use a common system font on Windows; fall back safely.
    try:
        return ImageFont.truetype('arial.ttf', int(size))
    except Exception:
        try:
            return ImageFont.truetype('DejaVuSans.ttf', int(size))
        except Exception:
            return ImageFont.load_default()


def _wrap_text(text: str, *, max_chars: int) -> list[str]:
    t = (text or '').strip()
    if not t:
        return []
    words = re.split(r'\s+', t)
    lines: list[str] = []
    cur: list[str] = []
    cur_len = 0
    for w in words:
        w = w.strip()
        if not w:
            continue
        add_len = len(w) + (1 if cur else 0)
        if cur and (cur_len + add_len) > int(max_chars):
            lines.append(' '.join(cur))
            cur = [w]
            cur_len = len(w)
        else:
            cur.append(w)
            cur_len += add_len
    if cur:
        lines.append(' '.join(cur))
    return lines


def _synthetic_image_bytes(*, title: str, subtitle: str = '', seed_text: str = '') -> bytes:
    """Generate a clean, unique product image locally (no network).

    Used as a fallback when remote providers return duplicates or fail.
    """

    w, h = 900, 700
    seed = _stable_seed(seed_text or title or 'product', length=8)
    hue = int(seed, 16) % 360
    # Convert hue-ish into a pleasant pastel RGB.
    # Keep simple to avoid additional deps.
    base_r = int(180 + (hue % 60) * 1.2) % 256
    base_g = int(180 + ((hue + 120) % 60) * 1.2) % 256
    base_b = int(180 + ((hue + 240) % 60) * 1.2) % 256

    img = Image.new('RGB', (w, h), (245, 247, 250))
    draw = ImageDraw.Draw(img)

    # Card background
    margin = 46
    draw.rounded_rectangle(
        (margin, margin, w - margin, h - margin),
        radius=28,
        fill=(255, 255, 255),
        outline=(220, 225, 232),
        width=3,
    )

    # Accent header
    header_h = 110
    draw.rounded_rectangle(
        (margin, margin, w - margin, margin + header_h),
        radius=28,
        fill=(base_r, base_g, base_b),
    )
    draw.rectangle((margin, margin + header_h - 28, w - margin, margin + header_h), fill=(base_r, base_g, base_b))

    title_font = _pick_font(40)
    sub_font = _pick_font(26)

    safe_title = (title or 'Product').strip()
    safe_sub = (subtitle or '').strip()

    # Header text
    header_lines = _wrap_text(safe_title, max_chars=26)[:2]
    y = margin + 22
    for line in header_lines:
        draw.text((margin + 28, y), line, fill=(20, 24, 28), font=title_font)
        y += 48

    # Center area: light illustration box
    box_top = margin + header_h + 40
    box_left = margin + 70
    box_right = w - margin - 70
    box_bottom = h - margin - 120
    draw.rounded_rectangle(
        (box_left, box_top, box_right, box_bottom),
        radius=22,
        fill=(248, 250, 252),
        outline=(235, 239, 244),
        width=3,
    )
    # Simple icon-like circles
    cx = (box_left + box_right) // 2
    cy = (box_top + box_bottom) // 2
    r = 110
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(base_r, base_g, base_b), outline=(210, 215, 222), width=3)
    draw.ellipse((cx - 36, cy - 36, cx + 36, cy + 36), fill=(255, 255, 255), outline=(210, 215, 222), width=3)

    if safe_sub:
        sub_lines = _wrap_text(safe_sub, max_chars=42)[:2]
        sy = h - margin - 92
        for line in sub_lines:
            draw.text((margin + 28, sy), line, fill=(60, 70, 82), font=sub_font)
            sy += 32

    out = BytesIO()
    img.save(out, format='JPEG', quality=92, optimize=True)
    return out.getvalue()


def _purge_seed_media_dirs() -> dict[str, int]:
    """Best-effort cleanup for old seeded images.

    Django does not delete media files on queryset delete by default.
    This command is primarily for test/dev resets, so we purge:
    - media/products/seed/* and media/product_items/seed/*
    - legacy files directly under media/products/* and media/product_items/*

    We intentionally do NOT recurse into arbitrary subfolders.
    """

    deleted = 0
    errors = 0

    base = Path(__file__).resolve().parents[3]  # repo root
    media_root = base / 'media'

    for folder in [media_root / 'products', media_root / 'product_items']:
        if folder.exists() and folder.is_dir():
            # Remove any legacy files sitting directly under the folder.
            for child in folder.iterdir():
                try:
                    if child.is_file():
                        child.unlink(missing_ok=True)
                        deleted += 1
                except Exception:
                    errors += 1

            # Remove files inside the standard seed folder.
            seed_dir = folder / 'seed'
            if seed_dir.exists() and seed_dir.is_dir():
                for child in seed_dir.glob('*'):
                    try:
                        if child.is_file():
                            child.unlink(missing_ok=True)
                            deleted += 1
                    except Exception:
                        errors += 1

    return {'deleted': deleted, 'errors': errors}


def _keywords_for_egypt(*, category_name: str, product_name: str) -> list[str]:
    """High-accuracy Egypt category keywords (English) for image searches."""

    cat = (category_name or '').strip().lower()
    name = (product_name or '').strip().lower()

    category_map: dict[str, list[str]] = {
        'electronics': ['samsung', 'iphone', 'playstation'],
        'appliances': ['tornado', 'sharp', 'air conditioner'],
        'home appliances': ['tornado', 'sharp', 'air conditioner'],
        'home & kitchen': ['water filter', 'cookware', 'carpet'],
        'fashion': ['shirt', 'jeans', 'hoodie'],
        'grocery': ['rice', 'coffee', 'food'],
    }

    base = category_map.get(cat, ['product'])

    # Tokenize name into simple signals.
    tokens = set(re.findall(r'[a-z0-9]+', name))
    phrase_hits: list[str] = []
    if 'air' in tokens and 'conditioner' in tokens:
        phrase_hits.append('air conditioner')
    if 'water' in tokens and 'filter' in tokens:
        phrase_hits.append('water filter')

    # Prefer strong brand/product signals when present.
    priority: list[str] = []
    if 'samsung' in tokens:
        priority.append('samsung')
    if 'iphone' in tokens or 'apple' in tokens:
        priority.append('iphone')
    if 'playstation' in tokens or 'ps5' in tokens or 'ps4' in tokens:
        priority.append('playstation')
    if 'tornado' in tokens:
        priority.append('tornado')
    if 'sharp' in tokens:
        priority.append('sharp')

    # Product-type signals.
    if 'hoodie' in tokens:
        priority.append('hoodie')
    if 'jeans' in tokens:
        priority.append('jeans')
    if 'shirt' in tokens or ('t' in tokens and 'shirt' in tokens) or 'tshirt' in tokens:
        priority.append('shirt')
    if 'rice' in tokens:
        priority.append('rice')
    if 'coffee' in tokens:
        priority.append('coffee')

    # Build final list: phrases -> priority -> base, unique, short.
    out: list[str] = []
    seen: set[str] = set()
    for k in (phrase_hits + priority + base):
        kk = (k or '').strip().lower()
        if not kk or kk in seen:
            continue
        seen.add(kk)
        out.append(kk)

    # Keep it tight to improve relevance (avoid too-broad searches).
    return out[:3] if out else ['product']


def download_product_image(keyword: str, *, timeout: int = 10) -> ContentFile | None:
    """Download a real image using requests.get.

    - Accepts either a keyword or a full URL.
    - Returns a ContentFile ready for ImageField.save().
    - Never raises; returns None on failure.
    """

    if not keyword:
        return None

    text = str(keyword).strip()
    url = text
    if not re.match(r'^https?://', text, flags=re.I):
        q = urllib.parse.quote_plus(text[:140])
        # Use Unsplash featured as a generally high-quality source.
        url = f"https://source.unsplash.com/featured/?{q}"

    try:
        resp = requests.get(url, timeout=timeout, stream=True, headers={'User-Agent': 'ECommerceSeedBot/1.0 (local-dev)'})
        resp.raise_for_status()
        content_type = (resp.headers.get('Content-Type') or '').lower()
        if 'image' not in content_type:
            return None
        data = resp.content
        if not data or len(data) < 1024:
            return None
        if len(data) > 8 * 1024 * 1024:
            return None
        return ContentFile(data)
    except Exception:
        return None


def _egypt_mobile_number() -> str:
    """Generate an Egyptian mobile number with real prefixes (010/011/012/015)."""

    prefix = random.choice(['010', '011', '012', '015'])
    return prefix + _rand_digits(8)


def _egypt_postal_code() -> str:
    # Egyptian postal codes are typically 5 digits.
    return _rand_digits(5)


def _egypt_address_line1() -> str:
    # Egyptian street formatting examples.
    return random.choice([
        '90th Street, Fifth Settlement',
        'El-Bahr St',
        'Tahrir Square',
        'El-Hegaz St',
        'Faisal St',
        'Pyramids Rd',
        'Corniche El Nil',
        'Mostafa El-Nahhas St',
        'Abbas El Akkad St',
        'Salah Salem Rd',
    ])


def _egypt_region_for_city(city: str) -> str:
    m = {
        'Cairo': 'Cairo Governorate',
        'Giza': 'Giza Governorate',
        'Alexandria': 'Alexandria Governorate',
        'Mansoura': 'Dakahlia Governorate',
        'Luxor': 'Luxor Governorate',
    }
    return m.get(city, 'Cairo Governorate')


def _wikimedia_thumb_url(*, query: str, width: int = 900) -> str | None:
    """Best-effort image search on Wikimedia Commons.

    Returns a thumbnail URL (thumburl) when available.
    """

    q = (query or '').strip()
    if not q:
        return None

    params = {
        'action': 'query',
        'generator': 'search',
        'gsrnamespace': '6',
        'gsrlimit': '1',
        'gsrsearch': q,
        'prop': 'imageinfo',
        'iiprop': 'url',
        'iiurlwidth': str(int(width)),
        'format': 'json',
        'formatversion': '2',
        'origin': '*',
    }
    url = f"https://commons.wikimedia.org/w/api.php?{urllib.parse.urlencode(params)}"

    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'ECommerceSeedBot/1.0 (local-dev)'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8', errors='ignore'))
    except Exception:
        return None

    pages = (data or {}).get('query', {}).get('pages', [])
    if not pages:
        return None

    imageinfo = (pages[0] or {}).get('imageinfo', [])
    if not imageinfo:
        return None

    info0 = imageinfo[0] or {}
    return info0.get('thumburl') or info0.get('url')


def _download_bytes(url: str, *, timeout: int = 6, max_bytes: int = 8 * 1024 * 1024) -> bytes | None:
    if not url:
        return None

    try:
        resp = requests.get(
            url,
            timeout=timeout,
            stream=True,
            headers={'User-Agent': 'ECommerceSeedBot/1.0 (local-dev)'},
        )
        resp.raise_for_status()
        ctype = (resp.headers.get('Content-Type') or '').lower()
        if ctype and 'image' not in ctype:
            return None

        content = resp.content
        if not content:
            return None
        if len(content) > max_bytes:
            return None
        # Basic sanity: avoid saving tiny non-image payloads.
        if len(content) < 1024:
            return None
        return content
    except Exception:
        return None


def _download_with_retries(url: str, *, retries: int = 2, timeout: int = 6) -> bytes | None:
    """Download bytes with small backoff retries.

    Returns None if all attempts fail.
    """

    tries = max(0, int(retries)) + 1
    for attempt in range(tries):
        b = _download_bytes(url, timeout=timeout)
        if b:
            return b
        # Small backoff; keep short to avoid slowing the seed run.
        if attempt < tries - 1:
            time.sleep(0.15 * (attempt + 1))
    return None


def _download_wikimedia_bytes(*, queries: list[str], cache: dict[str, str], retries: int = 2) -> bytes | None:
    for q0 in (queries or []):
        q = (q0 or '').strip()
        if not q:
            continue

        if q in cache:
            thumb = cache[q]
        else:
            thumb = _wikimedia_thumb_url(query=q, width=900)
            if thumb:
                cache[q] = thumb

        if not thumb:
            continue

        # Gentle rate-limit to reduce blocks.
        time.sleep(0.15)
        b = _download_with_retries(thumb, retries=retries)
        if b:
            return b

    return None


def _save_image_to_field(field_file, *, bytes_data: bytes, basename: str) -> None:
    """Save downloaded bytes into an ImageFieldFile using Django storage."""

    safe = _slugify(basename)[:80]
    name = f"seed/{safe}-{_stable_seed(basename, length=10)}.jpg"
    field_file.save(name, ContentFile(bytes_data), save=False)


def _clean_query_terms(text: str) -> str:
    t = (text or '').strip()
    if not t:
        return ''
    # Replace commas and separators with spaces; remove punctuation that hurts search.
    t = re.sub(r'[,;|/\\]+', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def _clean_variant_terms(text: str) -> str:
    # Variant labels like "Color:Red" should be plain terms.
    t = _clean_query_terms(text)
    t = re.sub(r'[:\-]+', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def _wikimedia_query_for(*, category_name: str, noun: str, image_query: str = '', variant_terms: str = '') -> str:
    cat = (category_name or '').strip()
    noun = (noun or '').strip()
    vt = _clean_variant_terms(variant_terms)

    if cat.lower() == 'books':
        base = f"{noun} book cover"
    elif cat.lower() == 'fashion':
        base = f"{noun} clothing"
    else:
        # Keep it simple: many extra terms reduce results dramatically.
        base = noun or cat or 'product'

    head = _clean_query_terms(' '.join([p for p in [base, vt] if p]))
    return f"{head} filetype:bitmap".strip()


@dataclass(frozen=True)
class CategorySpec:
    name: str
    image_query: str
    price_range: tuple[float, float]


@dataclass(frozen=True)
class ImageTask:
    model: object
    pk: int
    field_name: str
    basename: str
    query_text: str | None = None
    url: str | None = None
    wikimedia_queries: list[str] | None = None
    copy_from_model: object | None = None
    copy_from_pk: int | None = None
    copy_from_field_name: str | None = None


class Command(BaseCommand):
    help = 'Reset and seed the database with realistic e-commerce data.'

    def add_arguments(self, parser):
        parser.add_argument('--products', type=int, default=120, help='Number of products to generate (min 100 for Egypt market).')
        parser.add_argument('--orders', type=int, default=30, help='Number of orders to generate (min 30 mandated).')
        parser.add_argument('--customers', type=int, default=10, help='Number of customers to generate (min 10 mandated).')
        parser.add_argument('--sellers', type=int, default=8, help='Number of sellers to generate (recommended 6-12).')
        parser.add_argument('--min-variations', type=int, default=180, help='Minimum number of ProductItems (SKUs) to generate (min 150).')
        parser.add_argument('--carts', type=int, default=3, help='Number of customer carts to create with items.')
        parser.add_argument('--seed', type=int, default=None, help='Random seed for reproducible data.')
        parser.add_argument(
            '--image-provider',
            choices=['loremflickr', 'picsum', 'unsplash', 'wikimedia', 'synthetic'],
            default='unsplash',
            help='Image provider. Recommended: unsplash. Use synthetic for guaranteed unique local images.',
        )
        parser.add_argument(
            '--download-item-images',
            action='store_true',
            help='Also download images for ProductItem variations (slower; off by default).',
        )
        parser.add_argument(
            '--download-color-item-images',
            action='store_true',
            help='Download variation images only for SKUs with a Color option; other SKUs share the main product image.',
        )
        parser.add_argument(
            '--color-image-categories',
            type=str,
            default='Electronics,Fashion,Appliances',
            help='Comma-separated category names eligible for color-only SKU images when --download-color-item-images is set (default: Electronics,Fashion,Appliances). Use "*" for all categories.',
        )
        parser.add_argument(
            '--defer-images',
            action='store_true',
            help='Defer image downloads until after the DB transaction commits (safer, recommended).',
        )
        parser.add_argument(
            '--image-workers',
            type=int,
            default=12,
            help='Concurrent image download workers (default: 12).',
        )
        parser.add_argument(
            '--image-retries',
            type=int,
            default=2,
            help='Retries per image download (default: 2).',
        )
        parser.add_argument(
            '--image-run-id',
            type=str,
            default=None,
            help='Optional identifier used to vary image filenames per run (cache-busting). Default: derived from seed/time.',
        )
        parser.add_argument(
            '--skip-images',
            action='store_true',
            help='Skip image downloads; leaves ImageFields blank (not recommended).',
        )
        parser.add_argument(
            '--download-images',
            action='store_true',
            help='Deprecated compatibility flag. Images are downloaded by default unless --skip-images is set.',
        )

    def handle(self, *args, **options):
        purge_stats = _purge_seed_media_dirs()
        if purge_stats.get('deleted') or purge_stats.get('errors'):
            self.stdout.write(
                self.style.NOTICE(
                    f"Purged old media files: deleted={purge_stats.get('deleted', 0)} errors={purge_stats.get('errors', 0)}"
                )
            )

        if options.get('seed') is not None:
            random.seed(int(options['seed']))

        download_images = not bool(options.get('skip_images'))

        seed_value = options.get('seed')
        raw_run_id = str(options.get('image_run_id') or '').strip()
        if raw_run_id:
            image_run_id = raw_run_id
        else:
            # Ensure image URLs change between runs even when --seed is constant,
            # so browsers don't keep showing cached images under the same filename.
            stamp = timezone.now().strftime('%Y%m%d%H%M%S')
            image_run_id = f"s{int(seed_value)}-{stamp}" if seed_value is not None else stamp

        if download_images:
            self.stdout.write(self.style.NOTICE(f"Image run id: {image_run_id}"))

        products_target = int(options['products'] or 0)
        orders_target = int(options['orders'] or 0)
        customers_target = int(options.get('customers') or 0)
        sellers_target = int(options.get('sellers') or 0)
        min_variations = int(options.get('min_variations') or 0)
        carts_target = int(options['carts'] or 0)
        image_provider = str(options.get('image_provider') or 'picsum')
        download_item_images = bool(options.get('download_item_images'))
        download_color_item_images = bool(options.get('download_color_item_images'))
        color_image_categories_raw = str(options.get('color_image_categories') or '').strip()
        defer_images = bool(options.get('defer_images'))
        image_workers = int(options.get('image_workers') or 0)
        image_retries = int(options.get('image_retries') or 0)

        if image_workers < 1:
            raise SystemExit('Invalid --image-workers value')

        if products_target < 100:
            raise SystemExit('CRITICAL: --products must be at least 100 (Egypt market mandate).')
        if customers_target < 10:
            raise SystemExit('CRITICAL: --customers must be at least 10 (mandated).')
        if orders_target < 30:
            raise SystemExit('CRITICAL: --orders must be at least 30 (mandated).')
        if min_variations < 150:
            raise SystemExit('CRITICAL: --min-variations must be at least 150 (mandated).')
        if sellers_target < 2:
            raise SystemExit('Invalid --sellers value')

        if color_image_categories_raw == '*':
            color_image_categories: set[str] | None = None
        else:
            color_image_categories = {c.strip().lower() for c in color_image_categories_raw.split(',') if c.strip()}

        if download_color_item_images and not download_item_images:
            scope = 'ALL' if color_image_categories is None else ','.join(sorted(color_image_categories))
            self.stdout.write(self.style.NOTICE(f'Color-only SKU images enabled. Categories: {scope}'))

        try:
            from faker import Faker
        except Exception as e:
            raise SystemExit(
                'Missing dependency: Faker. Install it with `pip install Faker` '
                'and add it to requirements.txt.'
            ) from e

        fake = Faker('en_US')

        # Precompute once to avoid expensive hashing per user.
        common_password_hash = make_password('Password123!')

        from accounts.models import (
            User,
            Country,
            Address,
            UserAddress,
            PaymentType,
            UserPaymentMethod,
            CustomerProfile,
            SellerProfile,
        )
        from products.models import (
            ProductCategory,
            Product,
            ProductItem,
            Variation,
            VariationOption,
            ProductConfiguration,
        )
        from cart.models import ShoppingCart, ShoppingCartItem
        from orders.models import ShopOrder, OrderLine, OrderStatus
        from finance.models import Transaction, PaymentStatus
        from invoices.models import Invoice

        self.stdout.write(self.style.NOTICE('--- Seeding database ---'))

        with transaction.atomic():
            self._reset_database(
                User=User,
                Invoice=Invoice,
                Transaction=Transaction,
                ShopOrder=ShopOrder,
                OrderLine=OrderLine,
                ShoppingCart=ShoppingCart,
                ShoppingCartItem=ShoppingCartItem,
                ProductConfiguration=ProductConfiguration,
                ProductItem=ProductItem,
                Product=Product,
                VariationOption=VariationOption,
                Variation=Variation,
                ProductCategory=ProductCategory,
                UserPaymentMethod=UserPaymentMethod,
                UserAddress=UserAddress,
                Address=Address,
                PaymentType=PaymentType,
                OrderStatus=OrderStatus,
                PaymentStatus=PaymentStatus,
                Country=Country,
                CustomerProfile=CustomerProfile,
                SellerProfile=SellerProfile,
            )

            countries = self._create_countries(Country)
            pay_types = self._create_payment_types(PaymentType)
            pay_status_pending, pay_status_success = self._create_payment_statuses(PaymentStatus)
            statuses = self._create_order_statuses(OrderStatus)

            sellers = self._create_sellers(fake, User, SellerProfile, count=sellers_target, password_hash=common_password_hash)
            customers = self._create_customers(fake, User, CustomerProfile, count=customers_target, password_hash=common_password_hash)

            # Helpful for local dev: make it obvious how to log in after a reset.
            if sellers_target > 0 or customers_target > 0:
                self.stdout.write(self.style.NOTICE('Seeded login credentials (local-dev):'))
                if customers_target > 0:
                    self.stdout.write(self.style.NOTICE(f"- Customers: customer1..customer{customers_target} | password=Password123!"))
                if sellers_target > 0:
                    self.stdout.write(self.style.NOTICE(f"- Sellers: seller1..seller{sellers_target} | password=Password123!"))
                self.stdout.write(self.style.NOTICE("- Superuser 'admin' is preserved across resets; password may be whatever you last set."))

            self._create_customer_addresses(fake, customers, countries, Address, UserAddress)
            self._create_customer_payments(customers, pay_types, UserPaymentMethod)

            # Egypt market categories + contextual loremflickr keywords.
            category_specs = [
                CategorySpec('Electronics', 'samsung-galaxy', (3500.00, 55000.00)),
                CategorySpec('Appliances', 'fresh-air-conditioner', (2500.00, 45000.00)),
                CategorySpec('Fashion', 'gallabeya', (150.00, 2500.00)),
                CategorySpec('Home & Kitchen', 'nouval-cookware', (200.00, 12000.00)),
                CategorySpec('Grocery', 'al-doha-rice', (20.00, 800.00)),
            ]
            categories = self._create_categories(ProductCategory, category_specs)
            variation_map = self._create_variations_for_categories(Variation, VariationOption, categories)

            products, items = self._create_products_and_items(
                fake=fake,
                Product=Product,
                ProductItem=ProductItem,
                ProductConfiguration=ProductConfiguration,
                categories=categories,
                sellers=sellers,
                variation_map=variation_map,
                count=products_target,
                min_variations=min_variations,
                image_provider=image_provider,
                download_images=download_images,
                download_item_images=download_item_images,
                download_color_item_images=download_color_item_images,
                color_image_categories=color_image_categories,
                image_workers=image_workers,
                image_retries=image_retries,
                defer_images=defer_images,
                image_run_id=image_run_id,
            )

            if carts_target > 0:
                self._create_sample_carts(
                    customers=customers,
                    items=items,
                    ShoppingCart=ShoppingCart,
                    ShoppingCartItem=ShoppingCartItem,
                    carts_target=carts_target,
                )

            self._create_orders(
                fake=fake,
                customers=customers,
                items=items,
                statuses=statuses,
                pay_status_pending=pay_status_pending,
                pay_status_success=pay_status_success,
                ShopOrder=ShopOrder,
                OrderLine=OrderLine,
                Transaction=Transaction,
                count=orders_target,
            )

            # Defer image downloads until commit to prevent network failures from rolling back seed data.
            if defer_images and download_images:
                tasks = getattr(self, '_deferred_image_tasks', None)
                if tasks:
                    self.stdout.write(self.style.NOTICE(f'Deferring {len(tasks)} image downloads until after commit...'))
                    db_transaction.on_commit(
                        lambda: self._run_deferred_image_tasks(
                            tasks,
                            image_workers=image_workers,
                            image_retries=image_retries,
                            image_provider=image_provider,
                        )
                    )

        self.stdout.write(self.style.SUCCESS('Seeding completed successfully.'))

    def _run_deferred_image_tasks(self, tasks: list[ImageTask], *, image_workers: int, image_retries: int, image_provider: str) -> None:
        """Download and save images after transaction commit."""

        if not tasks:
            return

        provider = (image_provider or '').strip().lower()
        self.stdout.write(self.style.NOTICE(f'Post-commit image downloads starting (provider={provider})...'))

        url_tasks = [t for t in tasks if t.url]
        wikimedia_tasks = [t for t in tasks if t.wikimedia_queries]
        copy_tasks = [t for t in tasks if t.copy_from_model and t.copy_from_pk and t.copy_from_field_name]

        seen_hashes: set[str] = set()
        saved = 0
        failed = 0
        deduped = 0
        synthetic_fallback = 0

        if url_tasks:
            with concurrent.futures.ThreadPoolExecutor(max_workers=int(image_workers)) as ex:
                future_map: dict[concurrent.futures.Future, ImageTask] = {}
                for t in url_tasks:
                    future_map[ex.submit(_download_with_retries, t.url, retries=image_retries)] = t

                for fut in concurrent.futures.as_completed(future_map):
                    t = future_map[fut]
                    b = None
                    try:
                        b = fut.result()
                    except Exception:
                        b = None

                    if not b:
                        # Fallback: synthetic image so UI never shows a repeated remote placeholder.
                        try:
                            obj = t.model.objects.get(pk=t.pk)
                            title = t.query_text or t.basename
                            synth = _synthetic_image_bytes(title=title, subtitle='', seed_text=f"{t.basename}:fail")
                            _save_image_to_field(getattr(obj, t.field_name), bytes_data=synth, basename=t.basename)
                            obj.save(update_fields=[t.field_name])
                            saved += 1
                            synthetic_fallback += 1
                            continue
                        except Exception:
                            failed += 1
                            continue

                    digest = hashlib.sha1(b).hexdigest()
                    if digest in seen_hashes:
                        # Try cache-busted URL once, then Unsplash, then synthetic.
                        alt1 = None
                        try:
                            sep = '&' if ('?' in (t.url or '')) else '?'
                            alt1 = f"{t.url}{sep}r={_stable_seed(t.basename + ':r1', length=8)}"
                        except Exception:
                            alt1 = None

                        b2 = _download_with_retries(alt1, retries=max(0, image_retries)) if alt1 else None
                        if not b2 and (t.query_text or '').strip():
                            q = urllib.parse.quote_plus((t.query_text or '').strip()[:140])
                            sig = _stable_seed(t.basename + ':u', length=10)
                            alt2 = f"https://source.unsplash.com/featured/?{q}&sig={sig}"
                            b2 = _download_with_retries(alt2, retries=max(0, image_retries))

                        if b2:
                            digest2 = hashlib.sha1(b2).hexdigest()
                            if digest2 not in seen_hashes:
                                b = b2
                                digest = digest2
                                deduped += 1
                            else:
                                b2 = None

                        if not b2:
                            # Final fallback: unique synthetic image.
                            b = _synthetic_image_bytes(title=t.query_text or t.basename, subtitle='', seed_text=f"{t.basename}:dup")
                            digest = hashlib.sha1(b).hexdigest()
                            synthetic_fallback += 1

                    seen_hashes.add(digest)

                    try:
                        obj = t.model.objects.get(pk=t.pk)
                        _save_image_to_field(getattr(obj, t.field_name), bytes_data=b, basename=t.basename)
                        obj.save(update_fields=[t.field_name])
                        saved += 1
                    except Exception:
                        failed += 1

        if wikimedia_tasks:
            cache: dict[str, str] = {}
            for t in wikimedia_tasks:
                try:
                    b = _download_wikimedia_bytes(queries=t.wikimedia_queries or [], cache=cache, retries=image_retries)
                    if not b:
                        failed += 1
                        continue

                    digest = hashlib.sha1(b).hexdigest()
                    if digest in seen_hashes:
                        b = _synthetic_image_bytes(title=t.query_text or t.basename, subtitle='', seed_text=f"{t.basename}:wikidup")
                        digest = hashlib.sha1(b).hexdigest()
                        synthetic_fallback += 1
                    seen_hashes.add(digest)

                    obj = t.model.objects.get(pk=t.pk)
                    _save_image_to_field(getattr(obj, t.field_name), bytes_data=b, basename=t.basename)
                    obj.save(update_fields=[t.field_name])
                    saved += 1
                except Exception:
                    failed += 1

        if copy_tasks:
            for t in copy_tasks:
                try:
                    src = t.copy_from_model.objects.get(pk=int(t.copy_from_pk))
                    dest = t.model.objects.get(pk=int(t.pk))
                    setattr(dest, t.field_name, getattr(src, t.copy_from_field_name))
                    dest.save(update_fields=[t.field_name])
                    saved += 1
                except Exception:
                    failed += 1

        extra = f"; deduped={deduped}; synthetic_fallback={synthetic_fallback}" if (deduped or synthetic_fallback) else ''
        self.stdout.write(self.style.NOTICE(f'Post-commit images saved: {saved}; failed: {failed}{extra}'))

    def _reset_database(self, **models):
        self.stdout.write(self.style.WARNING('Resetting existing data (preserving superusers only)...'))
        User = models['User']

        # Step 1 mandate (core ordering):
        # OrderItems -> Orders -> ProductItems -> Products -> Categories -> Addresses -> Users
        # Additional dependent tables are cleared before their parents to preserve integrity.

        self.stdout.write('Deleting order lines (OrderLine)...')
        models['OrderLine'].objects.all().delete()
        self.stdout.write('Deleting orders (ShopOrder)...')
        models['ShopOrder'].objects.all().delete()

        # Carts depend on ProductItem and User
        self.stdout.write('Deleting cart items (ShoppingCartItem)...')
        models['ShoppingCartItem'].objects.all().delete()
        self.stdout.write('Deleting carts (ShoppingCart)...')
        models['ShoppingCart'].objects.all().delete()

        # Product configuration depends on ProductItem + VariationOption
        self.stdout.write('Deleting product configurations (ProductConfiguration)...')
        models['ProductConfiguration'].objects.all().delete()

        self.stdout.write('Deleting product items (ProductItem)...')
        models['ProductItem'].objects.all().delete()
        self.stdout.write('Deleting products (Product)...')
        models['Product'].objects.all().delete()

        # Variations are category-scoped.
        self.stdout.write('Deleting variation options (VariationOption)...')
        models['VariationOption'].objects.all().delete()
        self.stdout.write('Deleting variations (Variation)...')
        models['Variation'].objects.all().delete()
        self.stdout.write('Deleting categories (ProductCategory)...')
        models['ProductCategory'].objects.all().delete()

        # Payments/addresses depend on users and addresses.
        self.stdout.write('Deleting user payment methods (UserPaymentMethod)...')
        models['UserPaymentMethod'].objects.all().delete()
        self.stdout.write('Deleting user-address links (UserAddress)...')
        models['UserAddress'].objects.all().delete()
        self.stdout.write('Deleting addresses (Address)...')
        models['Address'].objects.all().delete()

        # Reference tables
        self.stdout.write('Deleting payment types (PaymentType)...')
        models['PaymentType'].objects.all().delete()
        self.stdout.write('Deleting order statuses (OrderStatus)...')
        models['OrderStatus'].objects.all().delete()
        self.stdout.write('Deleting payment statuses (PaymentStatus)...')
        models['PaymentStatus'].objects.all().delete()
        self.stdout.write('Deleting countries (Country)...')
        models['Country'].objects.all().delete()

        # Profiles depend on users.
        self.stdout.write('Deleting customer profiles (CustomerProfile)...')
        models['CustomerProfile'].objects.all().delete()
        self.stdout.write('Deleting seller profiles (SellerProfile)...')
        models['SellerProfile'].objects.all().delete()

        # Finance/invoices depend on orders; orders are already deleted, but clear any orphans.
        self.stdout.write('Deleting invoices (Invoice)...')
        models['Invoice'].objects.all().delete()
        self.stdout.write('Deleting transactions (Transaction)...')
        models['Transaction'].objects.all().delete()

        self.stdout.write('Deleting non-superuser accounts (User)...')
        User.objects.filter(is_superuser=False).delete()

        self.stdout.write(self.style.SUCCESS('Database reset complete.'))

    def _create_countries(self, Country):
        self.stdout.write('Creating countries...')
        # Egypt-focused dataset.
        obj, _ = Country.objects.get_or_create(country_name='Egypt')
        return [obj]

    def _create_payment_types(self, PaymentType):
        self.stdout.write('Creating payment types...')
        values = ['Cash on Delivery', 'Visa', 'Mastercard', 'PayPal', 'Amazon Pay']
        return [PaymentType.objects.create(value=v) for v in values]

    def _create_payment_statuses(self, PaymentStatus):
        self.stdout.write('Creating payment statuses...')
        pending, _ = PaymentStatus.objects.get_or_create(status='Pending')
        success, _ = PaymentStatus.objects.get_or_create(status='Success')
        return pending, success

    def _create_order_statuses(self, OrderStatus):
        self.stdout.write('Creating order statuses...')
        out = []
        for n in ['Pending', 'Shipped', 'Delivered', 'Cancelled']:
            obj, _ = OrderStatus.objects.get_or_create(status=n)
            out.append(obj)
        return out

    def _create_sellers(self, fake, User, SellerProfile, count: int, *, password_hash: str):
        self.stdout.write(f'Creating {count} sellers...')
        sellers = []
        for i in range(count):
            username = f'seller{i + 1}'
            u = User.objects.create(username=username, email=f'{username}@example.com', password=password_hash)
            u.user_type = 'seller'
            u.phone_number = _egypt_mobile_number()
            u.save(update_fields=['user_type', 'phone_number'])

            SellerProfile.objects.create(
                user=u,
                store_name=f"{fake.company()} Store",
                tax_number=f"TAX-{_rand_digits(9)}",
            )
            sellers.append(u)
        return sellers

    def _create_customers(self, fake, User, CustomerProfile, count: int, *, password_hash: str):
        self.stdout.write(f'Creating {count} customers...')
        customers = []
        for i in range(count):
            username = f'customer{i + 1}'
            u = User.objects.create(username=username, email=f'{username}@example.com', password=password_hash)
            u.user_type = 'customer'
            u.phone_number = _egypt_mobile_number()
            u.save(update_fields=['user_type', 'phone_number'])

            CustomerProfile.objects.create(user=u, phone_number=u.phone_number, shipping_address=None)
            customers.append(u)
        return customers

    def _create_customer_addresses(self, fake, customers, countries, Address, UserAddress):
        self.stdout.write('Creating customer addresses (2+ each)...')
        egypt_cities = ['Cairo', 'Giza', 'Alexandria', 'Mansoura', 'Luxor']
        for user in customers:
            count = random.randint(2, 3)
            links = []
            for _ in range(count):
                city = random.choice(egypt_cities)
                addr = Address.objects.create(
                    unit_number=str(random.randint(1, 40)),
                    street_number=str(random.randint(1, 9999)),
                    address_line1=_egypt_address_line1(),
                    address_line2=(f"Apartment {random.randint(1, 30)}" if random.random() < 0.4 else None),
                    city=city,
                    region=_egypt_region_for_city(city),
                    postal_code=_egypt_postal_code(),
                    country=random.choice(countries),
                )
                links.append(UserAddress.objects.create(user=user, address=addr, is_default=False))

            links[0].is_default = True
            links[0].save(update_fields=['is_default'])

    def _create_customer_payments(self, customers, pay_types, UserPaymentMethod):
        self.stdout.write('Creating customer payment methods (1-2 each)...')
        today = timezone.now().date()
        for user in customers:
            created = []
            for _ in range(random.randint(1, 2)):
                pt = random.choice(pay_types)
                expiry = today.replace(year=today.year + random.randint(1, 5), month=random.randint(1, 12), day=1)
                created.append(
                    UserPaymentMethod.objects.create(
                        user=user,
                        payment_type=pt,
                        provider=pt.value,
                        account_number=f"**** **** **** {_rand_digits(4)}",
                        expiry_date=expiry,
                        is_default=False,
                    )
                )
            created[0].is_default = True
            created[0].save(update_fields=['is_default'])

    def _create_categories(self, ProductCategory, specs: list[CategorySpec]):
        self.stdout.write('Creating categories...')
        return [ProductCategory.objects.create(category_name=s.name, parent_category=None) for s in specs]

    def _create_variations_for_categories(self, Variation, VariationOption, categories):
        self.stdout.write('Creating variations + options per category...')

        config: dict[str, dict[str, list[str]]] = {
            'Electronics': {'Color': ['Black', 'Blue', 'White'], 'Storage': ['128GB', '256GB']},
            'Appliances': {'Capacity': ['1.5 HP', '2.25 HP', '3 HP'], 'Color': ['White', 'Silver']},
            'Fashion': {'Size': ['L', 'XL', 'XXL'], 'Color': ['Black', 'Navy', 'White']},
            'Home & Kitchen': {'Size': ['Small', 'Medium', 'Large'], 'Material': ['Stainless Steel', 'Cotton', 'Wool']},
            'Grocery': {'Size': ['500g', '1kg', '5kg'], 'Pack': ['Single', 'Pack of 3', 'Pack of 6']},
        }

        variations_by_category_id: dict[int, list] = {}
        options_by_variation_id: dict[int, list] = {}

        for cat in categories:
            cat_name = getattr(cat, 'category_name', '')
            vconf = config.get(cat_name, {'Color': ['Black', 'Blue', 'Red']})

            vars_for_cat = []
            for vname, opts in vconf.items():
                v = Variation.objects.create(category=cat, name=vname)
                vars_for_cat.append(v)
                created_opts = [VariationOption.objects.create(variation=v, value=o) for o in opts]
                options_by_variation_id[v.id] = created_opts

            variations_by_category_id[cat.id] = vars_for_cat

        return {
            'variations_by_category_id': variations_by_category_id,
            'options_by_variation_id': options_by_variation_id,
        }

    def _catalog_templates(self):
        return {
            'Electronics': {
                'brands': ['Samsung', 'Apple', 'Xiaomi', 'OPPO', 'Realme'],
                'items': [
                    {'noun': 'Samsung Galaxy', 'image_keyword': 'samsung-galaxy', 'price_range': (6500.00, 55000.00), 'weight': 5},
                    {'noun': 'iPhone', 'image_keyword': 'iphone', 'price_range': (15000.00, 75000.00), 'weight': 2},
                    {'noun': 'PlayStation Console', 'image_keyword': 'playstation', 'price_range': (12000.00, 42000.00), 'weight': 2},
                    {'noun': 'Bluetooth Speaker', 'image_keyword': 'bluetooth-speaker', 'price_range': (450.00, 4500.00), 'weight': 2},
                    {'noun': 'Wireless Earbuds', 'image_keyword': 'wireless-earbuds', 'price_range': (350.00, 5500.00), 'weight': 3},
                ],
                'feature_pool': ['Fast Charging', 'Dual SIM', 'Warranty', 'Bluetooth', 'HD Display'],
            },
            'Appliances': {
                'brands': ['Fresh', 'Tornado', 'Unionaire', 'Sharp'],
                'items': [
                    {'noun': 'Fresh Air Conditioner', 'image_keyword': 'fresh-air-conditioner', 'price_range': (9000.00, 45000.00), 'weight': 3},
                    {'noun': 'Tornado Fan', 'image_keyword': 'tornado-fan', 'price_range': (1200.00, 6500.00), 'weight': 4},
                    {'noun': 'Water Heater', 'image_keyword': 'water-heater', 'price_range': (2000.00, 9000.00), 'weight': 2},
                ],
                'feature_pool': ['Energy Efficient', 'Warranty', 'Quiet Operation', 'Fast Cooling', 'Made in Egypt'],
            },
            'Fashion': {
                'brands': ['Cottonil', 'Town Team', 'Defacto', 'Local Brand'],
                'items': [
                    {'noun': "Men's Gallabeya", 'image_keyword': 'gallabeya', 'price_range': (220.00, 1800.00), 'weight': 3},
                    {'noun': "Men's T-Shirt", 'image_keyword': 'tshirt-egypt', 'price_range': (150.00, 900.00), 'weight': 4},
                    {'noun': "Men's Jeans", 'image_keyword': 'jeans', 'price_range': (450.00, 1800.00), 'weight': 3},
                    {'noun': "Hoodie", 'image_keyword': 'hoodie', 'price_range': (450.00, 2200.00), 'weight': 2},
                    {'noun': 'Cottonil Underwear', 'image_keyword': 'cottonil', 'price_range': (120.00, 750.00), 'weight': 3},
                ],
                'feature_pool': ['100% Cotton', 'Comfort Fit', 'Machine Washable', 'Egyptian Cotton', 'Breathable'],
            },
            'Home & Kitchen': {
                'brands': ['Nouval', 'Tank', 'Turkish', 'El-Araby'],
                'items': [
                    {'noun': 'Nouval Cookware Set', 'image_keyword': 'nouval-cookware', 'price_range': (850.00, 12000.00), 'weight': 4},
                    {'noun': 'Tank Water Filter', 'image_keyword': 'water-filter', 'price_range': (450.00, 6500.00), 'weight': 3},
                    {'noun': 'Turkish Carpet', 'image_keyword': 'turkish-carpet', 'price_range': (700.00, 20000.00), 'weight': 2},
                ],
                'feature_pool': ['Durable', 'Easy to Clean', 'Heat Resistant', 'Premium Quality', 'Best Seller'],
            },
            'Grocery': {
                'brands': ['Al-Doha', 'Crystal', 'Ahmed Tea'],
                'items': [
                    # Base price is typically for a single smallest size.
                    {'noun': 'Al-Doha Rice', 'image_keyword': 'al-doha-rice', 'price_range': (35.00, 90.00), 'weight': 5},
                    {'noun': 'Crystal Oil', 'image_keyword': 'crystal-oil', 'price_range': (65.00, 95.00), 'weight': 6},
                    {'noun': 'Ahmed Tea', 'image_keyword': 'ahmed-tea', 'price_range': (60.00, 140.00), 'weight': 4},
                    {'noun': 'Ground Coffee', 'image_keyword': 'coffee', 'price_range': (80.00, 260.00), 'weight': 3},
                ],
                'feature_pool': ['Original', 'Best Value', 'Fast Delivery', 'Sealed Pack', 'Egypt Market'],
            },
        }

    def _create_products_and_items(
        self,
        *,
        fake,
        Product,
        ProductItem,
        ProductConfiguration,
        categories,
        sellers,
        variation_map,
        count: int,
        min_variations: int,
        image_provider: str,
        download_images: bool,
        download_item_images: bool,
        download_color_item_images: bool,
        color_image_categories: set[str] | None,
        image_workers: int,
        image_retries: int,
        defer_images: bool,
        image_run_id: str,
    ):
        self.stdout.write(f'Creating {count} products with SKU variations (min {min_variations} SKUs)...')

        run_tag = (image_run_id or '').strip()

        templates = self._catalog_templates()
        variations_by_cat = variation_map['variations_by_category_id']
        options_by_var = variation_map['options_by_variation_id']

        created_products = []
        created_items = []
        used_skus: set[str] = set()

        wikimedia_cache: dict[str, str] = {}

        # Determine how many items per product (1-5 each) while guaranteeing min_variations.
        items_per_product = [random.randint(1, 5) for _ in range(count)]
        total_items = sum(items_per_product)
        if total_items < min_variations:
            remaining = min_variations - total_items
            idxs = list(range(count))
            random.shuffle(idxs)
            for i in idxs:
                if remaining <= 0:
                    break
                room = 5 - items_per_product[i]
                if room <= 0:
                    continue
                add = min(room, remaining)
                items_per_product[i] += add
                remaining -= add

        def get_real_image_bytes(*, queries: list[str]) -> bytes | None:
            for q0 in (queries or []):
                q = (q0 or '').strip()
                if not q:
                    continue

                if q in wikimedia_cache:
                    thumb = wikimedia_cache[q]
                else:
                    thumb = _wikimedia_thumb_url(query=q, width=900)
                    if thumb:
                        wikimedia_cache[q] = thumb

                if not thumb:
                    continue

                # Gentle rate-limit to avoid getting blocked.
                time.sleep(0.15)
                b = _download_bytes(thumb)
                if b:
                    return b

            return None

        # Strategy
        # - Always create DB rows first
        # - If defer_images: enqueue ImageTask entries and download after commit
        # - Else: download concurrently now and save before leaving atomic
        download_futures: list[tuple[concurrent.futures.Future, object, str, str]] = []
        deferred_tasks: list[ImageTask] = []

        executor: concurrent.futures.ThreadPoolExecutor | None = None
        if download_images and not defer_images:
            executor = concurrent.futures.ThreadPoolExecutor(max_workers=int(image_workers))

        # Amazon.eg/Jumia-like browse distribution in Egypt.
        # Heavier Grocery + Electronics, moderate Home & Kitchen, then Appliances, then Fashion.
        category_weights_by_name: dict[str, int] = {
            'Grocery': 32,
            'Electronics': 26,
            'Home & Kitchen': 20,
            'Appliances': 14,
            'Fashion': 8,
        }

        category_weights = [int(category_weights_by_name.get(getattr(c, 'category_name', ''), 10)) for c in categories]

        category_count: dict[str, int] = {}

        for idx in range(count):
            cat = _choice_weighted_objs(categories, category_weights)
            seller = random.choice(sellers)

            product_seq = idx + 1

            cat_name = getattr(cat, 'category_name', 'Electronics')
            tpl = templates.get(cat_name, templates['Electronics'])

            brand = random.choice(tpl.get('brands', [''])).strip()
            items_list = tpl.get('items', [{'noun': 'Product', 'image_keyword': 'egypt-product', 'price_range': (100.0, 500.0), 'weight': 1}])
            item_weights = [int((i or {}).get('weight') or 1) for i in items_list]
            item_spec = _choice_weighted_objs(items_list, item_weights)
            noun = str(item_spec.get('noun') or 'Product').strip()
            image_keyword = str(item_spec.get('image_keyword') or _slugify(noun)).strip()
            low0, high0 = item_spec.get('price_range') or (100.0, 500.0)

            # Use simple Egypt-market model naming; avoid overly fictional terms.
            model = f"{random.choice(['2024', '2025', 'Pro', 'Plus'])}-{_rand_digits(2)}"

            title_parts = [p for p in [brand, noun, model] if p]
            name = ' '.join(title_parts)

            category_count[cat_name] = int(category_count.get(cat_name, 0)) + 1

            features = random.sample(tpl['feature_pool'], k=min(3, len(tpl['feature_pool'])))
            bullets = '\n'.join([f"• {f}" for f in features])
            desc = f"{fake.paragraph(nb_sentences=3)}\n\nKey Features:\n{bullets}"

            product = Product.objects.create(
                seller=seller,
                category=cat,
                name=name,
                description=desc,
                is_published=True,
            )

            # Log mapping to keep image/name synchronization visible.
            kw_list = _keywords_for_egypt(category_name=cat_name, product_name=name)
            self.stdout.write(f"Seeding category={cat_name} | product='{name}' | image_keywords={kw_list}")

            # Mandated: contextual category images using loremflickr (downloaded into ImageFields).
            # We do not store remote URLs in ImageFields.
            if download_images:
                provider = image_provider.strip().lower()
                url: str | None = None
                basename = f"{run_tag}-{name}-{cat_name}" if run_tag else f"{name}-{cat_name}"
                query_text = f"{name} {cat_name} product photo".strip()

                # Build a keyword string that stays in English for better results.
                keyword = random.choice(kw_list) if kw_list else cat_name
                keyword_csv = ','.join([_clean_query_terms(k).replace(' ', '-') for k in kw_list if k])
                keyword_csv = keyword_csv or _slugify(keyword)

                if provider == 'synthetic':
                    try:
                        synth = _synthetic_image_bytes(title=name, subtitle=cat_name, seed_text=basename)
                        _save_image_to_field(product.product_image, bytes_data=synth, basename=basename)
                        product.save(update_fields=['product_image'])
                    except Exception:
                        pass
                elif provider == 'loremflickr':
                    # Avoid DB ID dependency for deterministic prefetch.
                    url = _loremflickr_url(
                        category_keyword=keyword_csv,
                        lock_text=f"product:{product_seq}:{int(getattr(seller, 'id', 0) or 0)}:{name}",
                    )
                elif provider == 'wikimedia':
                    q1 = _wikimedia_query_for(
                        category_name=cat_name,
                        noun=noun,
                        image_query=tpl.get('image_query', ''),
                        variant_terms='',
                    )
                    candidates = [
                        q1,
                        _clean_query_terms(f"{noun} {cat_name} filetype:bitmap"),
                        _clean_query_terms(f"{noun} filetype:bitmap"),
                        _clean_query_terms(f"{cat_name} product photo filetype:bitmap"),
                    ]
                    if defer_images:
                        deferred_tasks.append(ImageTask(model=Product, pk=int(product.pk), field_name='product_image', basename=basename, query_text=query_text, wikimedia_queries=candidates))
                    else:
                        # Keep Wikimedia sequential; it has extra rate-limit logic.
                        b = get_real_image_bytes(queries=candidates)
                        if b:
                            _save_image_to_field(product.product_image, bytes_data=b, basename=basename)
                            product.save(update_fields=['product_image'])
                else:
                    url = _image_url_for_name(name=keyword, extra=str(tpl.get('image_query') or ''), provider=provider)

                if url:
                    if defer_images:
                        deferred_tasks.append(ImageTask(model=Product, pk=int(product.pk), field_name='product_image', basename=basename, query_text=query_text, url=url))
                    elif executor:
                        fut = executor.submit(_download_with_retries, url, retries=image_retries)
                        download_futures.append((fut, product, 'product_image', basename))
            created_products.append(product)

            variations = variations_by_cat.get(cat.id, [])
            random.shuffle(variations)
            chosen_vars = variations[: random.choice([1, 2])] if variations else []

            target_skus = items_per_product[idx]
            combos: list[list] = []

            if chosen_vars:
                option_lists = [options_by_var.get(v.id, [])[:] for v in chosen_vars]
                tries = 0
                seen = set()
                while len(combos) < target_skus and tries < 200:
                    tries += 1
                    pick = [random.choice(lst) for lst in option_lists if lst]
                    key = tuple(sorted((o.variation_id, o.value) for o in pick))
                    if not key or key in seen:
                        continue
                    seen.add(key)
                    combos.append(pick)
            else:
                combos = [[] for _ in range(target_skus)]

            base_low, base_high = float(low0), float(high0)
            base_price = random.uniform(base_low, base_high)

            for cidx, opts in enumerate(combos):
                # Qty seeded later with explicit 10% out-of-stock rule.
                qty = random.randint(25, 250)

                adjust = 0.0
                multiplier = 1.0
                for o in opts:
                    vname = getattr(o.variation, 'name', '')
                    val = getattr(o, 'value', '')
                    if vname == 'Storage':
                        # Egyptian market: storage bumps are significant.
                        adjust += 3500 if '256' in val else 0
                    if vname == 'Format' and 'Hardcover' in val:
                        adjust += 10
                    if vname == 'Size' and val == 'XL':
                        adjust += 35
                    if vname == 'Size' and val == 'XXL':
                        adjust += 55
                    if vname == 'Capacity':
                        adjust += 4500 if '3' in val else 2500 if '2.25' in val else 0
                    if vname == 'Size':
                        # Grocery & home sizing influences
                        if val == '500g':
                            multiplier *= 0.65
                        elif val == '1kg':
                            multiplier *= 1.0
                        elif val == '5kg':
                            multiplier *= 4.6
                    if vname == 'Pack':
                        if val == 'Pack of 3':
                            multiplier *= 2.85
                        elif val == 'Pack of 6':
                            multiplier *= 5.4

                raw_price = (base_price * multiplier) + adjust + random.uniform(-10.0, 60.0)
                raw_price = max(20.0, float(raw_price))
                price = _money(raw_price)

                cat_code = ''.join([w[0] for w in cat_name.split() if w]).upper()[:3] or 'PRD'
                seller_code = f"S{int(getattr(seller, 'id', 0) or 0):04d}"
                # Do not depend on product.id; use deterministic sequence + randomness.
                sku = f"AMZ-{cat_code}-{seller_code}-{product_seq:05d}-{cidx + 1:02d}-{_rand_digits(4)}"
                while sku in used_skus:
                    sku = f"AMZ-{cat_code}-{seller_code}-{product_seq:05d}-{cidx + 1:02d}-{_rand_digits(4)}"
                used_skus.add(sku)

                # Seed a distinct image per variation combination ("variant image").
                # We don't have an image field on VariationOption, so we derive SKU image
                # from the option values (e.g., Color:Red Size:XL) to keep it deterministic.
                opts_label = ' '.join(
                    [
                        f"{getattr(getattr(o, 'variation', None), 'name', '').strip()}:{getattr(o, 'value', '').strip()}"
                        for o in (opts or [])
                    ]
                ).strip()
                item = ProductItem.objects.create(
                    product=product,
                    sku=sku,
                    qty_in_stock=qty,
                    price=price,
                )

                # Decide whether this SKU gets its own image.
                color_value = None
                for o in (opts or []):
                    try:
                        if getattr(getattr(o, 'variation', None), 'name', '') == 'Color':
                            color_value = str(getattr(o, 'value', '')).strip()
                            break
                    except Exception:
                        continue

                wants_color_only = bool(download_color_item_images) and not bool(download_item_images)
                cat_ok = True
                if wants_color_only and color_image_categories is not None:
                    cat_ok = (cat_name or '').strip().lower() in color_image_categories

                should_download_item_image = bool(download_item_images) or (wants_color_only and bool(color_value) and cat_ok)

                if download_images and not should_download_item_image:
                    # Visual consistency: share main product image.
                    if defer_images:
                        deferred_tasks.append(
                            ImageTask(
                                model=ProductItem,
                                pk=int(item.pk),
                                field_name='product_image',
                                basename=f"copy-{sku}",
                                query_text=f"{name} {cat_name} product photo".strip(),
                                copy_from_model=Product,
                                copy_from_pk=int(product.pk),
                                copy_from_field_name='product_image',
                            )
                        )
                    else:
                        try:
                            item.product_image = product.product_image
                            item.save(update_fields=['product_image'])
                        except Exception:
                            pass

                if download_images and should_download_item_image:
                    provider = image_provider.strip().lower()
                    base2 = f"{sku}-{name}-{opts_label}".strip()
                    basename2 = f"{run_tag}-{base2}" if run_tag else base2
                    query_text2 = f"{name} {opts_label} {cat_name} product photo".strip()
                    url2: str | None = None

                    # If this is a color-specific image, include it in the query.
                    color_slug = _slugify(color_value) if color_value else ''
                    item_keyword_csv = keyword_csv
                    item_keyword_text = (kw_list[0] if kw_list else cat_name)
                    if color_slug:
                        item_keyword_csv = f"{keyword_csv},{color_slug}"
                        item_keyword_text = f"{item_keyword_text} {color_value}".strip()

                    if provider == 'synthetic':
                        try:
                            synth2 = _synthetic_image_bytes(title=name, subtitle=opts_label or cat_name, seed_text=basename2)
                            _save_image_to_field(item.product_image, bytes_data=synth2, basename=basename2)
                            item.save(update_fields=['product_image'])
                        except Exception:
                            pass
                    elif provider == 'loremflickr':
                        url2 = _loremflickr_url(
                            category_keyword=item_keyword_csv,
                            lock_text=f"item:{sku}:{opts_label}",
                        )
                    elif provider == 'wikimedia':
                        vq = _wikimedia_query_for(
                            category_name=cat_name,
                            noun=noun,
                            image_query=tpl.get('image_query', ''),
                            variant_terms=opts_label,
                        )
                        v_candidates = [
                            vq,
                            _clean_query_terms(f"{noun} {opts_label} filetype:bitmap"),
                            _clean_query_terms(f"{noun} {cat_name} filetype:bitmap"),
                        ]
                        if defer_images:
                            deferred_tasks.append(ImageTask(model=ProductItem, pk=int(item.pk), field_name='product_image', basename=basename2, query_text=query_text2, wikimedia_queries=v_candidates))
                        else:
                            b2 = get_real_image_bytes(queries=v_candidates)
                            if b2:
                                _save_image_to_field(item.product_image, bytes_data=b2, basename=basename2)
                                item.save(update_fields=['product_image'])
                    else:
                        url2 = _image_url_for_name(name=item_keyword_text, extra=f"{tpl.get('image_query','')} {opts_label} {sku}", provider=provider)

                    if url2:
                        if defer_images:
                            deferred_tasks.append(ImageTask(model=ProductItem, pk=int(item.pk), field_name='product_image', basename=basename2, query_text=query_text2, url=url2))
                        elif executor:
                            fut2 = executor.submit(_download_with_retries, url2, retries=image_retries)
                            download_futures.append((fut2, item, 'product_image', basename2))
                created_items.append(item)

                if opts:
                    ProductConfiguration.objects.bulk_create([
                        ProductConfiguration(product_item=item, variation_option=o) for o in opts
                    ])

        # Finalize concurrent downloads in the main thread.
        if download_futures:
            self.stdout.write(self.style.NOTICE(f'Downloading and saving {len(download_futures)} images...'))
            saved = 0
            failed = 0
            for fut, obj, field_name, basename in download_futures:
                b = None
                try:
                    b = fut.result()
                except Exception:
                    b = None

                if b:
                    field_file = getattr(obj, field_name)
                    _save_image_to_field(field_file, bytes_data=b, basename=basename)
                    obj.save(update_fields=[field_name])
                    saved += 1
                else:
                    failed += 1
            self.stdout.write(self.style.NOTICE(f'Images saved: {saved}; failed: {failed}'))

        if executor:
            executor.shutdown(wait=True, cancel_futures=False)

        if defer_images and deferred_tasks:
            # Stash tasks on the command instance; handle() registers on_commit.
            setattr(self, '_deferred_image_tasks', deferred_tasks)

        if category_count:
            parts = ', '.join([f"{k}={v}" for k, v in sorted(category_count.items(), key=lambda kv: (-kv[1], kv[0]))])
            self.stdout.write(self.style.NOTICE(f'Category distribution (products): {parts}'))

        self.stdout.write(self.style.SUCCESS(f'Created {len(created_products)} products and {len(created_items)} SKUs.'))

        # Mandated: set qty_in_stock = 0 for 10% of ProductItems to test OOS states.
        if created_items:
            oos_count = max(1, int(round(len(created_items) * 0.10)))
            oos_items = random.sample(created_items, k=min(oos_count, len(created_items)))
            for it in oos_items:
                it.qty_in_stock = 0
            ProductItem.objects.bulk_update(oos_items, ['qty_in_stock'])
            self.stdout.write(self.style.NOTICE(f'Set {len(oos_items)} items to out-of-stock (qty_in_stock=0).'))

        return created_products, created_items

    def _create_sample_carts(self, *, customers, items, ShoppingCart, ShoppingCartItem, carts_target: int):
        self.stdout.write(f'Creating {carts_target} sample carts...')
        chosen_customers = random.sample(customers, k=min(carts_target, len(customers)))
        for user in chosen_customers:
            cart, _ = ShoppingCart.objects.get_or_create(user=user, defaults={'session_id': None})
            ShoppingCartItem.objects.filter(cart=cart).delete()

            cart_items = random.sample(items, k=min(random.randint(1, 5), len(items)))
            for it in cart_items:
                ShoppingCartItem.objects.create(cart=cart, product_item=it, qty=random.randint(1, 3))

    def _create_orders(
        self,
        *,
        fake,
        customers,
        items,
        statuses,
        pay_status_pending,
        pay_status_success,
        ShopOrder,
        OrderLine,
        Transaction,
        count: int,
    ):
        self.stdout.write(f'Creating {count} orders + transactions...')
        if count <= 0:
            return

        in_stock = [it for it in items if int(getattr(it, 'qty_in_stock', 0) or 0) > 0]
        pool = in_stock if len(in_stock) >= 20 else items

        pending = next((s for s in statuses if s.status == 'Pending'), statuses[0])
        shipped = next((s for s in statuses if s.status == 'Shipped'), statuses[0])
        delivered = next((s for s in statuses if s.status == 'Delivered'), statuses[0])
        cancelled = next((s for s in statuses if s.status == 'Cancelled'), statuses[0])

        for _ in range(count):
            user = random.choice(customers)

            ua = getattr(user, 'user_addresses', None)
            address_link = ua.filter(is_default=True).select_related('address').first() if ua else None
            if not address_link and ua:
                address_link = ua.select_related('address').first()
            shipping_address = address_link.address if address_link else None

            pm_qs = getattr(user, 'payment_methods', None)
            payment_method = pm_qs.filter(is_default=True).first() if pm_qs else None
            if not payment_method and pm_qs:
                payment_method = pm_qs.first()

            status_name = _choice_weighted(['Pending', 'Shipped', 'Delivered', 'Cancelled'], [6, 5, 4, 2])
            if status_name == 'Pending':
                order_status = pending
            elif status_name == 'Shipped':
                order_status = shipped
            elif status_name == 'Delivered':
                order_status = delivered
            else:
                order_status = cancelled

            chosen = random.sample(pool, k=min(random.randint(1, 4), len(pool)))
            lines = []
            total = Decimal('0.00')
            for it in chosen:
                qty = random.randint(1, 3)
                price = Decimal(str(getattr(it, 'price', 0) or 0)).quantize(Decimal('0.01'))
                lines.append((it, qty, price))
                total += price * qty

            order = ShopOrder.objects.create(
                user=user,
                payment_method=payment_method,
                shipping_address=shipping_address,
                order_total=total,
                order_status=order_status,
            )

            for it, qty, price in lines:
                OrderLine.objects.create(order=order, product_item=it, qty=qty, price=price)

            if order_status.status in {'Shipped', 'Delivered'}:
                order.shipping_carrier = random.choice(['DHL', 'Aramex', 'FedEx', 'UPS'])
                order.tracking_number = f"TRK-{_rand_digits(10)}"
                order.shipped_at = timezone.now() - timezone.timedelta(days=random.randint(0, 7))
                if order_status.status == 'Delivered':
                    order.delivered_at = order.shipped_at + timezone.timedelta(days=random.randint(1, 6))
                order.save(update_fields=['shipping_carrier', 'tracking_number', 'shipped_at', 'delivered_at'])

            # Respect signals: ShopOrder post_save created Transaction(Pending) already.
            tx = Transaction.objects.filter(order=order).select_related('payment_status').first()
            if tx:
                tx.amount = order.order_total
                # Keep Success only for Delivered to align with stock + invoice signals.
                tx.payment_status = pay_status_success if order_status.status == 'Delivered' else pay_status_pending
                tx.save(update_fields=['payment_status', 'amount'])

        self.stdout.write(self.style.SUCCESS('Orders created.'))

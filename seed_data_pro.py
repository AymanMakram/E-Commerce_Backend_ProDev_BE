import os
import django
import sys
import random
from pathlib import Path

# 1. إعداد المسارات للويندوز
BASE_DIR = Path(__file__).resolve().parent
sys.path.append(str(BASE_DIR))

# استبدل 'your_project_name' باسم مجلد مشروعك الأساسي
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.contrib.auth import get_user_model
from products.models import ProductCategory, Product, Variation, VariationOption, ProductItem, ProductConfiguration

User = get_user_model()

def seed_data():
    print("🚀 Starting Massive Seeding...")

    # --- 1. إنشاء بائعين (5 بائعين) ---
    sellers = []
    for i in range(1, 6):
        user, created = User.objects.get_or_create(
            username=f'seller_{i}',
            defaults={'email': f'seller{i}@test.com', 'user_type': 'seller'}
        )
        if created: user.set_password('123'); user.save()
        sellers.append(user)
    print(f"✅ Created {len(sellers)} Sellers.")

    # --- 2. إنشاء أقسام (5 أقسام) ---
    categories_names = ['Electronics', 'Fashion', 'Home & Garden', 'Sports', 'Beauty']
    categories = []
    for name in categories_names:
        cat, _ = ProductCategory.objects.get_or_create(category_name=name)
        categories.append(cat)
    print(f"✅ Created {len(categories)} Categories.")

    # --- 3. إنشاء الاختلافات (Variations) لكل قسم ---
    # سننشئ اللون والمقاس لكل قسم لضمان وجود خيارات
    for cat in categories:
        color_var, _ = Variation.objects.get_or_create(name="Color", category=cat)
        size_var, _ = Variation.objects.get_or_create(name="Size", category=cat)
        
        # خيارات الألوان
        for c in ['Red', 'Blue', 'Black', 'Green', 'White']:
            VariationOption.objects.get_or_create(variation=color_var, value=c)
        # خيارات المقاسات
        for s in ['S', 'M', 'L', 'XL']:
            VariationOption.objects.get_or_create(variation=size_var, value=s)

    # --- 4. إنشاء منتجات (10 منتجات لكل قسم) ---
    product_names = ["Pro", "Ultra", "Max", "Classic", "Modern", "Essential", "Premium", "Elite", "Basic", "Advanced"]
    
    for cat in categories:
        for i in range(10):
            p_name = f"{cat.category_name} {product_names[i]}"
            product, _ = Product.objects.get_or_create(
                name=p_name,
                category=cat,
                seller=random.choice(sellers),
                defaults={'description': f'This is a high quality {p_name} from our {cat.category_name} collection.'}
            )

            # --- 5. إنشاء قطع (ProductItems) لكل منتج (3 قطع لكل منتج) ---
            # كل قطعة تمثل مزيجاً من لون ومقاس
            options = VariationOption.objects.filter(variation__category=cat)
            colors = options.filter(variation__name="Color")
            sizes = options.filter(variation__name="Size")

            for j in range(3):
                sku_code = f"{p_name[:3].upper()}-{random.randint(1000, 9999)}-{j}"
                item, created = ProductItem.objects.get_or_create(
                    product=product,
                    sku=sku_code,
                    defaults={
                        'price': random.randint(100, 2000),
                        'qty_in_stock': random.randint(10, 100)
                    }
                )
                
                # ربط القطعة بلون ومقاس عشوائيين من خيارات القسم
                if colors.exists() and sizes.exists():
                    ProductConfiguration.objects.get_or_create(product_item=item, variation_option=random.choice(colors))
                    ProductConfiguration.objects.get_or_create(product_item=item, variation_option=random.choice(sizes))

    print(f"🎉 Success! Database is now populated with ~50 products and ~150 product items.")
    print("💡 You can now test search, filtering by category, and adding to cart.")

if __name__ == '__main__':
    seed_data()
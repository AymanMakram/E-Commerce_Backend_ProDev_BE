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
from products.models import ProductItem
from cart.models import ShoppingCart, ShoppingCartItem

User = get_user_model()

def seed_customers():
    print("👥 Starting Customer & Cart Seeding...")

    # جلب جميع قطع المنتجات المتاحة في قاعدة البيانات
    all_items = list(ProductItem.objects.all())
    
    if not all_items:
        print("❌ لا يوجد منتجات في قاعدة البيانات! شغل سكريبت المنتجات الأول.")
        return

    for i in range(1, 11):
        username = f'customer_{i}'
        # 1. إنشاء مستخدم من نوع زبون
        customer, created = User.objects.get_or_create(
            username=username,
            defaults={
                'email': f'customer{i}@example.com',
                'user_type': 'customer' # تأكد أن هذا النوع موجود في الـ Choice بموديل المستخدم
            }
        )
        if created:
            customer.set_password('123')
            customer.save()

        # 2. إنشاء سلة للزبون (تلقائياً من خلال العلاقة OneToOne)
        cart, _ = ShoppingCart.objects.get_or_create(user=customer)

        # 3. إضافة من 2 لـ 5 منتجات عشوائية في سلة كل زبون
        num_items_in_cart = random.randint(2, 5)
        selected_items = random.sample(all_items, num_items_in_cart)

        for item in selected_items:
            ShoppingCartItem.objects.get_or_create(
                cart=cart,
                product_item=item,
                defaults={'qty': random.randint(1, 3)}
            )

        print(f"✅ Created {username} with {num_items_in_cart} items in cart.")

    print(f"\n🎉 Done! Created 10 customers with populated carts.")
    print("💡 Password for all customers is: 123")

if __name__ == '__main__':
    seed_customers()
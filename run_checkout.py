import os
import django
import sys
from pathlib import Path

# 1. إعدادات البيئة
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings') # استبدل your_project_name باسم مشروعك
django.setup()

from cart.models import ShoppingCart
from orders.models import ShopOrder, OrderLine, OrderStatus
from accounts.models import UserAddress, UserPaymentMethod

def run_final_checkout():
    # 2. التأكد من وجود حالة "Pending" للطلبات الجديدة
    status_pending, _ = OrderStatus.objects.get_or_create(status='Pending')
    
    # 3. استهداف العملاء من 1 لـ 10 فقط
    for i in range(1, 11):
        username = f'customer_{i}'
        try:
            # جلب السلة الخاصة بالمستخدم
            cart = ShoppingCart.objects.get(user__username=username)
            cart_items = cart.items.all()
            
            if not cart_items.exists():
                print(f"ℹ️ {username}: السلة فارغة، تم التخطي.")
                continue

            # 4. جلب العنوان الافتراضي للمستخدم
            user_addr_entry = UserAddress.objects.filter(user=cart.user, is_default=True).first()
            if not user_addr_entry:
                print(f"⚠️ {username}: لا يوجد عنوان افتراضي، تم التخطي.")
                continue
            
            # 5. جلب وسيلة الدفع الافتراضية للمستخدم
            payment_method = UserPaymentMethod.objects.filter(user=cart.user, is_default=True).first()
            if not payment_method:
                print(f"⚠️ {username}: لا توجد وسيلة دفع، تم التخطي.")
                continue

            # 6. إنشاء الطلب الرئيسي (ShopOrder)
            # ملاحظة: تأكد أن موديل ShoppingCart لديه ميثود total_price() أو احسبها يدوياً هنا
            total = sum(item.product_item.price * item.qty for item in cart_items)
            
            order = ShopOrder.objects.create(
                user=cart.user,
                shipping_address=user_addr_entry.address,
                payment_method=payment_method,
                order_total=total,
                order_status=status_pending
            )

            # 7. نقل المنتجات لجدول OrderLine (تقفيل الـ ERD)
            for item in cart_items:
                OrderLine.objects.create(
                    order=order,
                    product_item=item.product_item,
                    qty=item.qty,
                    price=item.product_item.price # تثبيت السعر وقت البيع
                )
            
            # 8. تفريغ السلة (نظافة السيستم)
            cart_items.delete()
            print(f"✅ تم بنجاح: تحويل سلة {username} لطلب رقم #{order.id} بقيمة {total} EGP")

        except ShoppingCart.DoesNotExist:
            print(f"❌ {username}: لا يملك سلة تسوق حالياً.")
        except Exception as e:
            print(f"🚨 خطأ غير متوقع مع {username}: {e}")

if __name__ == '__main__':
    run_final_checkout()
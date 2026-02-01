import os
import django
import random
from datetime import date

# 1. إعدادات البيئة
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings') 
django.setup()

from django.contrib.auth import get_user_model
from accounts.models import PaymentType, UserPaymentMethod

User = get_user_model()

def setup_payments():
    # 2. التأكد من وجود الأنواع الاحترافية
    pro_payment_types = ['Credit Card', 'Debit Card', 'PayPal', 'Apple Pay', 'InstaPay', 'Cash on Delivery']
    for val in pro_payment_types:
        PaymentType.objects.get_or_create(value=val)
    
    all_types = PaymentType.objects.all()
    providers = ['CIB', 'QNB', 'HSBC', 'Bank Misr', 'Fawry', 'Vodafone Cash']

    # 3. تعديل العملاء
    for i in range(1, 11):
        username = f'customer_{i}'
        try:
            user = User.objects.get(username=username)
            selected_type = random.choice(all_types)
            
            # حل مشكلة الـ ValidationError: ننشئ تاريخ حقيقي (سنة، شهر، يوم)
            # هنخلي الانتهاء في سنة 2028 شهر 7 يوم 1
            valid_expiry = date(2028, random.randint(1, 12), 1)

            account_display = f'**** **** **** {random.randint(1111, 9999)}'
            provider_name = 'Hand to Hand' if selected_type.value == 'Cash on Delivery' else random.choice(providers)

            # 4. تحديث أو إنشاء وسيلة الدفع
            UserPaymentMethod.objects.update_or_create(
                user=user,
                payment_type=selected_type,
                defaults={
                    'provider': provider_name,
                    'account_number': account_display,
                    'expiry_date': valid_expiry, # بعتنا تاريخ حقيقي YYYY-MM-DD
                    'is_default': True
                }
            )
            
            print(f"✅ تم إصلاح وربط {username} بـ {selected_type.value}")
            
        except User.DoesNotExist:
            print(f"❌ {username} مش موجود")

if __name__ == '__main__':
    setup_payments()
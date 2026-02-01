import os
import django
import random

# 1. إعدادات البيئة
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings') # استبدل your_project_name باسم مجلد مشروعك
django.setup()

from django.contrib.auth import get_user_model
from accounts.models import Address, UserAddress, Country

User = get_user_model()

def fix_specific_data():
    # 2. التأكد من وجود دولة مصر
    egypt, _ = Country.objects.get_or_create(country_name='Egypt')
    
    cities = ['Cairo', 'Giza', 'Alexandria', 'Mansoura', 'Tanta']
    streets = ['9th St', 'El-Bahr St', 'Nasr City', 'Tahrir Square']

    # 3. حلقة تكرار تبحث عن العملاء من 1 إلى 10 بالاسم
    for i in range(1, 11):
        username = f'customer_{i}'
        try:
            user = User.objects.get(username=username)
            
            # إنشاء العنوان وربطه بمصر
            addr = Address.objects.create(
                unit_number=str(random.randint(1, 100)),
                street_number=str(random.randint(10, 500)),
                address_line1=random.choice(streets),
                city=random.choice(cities),
                region='Middle East',
                postal_code=str(random.randint(10000, 99999)),
                country=egypt
            )
            
            # ربط العنوان بالمستخدم في الجدول الوسيط
            UserAddress.objects.get_or_create(
                user=user,
                address=addr,
                defaults={'is_default': True} 
            )

            # إضافة رقم التليفون (بافتراض وجود الحقل في موديل User)
            if hasattr(user, 'phone_number'):
                user.phone_number = f"010{random.randint(10000000, 99999999)}"
                user.save()

            print(f"✅ تم بنجاح: {username} أصبح لديه عنوان في {addr.city}, Egypt")
            
        except User.DoesNotExist:
            print(f"❌ خطأ: المستخدم {username} غير موجود في قاعدة البيانات، تأكد من السبيلينج.")

if __name__ == '__main__':
    fix_specific_data()
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from finance.models import PaymentStatus

def setup():
    # الحالات الاحترافية لأي بوابة دفع
    statuses = [
        'Pending',      # لسه العميل مدفعش أو العملية تحت المراجعة
        'Success',      # الدفع تم بنجاح والمبلغ وصل
        'Failed',       # الفيزا اترفضت أو حصل مشكلة
        'Refunded',     # العميل رجع المنتج والفلوس اتردت له
        'Cancelled'     # الطلب اتلغى قبل ما الدفع يكمل
    ]
    
    for status_name in statuses:
        obj, created = PaymentStatus.objects.get_or_create(status=status_name)
        if created:
            print(f"✅ تم إضافة حالة: {status_name}")
        else:
            print(f"ℹ️ الحالة موجودة مسبقاً: {status_name}")

if __name__ == '__main__':
    setup()
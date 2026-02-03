import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from accounts.models import PaymentType
from finance.models import PaymentStatus

def setup_amazon_like_payment_types():
    # Amazon-like payment types
    types = [
        'Credit Card',
        'Debit Card',
        'PayPal',
        'Apple Pay',
        'Google Pay',
        'Amazon Pay',
        'Gift Card',
        'Cash on Delivery',
        'Bank Transfer',
        'EMI',
    ]
    for t in types:
        obj, created = PaymentType.objects.get_or_create(value=t)
        if created:
            print(f"✅ Added Payment Type: {t}")
        else:
            print(f"ℹ️ Payment Type already exists: {t}")

def setup_amazon_like_payment_statuses():
    # Amazon-like payment statuses
    statuses = [
        'Pending',
        'Authorized',
        'Processing',
        'Success',
        'Failed',
        'Refunded',
        'Cancelled',
        'Chargeback',
        'Partially Refunded',
        'Awaiting Payment',
    ]
    for s in statuses:
        obj, created = PaymentStatus.objects.get_or_create(status=s)
        if created:
            print(f"✅ Added Payment Status: {s}")
        else:
            print(f"ℹ️ Payment Status already exists: {s}")

if __name__ == '__main__':
    setup_amazon_like_payment_types()
    setup_amazon_like_payment_statuses()

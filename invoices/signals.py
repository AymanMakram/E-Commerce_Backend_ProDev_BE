"""Signals for invoice generation and updates."""

import uuid
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Invoice
from finance.models import Transaction

@receiver(post_save, sender=Transaction)
def create_invoice_on_payment_success(sender, instance, **kwargs):
    """Create an invoice when a transaction is marked successful.

    Uses a simple uniqueness guard (order has no existing invoice).
    """

    # 1. الوصول لكلمة الحالة من خلال الجدول المرتبط (payment_status)
    # بنستخدم .status لأن ده اسم الحقل جوه موديل PaymentStatus
    if instance.payment_status.status == 'Success':
        order = instance.order
        
        # 2. التأكد إن مفيش فاتورة اتعملت للأوردر ده قبل كدة
        if not hasattr(order, 'invoice'):
            # توليد رقم فاتورة مميز
            new_invoice_no = f"INV-{order.id}-{uuid.uuid4().hex[:4].upper()}"
            
            Invoice.objects.create(
                order=order,
                invoice_number=new_invoice_no
            )
            print(f"✅ تم إنشاء الفاتورة {new_invoice_no} بنجاح!")
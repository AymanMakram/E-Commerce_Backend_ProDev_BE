"""Signals for order side-effects (e.g., transaction creation)."""

from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import ShopOrder
from finance.models import Transaction, PaymentStatus

@receiver(post_save, sender=ShopOrder)
def create_order_transaction(sender, instance, created, **kwargs):
    """Create a pending finance transaction for newly created orders."""
    if created:
        # بنجيب حالة "Pending" أو أول حالة دفع موجودة
        status, _ = PaymentStatus.objects.get_or_create(status="Pending")
        
        # إنشاء المعاملة المالية أوتوماتيكياً
        Transaction.objects.create(
            order=instance,
            amount=instance.order_total,
            payment_status=status
        )
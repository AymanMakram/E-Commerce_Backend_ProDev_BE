"""Signals for order side-effects (e.g., transaction creation)."""

from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import ShopOrder
from finance.models import Transaction, PaymentStatus


def _desired_payment_status_name_for_order(order: ShopOrder) -> str:
    """Derive payment status from order status.

    This project uses server-rendered order pages and seller dashboards that
    display payment state. To avoid the UI guessing, we keep a Transaction row
    synced to the order lifecycle.

    Status mapping rules (case-insensitive, supports Arabic keywords):
    - Delivered / Completed -> Success
    - Cancelled/Canceled -> Cancelled
    - Returned/Refunded -> Refunded
    - Otherwise -> Pending
    """

    label = str(getattr(getattr(order, 'order_status', None), 'status', '') or '').strip().lower()
    if not label:
        return 'Pending'

    cancelled_markers = {'cancelled', 'canceled', 'cancel', 'ملغي', 'ملغى', 'إلغاء', 'الغاء'}
    refunded_markers = {'refunded', 'refund', 'returned', 'return', 'مرتجع', 'مرتجعات', 'استرجاع', 'ارجاع', 'إرجاع'}
    success_markers = {'delivered', 'deliver', 'completed', 'complete', 'success', 'تم التسليم', 'تم التوصيل'}

    if any(m in label for m in cancelled_markers):
        return 'Cancelled'
    if any(m in label for m in refunded_markers):
        return 'Refunded'
    if any(m in label for m in success_markers):
        return 'Success'
    return 'Pending'

@receiver(post_save, sender=ShopOrder)
def create_order_transaction(sender, instance, created, **kwargs):
    """Create a finance transaction for newly created orders."""
    if created:
        desired = _desired_payment_status_name_for_order(instance)
        status, _ = PaymentStatus.objects.get_or_create(status=desired)
        
        # إنشاء المعاملة المالية أوتوماتيكياً
        Transaction.objects.create(
            order=instance,
            amount=instance.order_total,
            payment_status=status
        )


@receiver(post_save, sender=ShopOrder)
def sync_order_transaction_payment_status(sender, instance, created, **kwargs):
    """Keep Transaction.payment_status synced to the order lifecycle."""

    desired = _desired_payment_status_name_for_order(instance)
    desired_status, _ = PaymentStatus.objects.get_or_create(status=desired)

    tx = Transaction.objects.filter(order=instance).select_related('payment_status').first()
    if not tx:
        return

    if tx.payment_status_id != desired_status.id:
        tx.payment_status = desired_status
        tx.save(update_fields=['payment_status'])
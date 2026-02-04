"""Signals for finance side-effects (e.g., stock adjustments)."""

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.db import transaction
from .models import Transaction

# 1. حفظ الحالة القديمة للمقارنة (مهم جداً لمنع التكرار)
@receiver(pre_save, sender=Transaction)
def capture_old_data(sender, instance, **kwargs):
    """Capture previous payment/order status to make post-save actions idempotent."""
    try:
        if instance.pk:
            old_obj = Transaction.objects.get(pk=instance.pk)
            # بنحفظ حالة الدفع القديمة وحالة الأوردر القديمة
            instance._old_pay_status = old_obj.payment_status.status if old_obj.payment_status else None
            instance._old_order_status = old_obj.order.order_status.status if old_obj.order.order_status else None
        else:
            instance._old_pay_status = None
            instance._old_order_status = None
    except Transaction.DoesNotExist:
        instance._old_pay_status = None
        instance._old_order_status = None

# 2. تنفيذ الخصم أو الإرجاع بناءً على الشرط المزدوج
@receiver(post_save, sender=Transaction)
def handle_stock_double_check(sender, instance, **kwargs):
    """Adjust inventory exactly once when payment+delivery conditions change.

    Decrements stock when a transaction becomes (Success + Delivered), and restores stock
    if it transitions away from that fully-confirmed state.
    """

    order = instance.order
    # الحالات الجديدة بعد الحفظ
    new_pay_status = instance.payment_status.status if instance.payment_status else None
    new_order_status = order.order_status.status if order.order_status else None
    
    # الحالات القديمة قبل الحفظ
    old_pay_status = getattr(instance, '_old_pay_status', None)
    old_order_status = getattr(instance, '_old_order_status', None)

    # التحقق: هل العملية الآن (نجاح + تم التوصيل)؟
    is_fully_confirmed = (new_pay_status == 'Success' and new_order_status == 'Delivered')
    # التحقق: هل كانت العملية (نجاح + تم التوصيل) وتغيرت؟
    was_fully_confirmed = (old_pay_status == 'Success' and old_order_status == 'Delivered')

    # لو مفيش تغيير في الحالة النهائية، اخرج
    if is_fully_confirmed == was_fully_confirmed:
        return

    from orders.models import OrderLine
    order_items = OrderLine.objects.filter(order=order)

    with transaction.atomic():
        for item in order_items:
            product_item = item.product_item
            existing_fields = [f.name for f in product_item._meta.fields]
            target_field = next((f for f in ['qty_in_stock', 'stock', 'quantity', 'stock_quantity'] if f in existing_fields), None)
            
            if not target_field: continue
            current_stock = getattr(product_item, target_field)

            # الحالة أ: العملية اكتملت الآن (Success + Delivered) -> اخصم
            if is_fully_confirmed:
                if current_stock >= item.qty:
                    setattr(product_item, target_field, current_stock - item.qty)
                    product_item.save()

            # الحالة ب: العملية كانت مكتملة وتم التراجع عنها -> رجع المخزن
            elif was_fully_confirmed and not is_fully_confirmed:
                setattr(product_item, target_field, current_stock + item.qty)
                product_item.save()
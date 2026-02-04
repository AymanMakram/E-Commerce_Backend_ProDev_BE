"""Database models for transactions and payment statuses."""

from django.db import models
from orders.models import ShopOrder

class PaymentStatus(models.Model):
    """Reference model for payment status values (e.g., Pending, Success)."""

    status = models.CharField(max_length=50, unique=True)

    class Meta:
        verbose_name_plural = "Payment Statuses"

    def __str__(self):
        return self.status

class Transaction(models.Model):
    """Payment transaction attached to an order."""

    order = models.OneToOneField(ShopOrder, on_delete=models.CASCADE, related_name='transaction')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    transaction_date = models.DateTimeField(auto_now_add=True)
    payment_status = models.ForeignKey(PaymentStatus, on_delete=models.CASCADE)

    def __str__(self):
        return f"TX for Order #{self.order.id}"
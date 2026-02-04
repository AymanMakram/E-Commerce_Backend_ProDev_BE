"""Database models for orders and order lines."""

from django.db import models
from django.conf import settings
from products.models import ProductItem
from accounts.models import Address, UserPaymentMethod

class OrderStatus(models.Model):
    """Order lifecycle status (e.g., Pending, Shipped, Delivered)."""

    status = models.CharField(max_length=50, unique=True)
    
    class Meta:
        verbose_name_plural = "Order Statuses"

    def __str__(self):
        return self.status

class ShopOrder(models.Model):
    """Represents a customer's order and fulfillment tracking."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    order_date = models.DateTimeField(auto_now_add=True)
    payment_method = models.ForeignKey(UserPaymentMethod, on_delete=models.SET_NULL, null=True)
    shipping_address = models.ForeignKey(Address, on_delete=models.SET_NULL, null=True)
    order_total = models.DecimalField(max_digits=10, decimal_places=2)
    order_status = models.ForeignKey(OrderStatus, on_delete=models.CASCADE)

    shipping_carrier = models.CharField(max_length=100, null=True, blank=True)
    tracking_number = models.CharField(max_length=120, null=True, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Shop Order"
        verbose_name_plural = "Shop Orders"
        indexes = [
            models.Index(fields=['user', 'order_date']),
            models.Index(fields=['order_status', 'order_date']),
            models.Index(fields=['user', 'order_status', 'order_date']),
        ]

    def __str__(self):
        return f"Order #{self.id} - {self.user.username}"

class OrderLine(models.Model):
    """Line item inside an order."""

    product_item = models.ForeignKey(ProductItem, on_delete=models.CASCADE)
    order = models.ForeignKey(ShopOrder, on_delete=models.CASCADE, related_name='lines')
    qty = models.IntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        verbose_name = "Order Item"
        verbose_name_plural = "Order Items"
        indexes = [
            models.Index(fields=['order', 'product_item']),
        ]

    def __str__(self):
        return f"Line for Order #{self.order.id} - {self.product_item}"
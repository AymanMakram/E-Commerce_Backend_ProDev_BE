"""Database models for shopping carts (authenticated and anonymous sessions)."""

from django.db import models
from django.conf import settings
from products.models import ProductItem  # استيراد القطعة من تطبيق المنتجات

class ShoppingCart(models.Model):
    """Shopping cart for an authenticated user or an anonymous session."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='cart', null=True, blank=True)
    session_id = models.CharField(max_length=40, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        if self.user:
            return f"Cart of {self.user.username}"
        return f"Anonymous Cart ({self.session_id})"

    @property
    def total_price(self):
        return sum(item.subtotal for item in self.items.all())

class ShoppingCartItem(models.Model):
    """Line item inside a shopping cart."""

    cart = models.ForeignKey(ShoppingCart, on_delete=models.CASCADE, related_name='items')
    product_item = models.ForeignKey(ProductItem, on_delete=models.CASCADE)
    qty = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f"{self.qty} x {self.product_item.product.name}"

    @property
    def subtotal(self):
        # تأكد أن المسميات هنا تطابق موديل المنتجات عندك (price)
        return self.product_item.price * self.qty
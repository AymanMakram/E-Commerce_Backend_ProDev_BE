from django.db import models
from django.conf import settings
from products.models import ProductItem  # استيراد القطعة من تطبيق المنتجات

class ShoppingCart(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='cart')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Cart of {self.user.username}"

    @property
    def total_price(self):
        return sum(item.subtotal for item in self.items.all())

class ShoppingCartItem(models.Model):
    cart = models.ForeignKey(ShoppingCart, on_delete=models.CASCADE, related_name='items')
    product_item = models.ForeignKey(ProductItem, on_delete=models.CASCADE)
    qty = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f"{self.qty} x {self.product_item.product.name}"

    @property
    def subtotal(self):
        # تأكد أن المسميات هنا تطابق موديل المنتجات عندك (price)
        return self.product_item.price * self.qty
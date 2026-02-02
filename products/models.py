from django.db import models
from django.conf import settings # لاستدعاء موديل المستخدم بأمان

# 1. جداول التصنيفات
class ProductCategory(models.Model):
    parent_category = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subcategories')
    category_name = models.CharField(max_length=255)

    def __str__(self):
        return self.category_name
    class Meta:
        verbose_name_plural = "Product Categories"

# 2. جدول المنتجات الأساسي (تم إضافة حقل الـ seller)
class Product(models.Model):
    # الربط مع البائع - تأكد أن التاجر فقط هو من يظهر في الخيارات
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='products',
        limit_choices_to={'user_type': 'seller'} 
    )
    category = models.ForeignKey(ProductCategory, on_delete=models.CASCADE, related_name='products')
    name = models.CharField(max_length=255)
    description = models.TextField()
    product_image = models.ImageField(upload_to='products/', null=True, blank=True)

    def __str__(self):
        return f"{self.name} (Seller: {self.seller.username})"
    
    class Meta:
        ordering = ['id']

# 3. جداول الاختلافات (Variations)
class Variation(models.Model):
    category = models.ForeignKey(ProductCategory, on_delete=models.CASCADE)
    name = models.CharField(max_length=255)

    def __str__(self):
        return f"{self.name} ({self.category.category_name})"

class VariationOption(models.Model):
    variation = models.ForeignKey(Variation, on_delete=models.CASCADE, related_name='options')
    value = models.CharField(max_length=255)

    def __str__(self):
        return self.value

# 4. تفاصيل المنتج (Price, Stock, SKU)
class ProductItem(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='items')
    sku = models.CharField(max_length=255, unique=True)
    qty_in_stock = models.IntegerField(default=0)
    product_image = models.ImageField(upload_to='product_items/', null=True, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.product.name} - SKU: {self.sku}"

# 5. ربط الاختيارات بالقطع (Configuration)
class ProductConfiguration(models.Model):
    product_item = models.ForeignKey(ProductItem, on_delete=models.CASCADE, related_name='configurations')
    variation_option = models.ForeignKey(VariationOption, on_delete=models.CASCADE)
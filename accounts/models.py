from django.db import models
from django.contrib.auth.models import AbstractUser

# 1. الموديل الأساسي للمستخدم
class User(AbstractUser):
    # تعريف الاختيارات قبل استخدامها لمنع الخطأ
    USER_TYPE_CHOICES = (
        ('customer', 'Customer'),
        ('seller', 'Seller'),
    )
    phone_number = models.CharField(max_length=15, null=True, blank=True)
    user_type = models.CharField(max_length=10, choices=USER_TYPE_CHOICES, default='customer')

    def __str__(self):
        return self.username

# 2. الجداول المساعدة (العناوين والدول)
class Country(models.Model):
    country_name = models.CharField(max_length=100)
    def __str__(self): return self.country_name
    class Meta:
        verbose_name = "Country"
        verbose_name_plural = "Countries"

class Address(models.Model):
    unit_number = models.CharField(max_length=20)
    street_number = models.CharField(max_length=20)
    address_line1 = models.CharField(max_length=255)
    address_line2 = models.CharField(max_length=255, null=True, blank=True)
    city = models.CharField(max_length=100)
    region = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=20)
    country = models.ForeignKey(Country, on_delete=models.CASCADE, related_name='addresses')
    def __str__(self): return f"{self.address_line1}, {self.city}"
    class Meta:
        verbose_name = "Address"
        verbose_name_plural = "Addresses"

class UserAddress(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='user_addresses')
    address = models.ForeignKey(Address, on_delete=models.CASCADE)
    is_default = models.BooleanField(default=False)

# 3. جداول الدفع
class PaymentType(models.Model):
    value = models.CharField(max_length=100)
    def __str__(self): return self.value

class UserPaymentMethod(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payment_methods')
    payment_type = models.ForeignKey(PaymentType, on_delete=models.CASCADE)
    provider = models.CharField(max_length=100)
    account_number = models.CharField(max_length=100)
    expiry_date = models.DateField()
    is_default = models.BooleanField(default=False)
    def __str__(self): return f"{self.provider} - {self.user.username}"

# 4. البروفايلات المتخصصة (إضافة)
class CustomerProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='customer_profile')
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    shipping_address = models.TextField(blank=True, null=True)

class SellerProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='seller_profile')
    store_name = models.CharField(max_length=255, blank=True, null=True)
    tax_number = models.CharField(max_length=50, blank=True, null=True)
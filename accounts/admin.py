from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import (
    User, Country, Address, UserAddress, 
    PaymentType, UserPaymentMethod, 
    CustomerProfile, SellerProfile
)

# 1. منع تكرار التسجيل
if admin.site.is_registered(User):
    admin.site.unregister(User)

# 2. إعدادات الـ Inlines (لعرض البيانات المرتبطة في صفحة المستخدم)
class CustomerProfileInline(admin.StackedInline):
    model = CustomerProfile
    can_delete = False
    verbose_name_plural = 'Customer Profile Info'

class SellerProfileInline(admin.StackedInline):
    model = SellerProfile
    can_delete = False
    verbose_name_plural = 'Seller Profile Info'

class UserAddressInline(admin.TabularInline):
    model = UserAddress
    extra = 1 # يسمح بإضافة عنوان جديد مباشرة من صفحة المستخدم

class UserPaymentMethodInline(admin.TabularInline):
    model = UserPaymentMethod
    extra = 1

# 3. تخصيص لوحة تحكم المستخدم
class CustomUserAdmin(UserAdmin):
    model = User
    list_display = ['username', 'email', 'user_type', 'is_staff', 'phone_number']
    
    fieldsets = UserAdmin.fieldsets + (
        ('Role & Contact', {'fields': ('user_type', 'phone_number')}),
    )

    # هذا الجزء هو المسؤول عن إظهار/إخفاء الحقول بناءً على نوع المستخدم
    def get_inline_instances(self, request, obj=None):
        if not obj:
            return []
        
        inlines = []
        # إذا كان المستخدم بائعاً، أظهر بروفايل البائع فقط
        if obj.user_type == 'seller':
            inlines.append(SellerProfileInline(self.model, self.admin_site))
        # إذا كان زبوناً، أظهر بروفايل الزبون، العناوين، وطرق الدفع
        elif obj.user_type == 'customer':
            inlines.append(CustomerProfileInline(self.model, self.admin_site))
            inlines.append(UserAddressInline(self.model, self.admin_site))
            inlines.append(UserPaymentMethodInline(self.model, self.admin_site))
            
        return inlines

# تأكد من تسجيل الموديل في النهاية
admin.site.register(User, CustomUserAdmin)
admin.site.register(Country)
admin.site.register(Address)
admin.site.register(PaymentType)

# ملاحظة: جداول الربط (UserAddress, UserPaymentMethod) 
# تظهر تلقائياً داخل صفحة المستخدم بفضل الـ Inlines
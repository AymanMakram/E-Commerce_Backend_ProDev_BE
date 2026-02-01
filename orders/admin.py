from django.contrib import admin
from .models import ShopOrder, OrderLine, OrderStatus
from finance.models import Transaction

# 1. عرض منتجات الطلب في جدول منظم
class OrderLineInline(admin.TabularInline):
    model = OrderLine
    extra = 0
    # جعل الحقول للقراءة فقط لضمان عدم التلاعب في أسعار الطلبات القديمة
    readonly_fields = ('product_item', 'price', 'qty')
    can_delete = False 

# 2. عرض بيانات الدفع بشكل ديناميكي (أكثر جزء احترافي في كودك)
class TransactionInline(admin.StackedInline):
    model = Transaction
    extra = 0
    can_delete = False
    # منع إضافة معاملة مالية يدوياً؛ يجب أن تأتي من نظام الدفع
    max_num = 0 
    
    def get_fields(self, request, obj=None):
        return [f.name for f in self.model._meta.fields if f.name != 'id']
    
    def get_readonly_fields(self, request, obj=None):
        fields = [f.name for f in self.model._meta.fields]
        readonly = [f.name for f in self.model._meta.fields] # جعل كل حقول الدفع للقراءة فقط في صفحة الأوردر
        return readonly

# 3. تسجيل حالات الطلب
@admin.register(OrderStatus)
class OrderStatusAdmin(admin.ModelAdmin):
    list_display = ('id', 'status')

# 4. تسجيل الطلب الرئيسي وربط كل ما سبق
@admin.register(ShopOrder)
class ShopOrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'order_total', 'order_status', 'order_date')
    list_filter = ('order_status', 'order_date')
    search_fields = ('id', 'user__username')
    
    # دمج المنتجات والدفع تحت بعض في صفحة واحدة
    inlines = [OrderLineInline, TransactionInline]
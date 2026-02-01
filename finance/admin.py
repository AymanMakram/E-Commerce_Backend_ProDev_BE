from django.contrib import admin
from .models import Transaction, PaymentStatus

@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    # إظهار الأعمدة الصحيحة
    list_display = ('id', 'get_order_id', 'amount', 'transaction_date', 'payment_status')
    
    # الفلاتر الجانبية
    list_filter = ('payment_status', 'transaction_date')
    
    # البحث (تم تصحيحه: بنبحث برقم الأوردر أو اسم العميل من جدول ShopOrder)
    search_fields = ('order__id', 'order__user__username')
    
    readonly_fields = ('transaction_date',)

    # دالة شيك لعرض رقم الأوردر بوضوح
    def get_order_id(self, obj):
        return f"Order #{obj.order.id}"
    get_order_id.short_description = 'رقم الطلب'

@admin.register(PaymentStatus)
class PaymentStatusAdmin(admin.ModelAdmin):
    list_display = ('id', 'status')
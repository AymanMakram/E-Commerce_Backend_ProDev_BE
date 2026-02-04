"""Django admin configuration for invoices."""

from django.contrib import admin
from django.utils.html import format_html, format_html_join

from .models import Invoice

@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    """Admin configuration for invoices."""

    list_display = ('invoice_number', 'get_order_id', 'get_customer', 'get_total', 'issued_at', 'print_invoice_button')
    list_filter = ('issued_at',)
    search_fields = ('invoice_number', 'order__id', 'order__user__username')
    
    # الحقول اللي هتظهر جوه صفحة الفاتورة نفسها
    readonly_fields = ('invoice_number', 'order', 'issued_at', 'get_order_details')

    def get_order_id(self, obj):
        return f"#{obj.order.id}"
    get_order_id.short_description = 'رقم الأوردر'

    def get_customer(self, obj):
        return obj.order.user.username
    get_customer.short_description = 'العميل'

    def get_total(self, obj):
        return f"{obj.order.order_total} جنيه"
    get_total.short_description = 'الإجمالي'

    # Render order lines safely (escape all dynamic values).
    def get_order_details(self, obj):
        lines = obj.order.lines.all()
        rows = format_html_join(
            '',
            '<tr>'
            '<td style="padding: 8px; border: 1px solid #ddd;">{}</td>'
            '<td style="padding: 8px; border: 1px solid #ddd; text-align: center;">{}</td>'
            '<td style="padding: 8px; border: 1px solid #ddd; text-align: center;">{}</td>'
            '</tr>',
            ((line.product_item, line.qty, line.price) for line in lines),
        )
        return format_html(
            '<table style="width:100%; border-collapse: collapse; border:1px solid #ccc;">'
            '<thead style="background: #f4f4f4;">'
            '<tr>'
            '<th style="padding: 8px; border: 1px solid #ddd; text-align: left;">المنتج</th>'
            '<th style="padding: 8px; border: 1px solid #ddd; text-align: center;">الكمية</th>'
            '<th style="padding: 8px; border: 1px solid #ddd; text-align: center;">السعر</th>'
            '</tr>'
            '</thead>'
            '<tbody>{}</tbody>'
            '</table>',
            rows,
        )
    get_order_details.short_description = 'تفاصيل محتوى الفاتورة'

    # دالة زرار الطباعة (تم تصحيحها لتجنب الـ TypeError)
    def print_invoice_button(self, obj):
        # Avoid inline JS in the admin (XSS hardening). Keep a non-destructive placeholder.
        return format_html(
            '<a class="button" href="#" aria-disabled="true" '
            'style="background-color:#417690; color:white; padding:5px 10px; border-radius:4px; '
            'text-decoration:none; opacity:.75; cursor:not-allowed;">'
            'معاينة وطباعة</a>'
        )
    
    print_invoice_button.short_description = 'العمليات'
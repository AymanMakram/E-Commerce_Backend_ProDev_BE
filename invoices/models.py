"""Database models for invoices."""

from django.db import models

class Invoice(models.Model):
    """Invoice generated for an order."""

    # الربط مع الموديل الصح 'ShopOrder' باستخدام String عشان نتفادى الـ ImportError
    order = models.OneToOneField(
        'orders.ShopOrder', 
        on_delete=models.CASCADE, 
        related_name='invoice'
    )
    
    # رقم فاتورة فريد
    invoice_number = models.CharField(max_length=100, unique=True)
    
    # تاريخ الإصدار
    issued_at = models.DateTimeField(auto_now_add=True)
    
    # مكان حفظ ملف الـ PDF (اختياري)
    pdf_file = models.FileField(upload_to='invoices_pdfs/', null=True, blank=True)

    class Meta:
        verbose_name = "Invoice"
        verbose_name_plural = "Invoices"

    def __str__(self):
        return f"Invoice {self.invoice_number} for Order #{self.order.id}"
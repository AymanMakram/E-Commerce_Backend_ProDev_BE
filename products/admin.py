"""Django admin configuration for product catalog models."""

import csv
from django.contrib import admin
from django.utils.html import format_html
from django.http import HttpResponse
from .models import (ProductCategory, Product, ProductItem, 
                     Variation, VariationOption, ProductConfiguration)

# 1. عرض الـ Items داخل صفحة المنتج نفسه لسهولة الإضافة
class ProductItemInline(admin.TabularInline):
    """Inline editor for a product's SKUs (ProductItem)."""

    model = ProductItem
    extra = 1

# 2. عرض الـ Options داخل صفحة الـ Variation
class VariationOptionInline(admin.TabularInline):
    """Inline editor for options under a variation."""

    model = VariationOption
    extra = 1

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    """Admin configuration for products."""

    list_display = ('name', 'seller', 'category', 'description') 
    search_fields = ('name', 'seller__username')
    list_filter = ('category', 'seller')
    inlines = [ProductItemInline]

@admin.register(Variation)
class VariationAdmin(admin.ModelAdmin):
    """Admin configuration for variations."""

    list_display = ('name', 'category')
    inlines = [VariationOptionInline]

@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    """Admin configuration for product categories."""

    list_display = ('category_name', 'parent_category')

# 3. تعديل صفحة ProductItem (الكمية والسعر والبحث + تصدير الإكسيل)
@admin.register(ProductItem)
class ProductItemAdmin(admin.ModelAdmin):
    """Admin configuration for inventory (ProductItem) management."""

    # تم التأكد من المسميات: sku, product, price موجودين في الموديل بتاعك
    list_display = ('sku', 'product', 'price', 'colored_stock')
    
    # الفلترة والبحث
    list_filter = (
        ('product__category', admin.RelatedOnlyFieldListFilter),
        'product',
    )
    search_fields = ('sku', 'product__name')

    # --- إضافة خاصية تصدير البيانات ---
    actions = ['export_to_csv']

    def export_to_csv(self, request, queryset):
        """Export selected SKUs as a CSV inventory report."""
        response = HttpResponse(content_type='text/csv; charset=utf-8-sig')
        response['Content-Disposition'] = 'attachment; filename="inventory_report.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['SKU', 'المنتج', 'السعر', 'الكمية المتاحة'])

        for item in queryset:
            writer.writerow([item.sku, item.product.name, item.price, item.qty_in_stock])

        return response
    export_to_csv.short_description = "استخراج البيانات المحددة لملف Excel"
    # --------------------------------

    # تلوين المخزن بناءً على حقل qty_in_stock (الموجود فعلياً في الموديل)
    def colored_stock(self, obj):
        """Render stock in color to highlight low inventory."""
        stock = obj.qty_in_stock
        if stock <= 3:
            color = 'red'
        elif stock <= 10:
            color = 'orange'
        else:
            color = 'green'
        return format_html('<b style="color: {};">{}</b>', color, stock)
    
    colored_stock.short_description = 'الكمية المتاحة'
    colored_stock.admin_order_field = 'qty_in_stock'

# تسجيل باقي الموديلات بشكل بسيط
admin.site.register(VariationOption)
admin.site.register(ProductConfiguration)
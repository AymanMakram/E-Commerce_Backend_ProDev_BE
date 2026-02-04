"""Django admin configuration for shopping cart models."""

from django.contrib import admin
from .models import ShoppingCart, ShoppingCartItem

# عرض محتويات السلة داخل صفحة السلة نفسها
class ShoppingCartItemInline(admin.TabularInline):
    """Inline display/edit for cart items within a cart."""

    model = ShoppingCartItem
    extra = 0
    readonly_fields = ('subtotal',) # ليكون المجموع للقراءة فقط

@admin.register(ShoppingCart)
class ShoppingCartAdmin(admin.ModelAdmin):
    """Admin configuration for shopping carts."""

    list_display = ('user', 'total_price', 'created_at')
    search_fields = ('user__username', 'user__email')
    inlines = [ShoppingCartItemInline] # عرض المنتجات اللي جوه السلة

# تسجيل الموديل الفرعي بشكل منفصل أيضاً إذا أردت
admin.site.register(ShoppingCartItem)
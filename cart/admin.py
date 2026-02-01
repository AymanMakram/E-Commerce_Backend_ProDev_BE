from django.contrib import admin
from .models import ShoppingCart, ShoppingCartItem

# عرض محتويات السلة داخل صفحة السلة نفسها
class ShoppingCartItemInline(admin.TabularInline):
    model = ShoppingCartItem
    extra = 0
    readonly_fields = ('subtotal',) # ليكون المجموع للقراءة فقط

@admin.register(ShoppingCart)
class ShoppingCartAdmin(admin.ModelAdmin):
    list_display = ('user', 'total_price', 'created_at')
    search_fields = ('user__username', 'user__email')
    inlines = [ShoppingCartItemInline] # عرض المنتجات اللي جوه السلة

# تسجيل الموديل الفرعي بشكل منفصل أيضاً إذا أردت
admin.site.register(ShoppingCartItem)
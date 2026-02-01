from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CartViewSet, CartItemViewSet, cart_detail

router = DefaultRouter()

# تعديل 'items' إلى 'cart-items' لتطابق طلب الـ JavaScript في اللوجات
router.register(r'cart-items', CartItemViewSet, basename='cart-items') 

# المسار الرئيسي للسلة
router.register(r'', CartViewSet, basename='cart-main')

urlpatterns = [
    # الصفحة: /api/cart/view/ (أو حسب رغبتك في الوصول لها)
    path('view/', cart_detail, name='cart_detail'), 
    
    # الحل هنا: حذفنا 'api/' لأنها موجودة بالفعل في الملف الرئيسي
    path('', include(router.urls)), 
]
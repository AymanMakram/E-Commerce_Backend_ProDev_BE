"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from products.views import ProductViewSet, ProductCategoryViewSet, ProductItemViewSet
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from drf_yasg.views import get_schema_view
from drf_yasg import openapi
from orders.views import OrderViewSet
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from django.views.generic import TemplateView
from django.views.generic import RedirectView
from django.conf import settings
from django.conf.urls.static import static
from products.views_customer import product_detail_view, product_list_view


router = DefaultRouter()
router.register(r'categories', ProductCategoryViewSet, basename='ProductCategory')
router.register(r'products', ProductViewSet, basename='product')
router.register(r'product-items', ProductItemViewSet, basename='product-item')
router.register(r'orders', OrderViewSet, basename='order')


schema_view = get_schema_view(
   openapi.Info(title="BEE-Commerce API", default_version='v1'),
   public=True,
)

from django.views.generic import RedirectView

urlpatterns = [
    path('', RedirectView.as_view(url='/api/accounts/login-view/'), name='go-to-login'),
    # Default route: go to login view
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
    path('api/accounts/', include('accounts.urls')),
    path('api/cart/', include('cart.urls')),
    # Serve static HTML for SPA entry points
    path('products/', product_list_view, name='product_list'),
    path('products/<int:product_id>/', product_detail_view, name='product_detail'),
    path('profile/', TemplateView.as_view(template_name='auth/customer_profile.html'), name='customer_profile'),
    path('orders/', TemplateView.as_view(template_name='orders/order_history.html'), name='order_history'),
    path('orders/track/<int:order_id>/', TemplateView.as_view(template_name='orders/track_order.html'), name='track_order'),
    path('seller/orders/', TemplateView.as_view(template_name='orders/seller_orders.html'), name='seller_orders'),
    path('seller/', TemplateView.as_view(template_name='products/seller_dashboard.html'), name='seller_dashboard'),
    path('cart/', TemplateView.as_view(template_name='cart/cart_detail.html'), name='cart_detail_page'),
    # Retired legacy checkout page; use modern cart modal checkout flow.
    path('cart/checkout/', RedirectView.as_view(url='/cart/', permanent=False), name='cart_checkout'),
    # Swagger Documentation
    path('swagger/', schema_view.with_ui('swagger', cache_timeout=0)),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    # ده الرابط اللي هتفتحه في المتصفح
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    # رابط بديل بشكل منظّم أكتر (Redoc)
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
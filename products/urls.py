"""Legacy product API routes (most APIs are registered in core router)."""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProductViewSet, ProductCategoryViewSet

router = DefaultRouter()
router.register(r'list', ProductViewSet, basename='product')
router.register(r'categories', ProductCategoryViewSet, basename='category')

urlpatterns = [
    path('', include(router.urls)),
]
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import OrderViewSet
from .views_status_api import order_status_list

router = DefaultRouter()
router.register(r'my-orders', OrderViewSet, basename='shoporder')

urlpatterns = [
    path('', include(router.urls)),
    path('status-list/', order_status_list, name='order_status_list'),
]
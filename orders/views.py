from rest_framework import viewsets, permissions, filters
from .models import ShopOrder
from .serializers import ShopOrderSerializer
from products.views import StandardResultsSetPagination # هنستعمل نفس الترقيم

class OrderViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ShopOrderSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['order_date', 'order_total']
    ordering = ['-order_date'] # الأحدث يظهر الأول تلقائياً

    def get_queryset(self):
        # المستخدم يرى طلباته فقط
        return ShopOrder.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
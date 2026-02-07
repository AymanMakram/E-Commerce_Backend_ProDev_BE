"""Small helper API endpoints for order status lookups."""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import OrderStatus, ShopOrder
from .serializers import ShopOrderSerializer

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def order_status_list(request):
    """Return all order statuses for client-side dropdowns."""
    statuses = OrderStatus.objects.all().values('id', 'status')
    return Response(list(statuses))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def order_detail_view(request, order_id: int):
    """Return a single order by id with seller/customer scoping."""
    user = request.user

    if user.is_authenticated and getattr(user, 'user_type', None) == 'seller':
        qs = (
            ShopOrder.objects.filter(lines__product_item__product__seller=user)
            .select_related('order_status', 'user', 'payment_method', 'shipping_address')
            .prefetch_related('lines__product_item__product__seller')
            .distinct()
        )
    else:
        qs = (
            ShopOrder.objects.filter(user=user)
            .select_related('order_status', 'payment_method', 'shipping_address')
            .prefetch_related('lines__product_item__product__seller')
        )

    order = get_object_or_404(qs, id=order_id)
    serializer = ShopOrderSerializer(order, context={'request': request})
    return Response(serializer.data)

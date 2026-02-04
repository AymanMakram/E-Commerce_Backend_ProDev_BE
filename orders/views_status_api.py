"""Small helper API endpoints for order status lookups."""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import OrderStatus

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def order_status_list(request):
    """Return all order statuses for client-side dropdowns."""
    statuses = OrderStatus.objects.all().values('id', 'status')
    return Response(list(statuses))

from rest_framework import viewsets, permissions, filters
from rest_framework.response import Response
from .models import ShopOrder
from .serializers import ShopOrderSerializer
from products.views import StandardResultsSetPagination # هنستعمل نفس الترقيم

from products.models import Product
from django.utils.dateparse import parse_date

class OrderViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ShopOrderSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['order_date', 'order_total']
    ordering = ['-order_date']

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and getattr(user, 'user_type', None) == 'seller':
            # Seller can see orders that contain any of their product items
            seller_products = Product.objects.filter(seller=user)
            product_item_ids = []
            for p in seller_products:
                product_item_ids.extend(list(p.items.values_list('id', flat=True)))

            from .models import OrderLine
            order_ids = OrderLine.objects.filter(product_item_id__in=product_item_ids).values_list('order_id', flat=True).distinct()
            return ShopOrder.objects.filter(id__in=order_ids).order_by('-order_date')

        # Default: customer sees their own orders
        return ShopOrder.objects.filter(user=user)

    # Seller-specific endpoint: all orders containing their products
    from rest_framework.decorators import action
    @action(detail=False, methods=['get'], url_path='seller-orders')
    def seller_orders(self, request):
        user = request.user
        if not hasattr(user, 'user_type') or user.user_type != 'seller':
            return Response({'detail': 'Not authorized.'}, status=403)

        orders = self.get_queryset()

        # Optional query params
        status_id = request.query_params.get('status')
        if status_id:
            orders = orders.filter(order_status_id=status_id)

        q = (request.query_params.get('q') or '').strip()
        if q.isdigit():
            orders = orders.filter(id=int(q))

        date_from = parse_date(request.query_params.get('date_from') or '')
        if date_from:
            orders = orders.filter(order_date__date__gte=date_from)

        date_to = parse_date(request.query_params.get('date_to') or '')
        if date_to:
            orders = orders.filter(order_date__date__lte=date_to)

        page = self.paginate_queryset(orders)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(orders, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='statuses')
    def statuses(self, request):
        """List all OrderStatus values for dropdowns."""
        if not request.user.is_authenticated:
            return Response({'detail': 'Not authenticated.'}, status=401)
        from .models import OrderStatus
        statuses = OrderStatus.objects.order_by('id').values('id', 'status')
        return Response(list(statuses))

    def create(self, request, *args, **kwargs):
        user = request.user
        from cart.models import ShoppingCart, ShoppingCartItem
        cart = ShoppingCart.objects.filter(user=user, session_id__isnull=True).first() or ShoppingCart.objects.filter(user=user, session_id='').first()
        if not cart or cart.items.count() == 0:
            return Response({'detail': 'Cart is empty.'}, status=400)

        from accounts.models import UserAddress, UserPaymentMethod

        requested_address_id = request.data.get('shipping_address_id') or request.data.get('shipping_address')
        requested_payment_id = request.data.get('payment_method_id') or request.data.get('payment_method')

        # Address: accept explicit id, else default, else first
        address = None
        if requested_address_id:
            ua = UserAddress.objects.filter(user=user, address_id=requested_address_id).select_related('address').first()
            if not ua:
                return Response({'detail': 'Invalid shipping address.'}, status=400)
            address = ua.address
        else:
            ua = UserAddress.objects.filter(user=user, is_default=True).select_related('address').first() or \
                 UserAddress.objects.filter(user=user).select_related('address').first()
            if ua:
                address = ua.address

        if not address:
            return Response({'detail': 'No address found. Please add an address to your profile.'}, status=400)

        # Payment: accept explicit id, else default, else first
        payment = None
        if requested_payment_id:
            payment = UserPaymentMethod.objects.filter(user=user, id=requested_payment_id).first()
            if not payment:
                return Response({'detail': 'Invalid payment method.'}, status=400)
        else:
            payment = UserPaymentMethod.objects.filter(user=user, is_default=True).first() or \
                      UserPaymentMethod.objects.filter(user=user).first()

        if not payment:
            return Response({'detail': 'No payment method found. Please add a payment method to your profile.'}, status=400)
        from .models import OrderStatus
        # Determine order status based on payment type
        if payment.payment_type.value == 'Cash on Delivery':
            status_obj = OrderStatus.objects.filter(status__iexact='Pending').first() or OrderStatus.objects.first()
        else:
            status_obj = OrderStatus.objects.filter(status__iexact='Completed').first() or OrderStatus.objects.first()
        if not status_obj:
            return Response({'detail': 'No order status found. Please contact support.'}, status=400)

        order = ShopOrder.objects.create(
            user=user,
            payment_method=payment,
            shipping_address=address,
            order_total=cart.total_price,
            order_status=status_obj
        )
        for item in cart.items.all():
            order.lines.create(
                product_item=item.product_item,
                qty=item.qty,
                price=item.product_item.price
            )
        cart.items.all().delete()

        serializer = self.get_serializer(order)
        # Redirect to order status page for seller/customer
        return Response({'id': order.id, **serializer.data}, status=201)

    # Seller can update order status if owns any product in the order
    @action(detail=True, methods=['patch'], url_path='set-status')
    def set_status(self, request, pk=None):
        user = request.user
        if not hasattr(user, 'user_type') or user.user_type != 'seller':
            return Response({'detail': 'Not authorized.'}, status=403)
        order = self.get_object()
        # Check if seller owns any product in this order
        from products.models import Product
        seller_products = Product.objects.filter(seller=user)
        seller_item_ids = set()
        for p in seller_products:
            seller_item_ids.update(p.items.values_list('id', flat=True))
        order_item_ids = set(order.lines.values_list('product_item_id', flat=True))
        if not (seller_item_ids & order_item_ids):
            return Response({'detail': 'You do not have permission to update this order.'}, status=403)
        # Update status
        status_id = request.data.get('order_status')
        if not status_id:
            return Response({'detail': 'Missing order_status.'}, status=400)
        from .models import OrderStatus
        try:
            new_status = OrderStatus.objects.get(id=status_id)
        except OrderStatus.DoesNotExist:
            return Response({'detail': 'Invalid status.'}, status=400)
        order.order_status = new_status
        order.save()
        serializer = self.get_serializer(order)
        return Response(serializer.data)
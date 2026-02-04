"""Orders API views.

Includes checkout creation, seller status updates, and list endpoints.
"""

from rest_framework import viewsets, permissions, filters
from rest_framework.response import Response
from .models import ShopOrder
from .serializers import ShopOrderSerializer
from products.views import StandardResultsSetPagination # هنستعمل نفس الترقيم

from django.utils.dateparse import parse_date
from django.utils import timezone
from django.db import transaction
from decimal import Decimal


def _normalize_order_status_key(label: str) -> str | None:
    """Normalize OrderStatus.status into a canonical key.

    Returns None when the label is unknown; we only enforce transitions
    when both current and target labels are recognized.
    """

    s = str(label or '').strip().lower()
    if not s:
        return None

    # Arabic + English markers
    pending = {'pending', 'new', 'placed', 'قيد', 'انتظار', 'قيد الانتظار', 'جديد'}
    processing = {'processing', 'preparing', 'confirmed', 'تجهيز', 'قيد التجهيز', 'تم التأكيد', 'مؤكد'}
    shipped = {'shipped', 'shipping', 'in transit', 'تم الشحن', 'تم ارسال', 'تم الإرسال', 'قيد الشحن'}
    delivered = {'delivered', 'تم التسليم', 'تم التوصيل'}
    completed = {'completed', 'complete', 'done', 'مكتمل', 'تم'}
    cancelled = {'cancelled', 'canceled', 'cancel', 'ملغي', 'ملغى', 'إلغاء', 'الغاء'}
    refunded = {'refunded', 'refund', 'تم الاسترجاع', 'استرجاع'}
    returned = {'returned', 'return', 'مرتجع', 'ارجاع', 'إرجاع'}

    if any(m in s for m in cancelled):
        return 'cancelled'
    if any(m in s for m in refunded):
        return 'refunded'
    if any(m in s for m in returned):
        return 'returned'
    if any(m in s for m in delivered):
        return 'delivered'
    if any(m in s for m in shipped):
        return 'shipped'
    if any(m in s for m in processing):
        return 'processing'
    if any(m in s for m in pending):
        return 'pending'
    if any(m in s for m in completed):
        return 'completed'
    return None


_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    'pending': {'processing', 'shipped', 'cancelled'},
    'processing': {'shipped', 'cancelled'},
    'shipped': {'delivered', 'returned'},
    'delivered': {'completed', 'returned', 'refunded'},
    'completed': {'returned', 'refunded'},
    'cancelled': set(),
    'returned': set(),
    'refunded': set(),
}


def _transition_allowed(current_label: str, next_label: str) -> bool:
    cur = _normalize_order_status_key(current_label)
    nxt = _normalize_order_status_key(next_label)
    if cur is None or nxt is None:
        return True
    if cur == nxt:
        return True
    return nxt in _ALLOWED_TRANSITIONS.get(cur, set())


def _ensure_status(name: str):
    from .models import OrderStatus
    obj, _ = OrderStatus.objects.get_or_create(status=name)
    return obj


def _recompute_order_status_from_lines(order: ShopOrder) -> None:
    """Derive order.order_status from line_status values.

    This keeps the global order state meaningful for customers, while allowing
    per-seller fulfillment for mixed-vendor orders.
    """

    lines = list(order.lines.select_related('line_status').all())
    if not lines:
        return

    keys = []
    for ln in lines:
        keys.append(_normalize_order_status_key(getattr(getattr(ln, 'line_status', None), 'status', '') or '') or 'pending')

    # Aggregate rules (predictable + supports partial states)
    # Priority:
    # 1) All-cancelled => Cancelled
    # 2) Any-refunded => Refunded
    # 3) Any-returned => Returned
    # 4) All-delivered/completed => Delivered
    # 5) Any-shipped/delivered => Shipped (covers partial-delivered)
    # 6) Any-processing => Processing
    # 7) Otherwise => Pending

    if all(k == 'cancelled' for k in keys):
        order.order_status = _ensure_status('Cancelled')
        return

    if any(k == 'refunded' for k in keys):
        order.order_status = _ensure_status('Refunded')
        return

    if any(k == 'returned' for k in keys):
        order.order_status = _ensure_status('Returned')
        return

    if all(k in {'delivered', 'completed'} for k in keys):
        order.order_status = _ensure_status('Delivered')
        return

    if any(k in {'shipped', 'delivered', 'completed'} for k in keys):
        order.order_status = _ensure_status('Shipped')
        return

    if any(k == 'processing' for k in keys):
        order.order_status = _ensure_status('Processing')
        return

    order.order_status = _ensure_status('Pending')

class OrderViewSet(viewsets.ModelViewSet):
    """Order API endpoints for customers and sellers.

    Customers can create and list their own orders.
    Sellers can list orders that include their SKUs and update statuses.
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ShopOrderSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['order_date', 'order_total']
    ordering = ['-order_date']

    def get_queryset(self):
        """Base queryset for the authenticated user.

        - Sellers: orders that contain any SKU belonging to the seller.
        - Customers: their own orders.
        """
        user = self.request.user
        if user.is_authenticated and getattr(user, 'user_type', None) == 'seller':
            # Seller can see orders that contain any of their product items.
            # Use relational filtering to avoid N+1 loops.
            return (
                ShopOrder.objects.filter(lines__product_item__product__seller=user)
                .select_related('order_status', 'user', 'payment_method', 'shipping_address')
                .prefetch_related('lines__product_item__product__seller')
                .distinct()
                .order_by('-order_date')
            )

        # Default: customer sees their own orders
        return (
            ShopOrder.objects.filter(user=user)
            .select_related('order_status', 'payment_method', 'shipping_address')
            .prefetch_related('lines__product_item__product__seller')
        )

    # Seller-specific endpoint: all orders containing their products
    from rest_framework.decorators import action

    @action(detail=False, methods=['get'], url_path='my-orders')
    def my_orders(self, request):
        """Customer-only endpoint: list the authenticated customer's orders with pagination."""
        user = request.user
        if getattr(user, 'user_type', None) == 'seller':
            return Response({'detail': 'Not authorized.'}, status=403)

        orders = self.get_queryset().order_by('-order_date')

        q = (request.query_params.get('q') or '').strip()
        if q.isdigit():
            orders = orders.filter(id=int(q))

        status_id = request.query_params.get('status')
        if status_id:
            orders = orders.filter(order_status_id=status_id)

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

    @action(detail=False, methods=['get'], url_path='seller-orders')
    def seller_orders(self, request):
        """Seller-only: list orders that include any of the seller's SKUs.

        Supports optional filters: `status`, `q` (order id), `date_from`, `date_to`.
        """
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
        from cart.models import ShoppingCart
        from accounts.models import UserAddress, UserPaymentMethod
        from products.models import ProductItem
        from .models import OrderStatus

        requested_address_id = request.data.get('shipping_address_id') or request.data.get('shipping_address')
        requested_payment_id = request.data.get('payment_method_id') or request.data.get('payment_method')

        # Make checkout atomic: lock cart, lock SKUs, validate stock, decrement stock.
        with transaction.atomic():
            cart = (
                ShoppingCart.objects.select_for_update()
                .filter(user=user)
                .prefetch_related('items__product_item__product')
                .first()
            )
            if not cart or cart.items.count() == 0:
                return Response({'detail': 'Cart is empty.'}, status=400)

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
                payment = UserPaymentMethod.objects.filter(user=user, id=requested_payment_id).select_related('payment_type').first()
                if not payment:
                    return Response({'detail': 'Invalid payment method.'}, status=400)
            else:
                payment = (
                    UserPaymentMethod.objects.filter(user=user, is_default=True).select_related('payment_type').first()
                    or UserPaymentMethod.objects.filter(user=user).select_related('payment_type').first()
                )

            if not payment:
                return Response({'detail': 'No payment method found. Please add a payment method to your profile.'}, status=400)

            # Initial order status should represent fulfillment stage, not payment.
            status_obj = OrderStatus.objects.filter(status__iexact='Pending').first() or OrderStatus.objects.first()
            if not status_obj:
                return Response({'detail': 'No order status found. Please contact support.'}, status=400)

            cart_items = list(cart.items.select_related('product_item', 'product_item__product').all())
            sku_ids = [ci.product_item_id for ci in cart_items if ci.product_item_id]
            if not sku_ids:
                return Response({'detail': 'Cart is empty.'}, status=400)

            # Lock all SKUs involved.
            locked_skus = list(
                ProductItem.objects.select_for_update()
                .select_related('product')
                .filter(id__in=sku_ids)
            )
            sku_by_id = {s.id: s for s in locked_skus}

            # Validate and compute totals server-side.
            total = Decimal('0.00')
            for ci in cart_items:
                sku = sku_by_id.get(ci.product_item_id)
                if sku is None:
                    return Response({'detail': 'One or more items are invalid.'}, status=400)

                # Do not allow checkout of unpublished products.
                product = getattr(sku, 'product', None)
                if product is not None and hasattr(product, 'is_published') and not bool(product.is_published):
                    return Response({'detail': 'One or more items are not available.'}, status=400)

                try:
                    qty = int(ci.qty or 0)
                except Exception:
                    qty = 0
                if qty < 1:
                    return Response({'detail': 'Invalid quantity in cart.'}, status=400)

                try:
                    stock = int(sku.qty_in_stock or 0)
                except Exception:
                    stock = 0
                if qty > stock:
                    return Response({'detail': f'Insufficient stock for SKU {sku.sku}. Available: {stock}.'}, status=400)

                # Price is stored on SKU.
                line_price = sku.price
                total += (Decimal(str(line_price)) * Decimal(qty))

            order = ShopOrder.objects.create(
                user=user,
                payment_method=payment,
                shipping_address=address,
                order_total=total,
                order_status=status_obj,
            )

            for ci in cart_items:
                sku = sku_by_id[ci.product_item_id]
                qty = int(ci.qty)
                order.lines.create(
                    product_item=sku,
                    qty=qty,
                    price=sku.price,
                    line_status=status_obj,
                )
                # Decrement stock
                sku.qty_in_stock = int(sku.qty_in_stock or 0) - qty
                sku.save(update_fields=['qty_in_stock'])

            # Clear cart
            cart.items.all().delete()

        serializer = self.get_serializer(order)
        return Response({'id': order.id, **serializer.data}, status=201)

    @action(detail=True, methods=['patch'], url_path='set-line-status')
    def set_line_status(self, request, pk=None):
        """Seller-only: update status for a single order line owned by this seller.

        Payload: { line_id: int, line_status: int }
        """

        user = request.user
        if not hasattr(user, 'user_type') or user.user_type != 'seller':
            return Response({'detail': 'Not authorized.'}, status=403)

        order = self.get_object()
        line_id = request.data.get('line_id')
        status_id = request.data.get('line_status') or request.data.get('status')
        if not line_id or not status_id:
            return Response({'detail': 'Missing line_id or line_status.'}, status=400)

        from .models import OrderLine, OrderStatus
        from products.models import ProductItem

        try:
            line_id_int = int(line_id)
            status_id_int = int(status_id)
        except Exception:
            return Response({'detail': 'Invalid line_id or line_status.'}, status=400)

        try:
            new_status = OrderStatus.objects.get(id=status_id_int)
        except OrderStatus.DoesNotExist:
            return Response({'detail': 'Invalid status.'}, status=400)

        with transaction.atomic():
            line = (
                OrderLine.objects.select_for_update()
                .select_related('product_item__product__seller', 'line_status', 'order')
                .filter(order=order, id=line_id_int)
                .first()
            )
            if not line:
                return Response({'detail': 'Line not found.'}, status=404)

            if getattr(getattr(line.product_item, 'product', None), 'seller', None) != user:
                return Response({'detail': 'You do not have permission to update this line.'}, status=403)

            current_label = str(getattr(getattr(line, 'line_status', None), 'status', '') or getattr(getattr(order, 'order_status', None), 'status', '') or '')
            if not _transition_allowed(current_label, getattr(new_status, 'status', '')):
                return Response({'detail': 'Invalid status transition.'}, status=400)

            prev_key = _normalize_order_status_key(current_label) or 'pending'
            next_key = _normalize_order_status_key(getattr(new_status, 'status', '') or '')

            should_restore_stock = False
            if next_key == 'cancelled' and prev_key in {'pending', 'processing'} and not line.line_shipped_at and not line.line_delivered_at:
                should_restore_stock = True
            if next_key == 'returned' and prev_key in {'shipped', 'delivered', 'completed'}:
                should_restore_stock = True

            if should_restore_stock:
                sku = ProductItem.objects.select_for_update().filter(id=line.product_item_id).first()
                if sku:
                    try:
                        qty = int(line.qty or 0)
                    except Exception:
                        qty = 0
                    sku.qty_in_stock = int(sku.qty_in_stock or 0) + max(0, qty)
                    sku.save(update_fields=['qty_in_stock'])

            # Update timestamps on the line
            now = timezone.now()
            label = str(getattr(new_status, 'status', '') or '').strip().lower()
            shipped_keywords = {'shipped', 'shipping', 'تم الشحن', 'تم ارسال', 'تم الإرسال'}
            delivered_keywords = {'delivered', 'تم التسليم'}
            if (label in shipped_keywords) and not line.line_shipped_at:
                line.line_shipped_at = now
            if (label in delivered_keywords) and not line.line_delivered_at:
                line.line_delivered_at = now

            line.line_status = new_status
            line.save(update_fields=['line_status', 'line_shipped_at', 'line_delivered_at'])

            # Recompute overall order status based on all lines
            _recompute_order_status_from_lines(order)
            order.save(update_fields=['order_status'])

        serializer = self.get_serializer(order)
        return Response(serializer.data)

    # Seller can update order status if owns any product in the order
    @action(detail=True, methods=['patch'], url_path='set-status')
    def set_status(self, request, pk=None):
        user = request.user
        if not hasattr(user, 'user_type') or user.user_type != 'seller':
            return Response({'detail': 'Not authorized.'}, status=403)
        order = self.get_object()
        # Must include at least one seller-owned line to access.
        if not order.lines.filter(product_item__product__seller=user).exists():
            return Response({'detail': 'You do not have permission to update this order.'}, status=403)

        # Multi-vendor safety: do not allow a seller to change the global order status
        # unless they own ALL lines in the order.
        if order.lines.exclude(product_item__product__seller=user).exists():
            return Response({'detail': 'Multi-vendor order: you cannot update the overall status.'}, status=403)
        # Update status
        status_id = request.data.get('order_status')
        if not status_id:
            return Response({'detail': 'Missing order_status.'}, status=400)
        from .models import OrderStatus
        try:
            new_status = OrderStatus.objects.get(id=status_id)
        except OrderStatus.DoesNotExist:
            return Response({'detail': 'Invalid status.'}, status=400)
        # Enforce order status lifecycle transitions when recognizable.
        if not _transition_allowed(getattr(order.order_status, 'status', ''), getattr(new_status, 'status', '')):
            return Response({'detail': 'Invalid status transition.'}, status=400)

        prev_status_label = str(getattr(order.order_status, 'status', '') or '')
        next_status_label = str(getattr(new_status, 'status', '') or '')
        prev_key = _normalize_order_status_key(prev_status_label)
        next_key = _normalize_order_status_key(next_status_label)

        # Optional inventory reconciliation.
        # - Cancelled (before shipped): restore stock.
        # - Returned: restore stock.
        should_restore_stock = False
        if next_key == 'cancelled' and prev_key in {'pending', 'processing'} and not order.shipped_at and not order.delivered_at:
            should_restore_stock = True
        if next_key == 'returned' and prev_key in {'shipped', 'delivered', 'completed'}:
            should_restore_stock = True

        with transaction.atomic():
            if should_restore_stock:
                from products.models import ProductItem
                # Lock SKUs and restore quantities.
                lines = list(order.lines.select_related('product_item').all())
                sku_ids = [l.product_item_id for l in lines]
                skus = list(ProductItem.objects.select_for_update().filter(id__in=sku_ids))
                sku_by_id = {s.id: s for s in skus}
                for line in lines:
                    sku = sku_by_id.get(line.product_item_id)
                    if not sku:
                        continue
                    try:
                        qty = int(line.qty or 0)
                    except Exception:
                        qty = 0
                    sku.qty_in_stock = int(sku.qty_in_stock or 0) + max(0, qty)
                    sku.save(update_fields=['qty_in_stock'])

            order.order_status = new_status

            # Keep per-line status in sync for single-vendor orders.
            try:
                from .models import OrderLine
                lines = list(order.lines.select_for_update().all())
                label = str(getattr(new_status, 'status', '') or '').strip().lower()
                now = timezone.now()
                shipped_keywords = {'shipped', 'shipping', 'تم الشحن', 'تم ارسال', 'تم الإرسال'}
                delivered_keywords = {'delivered', 'تم التسليم', 'تم التوصيل'}

                for ln in lines:
                    ln.line_status = new_status
                    if (label in shipped_keywords) and not getattr(ln, 'line_shipped_at', None):
                        ln.line_shipped_at = now
                    if (label in delivered_keywords) and not getattr(ln, 'line_delivered_at', None):
                        ln.line_delivered_at = now

                if lines:
                    OrderLine.objects.bulk_update(lines, ['line_status', 'line_shipped_at', 'line_delivered_at'])
            except Exception:
                # Do not block status update on best-effort sync.
                pass

            # Optional fulfillment tracking updates
            carrier = request.data.get('shipping_carrier')
            tracking = request.data.get('tracking_number')
            if carrier is not None:
                order.shipping_carrier = str(carrier).strip() or None
            if tracking is not None:
                order.tracking_number = str(tracking).strip() or None

            # Best-effort milestone timestamps based on status label
            label = str(getattr(new_status, 'status', '') or '').strip().lower()
            now = timezone.now()
            shipped_keywords = {'shipped', 'shipping', 'تم الشحن', 'تم ارسال', 'تم الإرسال'}
            delivered_keywords = {'delivered', 'تم التسليم', 'تم التوصيل'}
            if (label in shipped_keywords) and not order.shipped_at:
                order.shipped_at = now
            if (label in delivered_keywords) and not order.delivered_at:
                order.delivered_at = now

            order.save()
        serializer = self.get_serializer(order)
        return Response(serializer.data)
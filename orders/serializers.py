"""DRF serializers for orders APIs."""

from rest_framework import serializers
from .models import ShopOrder, OrderLine, OrderStatus
from finance.models import Transaction

class OrderLineSerializer(serializers.ModelSerializer):
    """
    عرض تفاصيل المنتجات المشتراة داخل كل طلب.
    """
    # جلب اسم المنتج من موديل المنتج الأصلي المرتبط بالـ Item
    product_name = serializers.ReadOnlyField(source='product_item.product.name')
    # جلب الـ SKU (رمز التخزين) لتمييز القطعة
    sku = serializers.ReadOnlyField(source='product_item.sku')

    line_status_display = serializers.ReadOnlyField(source='line_status.status')
    line_status_id = serializers.ReadOnlyField(source='line_status.id')

    line_can_update_status = serializers.SerializerMethodField()

    class Meta:
        model = OrderLine
        fields = ['id', 'product_name', 'sku', 'qty', 'price', 'line_status_id', 'line_status_display', 'line_shipped_at', 'line_delivered_at', 'line_can_update_status']

    def get_line_can_update_status(self, obj):
        request = self.context.get('request') if hasattr(self, 'context') else None
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False):
            return False
        if getattr(user, 'user_type', None) != 'seller':
            return False
        try:
            return getattr(getattr(obj.product_item, 'product', None), 'seller_id', None) == user.id
        except Exception:
            return False


class ShopOrderSerializer(serializers.ModelSerializer):
    """
    المحول الرئيسي للطلب: يربط بيانات الطلب بمنتجاته وبحالته المالية.
    """
    # عرض قائمة المنتجات (OrderLines) المرتبطة بالطلب
    # NOTE: For seller dashboards, we hide other sellers' lines for privacy.
    lines = serializers.SerializerMethodField()
    
    # عرض اسم حالة الطلب (مثلاً: Shipped, Pending) بدلاً من الرقم
    status_display = serializers.ReadOnlyField(source='order_status.status')

    # Expose current status id for frontend dropdowns
    order_status_id = serializers.ReadOnlyField(source='order_status.id')
    
    # جلب حالة الدفع من تطبيق Finance (مثل: Paid, Pending)
    payment_status = serializers.SerializerMethodField()

    shipping_address_details = serializers.SerializerMethodField()
    customer_phone_number = serializers.SerializerMethodField()
    customer_username = serializers.ReadOnlyField(source='user.username')

    can_update_status = serializers.SerializerMethodField()

    is_multi_vendor = serializers.SerializerMethodField()
    other_sellers_lines_count = serializers.SerializerMethodField()
    total_lines_count = serializers.SerializerMethodField()

    order_status = serializers.PrimaryKeyRelatedField(queryset=OrderStatus.objects.all(), required=False, write_only=True)

    class Meta:
        model = ShopOrder
        fields = [
            'id', 
            'order_date', 
            'order_total', 
            'status_display', 
            'order_status_id',
            'payment_status', 
            'shipping_address_details',
            'shipping_carrier',
            'tracking_number',
            'shipped_at',
            'delivered_at',
            'customer_phone_number',
            'customer_username',
            'can_update_status',
            'is_multi_vendor',
            'other_sellers_lines_count',
            'total_lines_count',
            'lines',
            'order_status', # for update
        ]
    def _lines_list(self, obj):
        try:
            # Prefer prefetched lines.
            if hasattr(obj, '_prefetched_objects_cache') and 'lines' in obj._prefetched_objects_cache:
                return list(obj.lines.all())
        except Exception:
            pass

        try:
            return list(obj.lines.select_related('product_item__product__seller', 'line_status').all())
        except Exception:
            return []

    def _seller_owned_counts(self, obj, seller_id: int):
        lines = self._lines_list(obj)
        own = 0
        other = 0
        for ln in lines:
            try:
                sid = getattr(getattr(getattr(ln, 'product_item', None), 'product', None), 'seller_id', None)
            except Exception:
                sid = None
            if sid == seller_id:
                own += 1
            else:
                other += 1
        return own, other, len(lines)

    def get_lines(self, obj):
        request = self.context.get('request') if hasattr(self, 'context') else None
        user = getattr(request, 'user', None)
        lines = self._lines_list(obj)

        # Customers (and non-seller users) see full order lines.
        if not user or not getattr(user, 'is_authenticated', False) or getattr(user, 'user_type', None) != 'seller':
            return OrderLineSerializer(lines, many=True, context=self.context).data

        seller_id = getattr(user, 'id', None)
        if not seller_id:
            return []

        own, other, _total = self._seller_owned_counts(obj, int(seller_id))
        if other > 0:
            # Privacy: hide other sellers' lines.
            lines = [ln for ln in lines if getattr(getattr(getattr(ln, 'product_item', None), 'product', None), 'seller_id', None) == seller_id]

        return OrderLineSerializer(lines, many=True, context=self.context).data


    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Dynamically set queryset for order_status field
        from .models import OrderStatus
        self.fields['order_status'].queryset = OrderStatus.objects.all()

    def get_payment_status(self, obj):
        """
        دالة لجلب حالة الدفع من جدول Transaction المرتبط بالطلب.
        """
        try:
            # التحقق إذا كان الطلب له سجل مالي (Transaction)
            if hasattr(obj, 'transaction'):
                return obj.transaction.payment_status.status
            return "Pending"
        except Exception:
            # في حالة عدم وجود سجل أو حدوث خطأ
            return "Pending"

    def get_customer_phone_number(self, obj):
        try:
            return getattr(obj.user, 'phone_number', None)
        except Exception:
            return None

    def get_shipping_address_details(self, obj):
        addr = getattr(obj, 'shipping_address', None)
        if not addr:
            return None
        try:
            country_name = getattr(getattr(addr, 'country', None), 'country_name', None)
            return {
                'id': getattr(addr, 'id', None),
                'unit_number': getattr(addr, 'unit_number', None),
                'street_number': getattr(addr, 'street_number', None),
                'address_line1': getattr(addr, 'address_line1', None),
                'address_line2': getattr(addr, 'address_line2', None),
                'city': getattr(addr, 'city', None),
                'region': getattr(addr, 'region', None),
                'postal_code': getattr(addr, 'postal_code', None),
                'country_name': country_name,
            }
        except Exception:
            return None

    def get_can_update_status(self, obj):
        """Seller UX helper.

        Sellers can update overall order status only when the whole order
        belongs to their store (all lines are their products).
        """
        request = self.context.get('request') if hasattr(self, 'context') else None
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False):
            return False
        if getattr(user, 'user_type', None) != 'seller':
            return False

        try:
            seller_id = int(getattr(user, 'id', 0) or 0)
            own, other, _total = self._seller_owned_counts(obj, seller_id)
            if own < 1:
                return False
            return other == 0
        except Exception:
            return False

    def get_is_multi_vendor(self, obj):
        request = self.context.get('request') if hasattr(self, 'context') else None
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False) or getattr(user, 'user_type', None) != 'seller':
            return False
        try:
            seller_id = int(getattr(user, 'id', 0) or 0)
            own, other, _total = self._seller_owned_counts(obj, seller_id)
            return own >= 1 and other > 0
        except Exception:
            return False

    def get_other_sellers_lines_count(self, obj):
        request = self.context.get('request') if hasattr(self, 'context') else None
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False) or getattr(user, 'user_type', None) != 'seller':
            return 0
        try:
            seller_id = int(getattr(user, 'id', 0) or 0)
            _own, other, _total = self._seller_owned_counts(obj, seller_id)
            return int(other)
        except Exception:
            return 0

    def get_total_lines_count(self, obj):
        try:
            return int(len(self._lines_list(obj)))
        except Exception:
            return 0
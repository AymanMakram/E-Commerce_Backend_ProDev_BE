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

    class Meta:
        model = OrderLine
        fields = ['id', 'product_name', 'sku', 'qty', 'price']


class ShopOrderSerializer(serializers.ModelSerializer):
    """
    المحول الرئيسي للطلب: يربط بيانات الطلب بمنتجاته وبحالته المالية.
    """
    # عرض قائمة المنتجات (OrderLines) المرتبطة بالطلب
    lines = OrderLineSerializer(many=True, read_only=True)
    
    # عرض اسم حالة الطلب (مثلاً: Shipped, Pending) بدلاً من الرقم
    status_display = serializers.ReadOnlyField(source='order_status.status')

    # Expose current status id for frontend dropdowns
    order_status_id = serializers.ReadOnlyField(source='order_status.id')
    
    # جلب حالة الدفع من تطبيق Finance (مثل: Paid, Pending)
    payment_status = serializers.SerializerMethodField()

    shipping_address_details = serializers.SerializerMethodField()
    customer_phone_number = serializers.SerializerMethodField()
    customer_username = serializers.ReadOnlyField(source='user.username')

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
            'lines',
            'order_status', # for update
        ]

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
            return "No Payment Record"
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
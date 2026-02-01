from rest_framework import serializers
from .models import ShopOrder, OrderLine
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
    
    # جلب حالة الدفع من تطبيق Finance (مثل: Paid, Pending)
    payment_status = serializers.SerializerMethodField()

    class Meta:
        model = ShopOrder
        fields = [
            'id', 
            'order_date', 
            'order_total', 
            'status_display', 
            'payment_status', 
            'lines'
        ]

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
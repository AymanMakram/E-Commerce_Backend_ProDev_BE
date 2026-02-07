"""DRF serializers for cart APIs."""

from rest_framework import serializers
from .models import ShoppingCart, ShoppingCartItem


def _image_value_to_url(value, *, request=None):
    if not value:
        return ''

    raw = str(value)
    if raw.startswith('http://') or raw.startswith('https://'):
        return raw

    try:
        url = value.url
    except Exception:
        return raw

    if request is not None:
        try:
            return request.build_absolute_uri(url)
        except Exception:
            return url

    return url

class ShoppingCartItemSerializer(serializers.ModelSerializer):
    """Serializer for cart line items.

    Normalizes field names for the frontend (e.g., ``qty`` -> ``quantity``).
    """

    # 1. الأسماء: ربط مباشر لضمان ظهور اسم المنتج من خلال موديل المنتج الأساسي
    product_name = serializers.SerializerMethodField()
    
    # 2. الأسعار: سحب السعر من قطعة المنتج (ProductItem) ليتوافق مع الواجهة الأمامية
    price = serializers.SerializerMethodField()
    
    # 3. الصور: استخدام SerializerMethodField لمعالجة مسارات الصور المعقدة
    image = serializers.SerializerMethodField()
    
    # 4. الكمية: التحويل من 'qty' في الموديل إلى 'quantity' لطلب الـ Frontend
    quantity = serializers.IntegerField(source='qty', min_value=1)

    # 5. المخزون: expose SKU stock for UI limits
    stock = serializers.IntegerField(source='product_item.qty_in_stock', read_only=True)
    
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = ShoppingCartItem
        fields = [
            'id', 
            'product_item', 
            'product_name', 
            'image',    # مسمى موحد للصور
            'price',    # مسمى موحد للأسعار
            'stock',    # available stock for UI limits
            'quantity', # المسمى المطلوب في JavaScript
            'qty',      # المسمى الأصلي في قاعدة البيانات
            'subtotal'
        ]

    def validate(self, attrs):
        """Validate quantity against SKU stock and published product visibility."""
        # Determine product_item from incoming attrs or existing instance
        product_item = attrs.get('product_item')
        if product_item is None and getattr(self, 'instance', None) is not None:
            product_item = getattr(self.instance, 'product_item', None)

        # Determine desired quantity (qty is the model field, quantity maps to it)
        desired_qty = attrs.get('qty')
        if desired_qty is None and getattr(self, 'instance', None) is not None:
            desired_qty = getattr(self.instance, 'qty', None)

        try:
            desired_qty_int = int(desired_qty)
        except Exception:
            desired_qty_int = None

        if desired_qty_int is not None and desired_qty_int < 1:
            raise serializers.ValidationError({'quantity': 'Quantity must be at least 1.'})

        if product_item is None:
            return attrs

        # Do not allow adding unpublished products to carts.
        try:
            product = getattr(product_item, 'product', None)
            if product is not None and hasattr(product, 'is_published') and not bool(product.is_published):
                raise serializers.ValidationError({'product_item': 'This product is not available.'})
        except serializers.ValidationError:
            raise
        except Exception:
            # If we cannot resolve product, don't block here.
            pass

        if desired_qty_int is not None:
            try:
                stock = int(getattr(product_item, 'qty_in_stock', 0) or 0)
            except Exception:
                stock = 0
            if desired_qty_int > stock:
                raise serializers.ValidationError({'quantity': f'Only {stock} item(s) available in stock.'})

        return attrs

    def get_product_name(self, obj):
        try:
            return obj.product_item.product.name
        except Exception:
            return "Unknown Product"

    def get_price(self, obj):
        try:
            return obj.product_item.price
        except Exception:
            return 0

    def get_image(self, obj):
        """
        تجلب رابط الصورة بالترتيب: 
        1. صورة القطعة (ProductItem) 
        2. صورة المنتج الأساسي (Product)
        3. صورة افتراضية إذا لم توجد صورة
        """
        try:
            # التحقق من وجود صورة في ProductItem أولاً
            image_field = None
            if obj.product_item.product_image:
                image_field = obj.product_item.product_image
            # إذا لم توجد، نأخذ صورة المنتج الأساسي
            elif obj.product_item.product.product_image:
                image_field = obj.product_item.product.product_image

            if image_field:
                request = self.context.get('request')
                return _image_value_to_url(image_field, request=request)
            else:
                # إرجاع صورة افتراضية إذا لم توجد صورة
                request = self.context.get('request')
                if request is not None:
                    return request.build_absolute_uri('/static/images/no-image.svg')
                return '/static/images/no-image.svg'
        except Exception:
            # في حالة الخطأ، نرجع الصورة الافتراضية
            request = self.context.get('request')
            if request is not None:
                return request.build_absolute_uri('/static/images/no-image.svg')
            return '/static/images/no-image.svg'

    def get_subtotal(self, obj):
        try:
            return obj.product_item.price * obj.qty
        except Exception:
            return 0

class ShoppingCartSerializer(serializers.ModelSerializer):
    """Serializer for the shopping cart including nested items."""

    # ربط عناصر السلة باستخدام السيرياليزر المعدل أعلاه
    items = ShoppingCartItemSerializer(many=True, read_only=True)
    total_price = serializers.SerializerMethodField()

    class Meta:
        model = ShoppingCart
        fields = ['id', 'user', 'items', 'total_price']

    def get_total_price(self, obj):
        try:
            return sum(item.subtotal for item in obj.items.all())
        except Exception:
            return 0
from rest_framework import serializers
from .models import ShoppingCart, ShoppingCartItem

class ShoppingCartItemSerializer(serializers.ModelSerializer):
    # 1. الأسماء: ربط مباشر لضمان ظهور اسم المنتج من خلال موديل المنتج الأساسي
    product_name = serializers.ReadOnlyField(source='product_item.product.name')
    
    # 2. الأسعار: سحب السعر من قطعة المنتج (ProductItem) ليتوافق مع الواجهة الأمامية
    price = serializers.ReadOnlyField(source='product_item.price')
    
    # 3. الصور: استخدام SerializerMethodField لمعالجة مسارات الصور المعقدة
    image = serializers.SerializerMethodField()
    
    # 4. الكمية: التحويل من 'qty' في الموديل إلى 'quantity' لطلب الـ Frontend
    quantity = serializers.IntegerField(source='qty', min_value=1)
    
    subtotal = serializers.ReadOnlyField()

    class Meta:
        model = ShoppingCartItem
        fields = [
            'id', 
            'product_item', 
            'product_name', 
            'image',    # مسمى موحد للصور
            'price',    # مسمى موحد للأسعار
            'quantity', # المسمى المطلوب في JavaScript
            'qty',      # المسمى الأصلي في قاعدة البيانات
            'subtotal'
        ]

    def get_image(self, obj):
        """
        تجلب رابط الصورة بالترتيب: 
        1. صورة القطعة (ProductItem) 
        2. صورة المنتج الأساسي (Product)
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
                if request is not None:
                    # بناء رابط كامل (Absolute URL) يحل مشكلة الـ 404 تماماً
                    return request.build_absolute_uri(image_field.url)
                # في حالة عدم وجود طلب، نرجع المسار النسبي كحل احتياطي
                return image_field.url
        except Exception:
            return None
        return None

class ShoppingCartSerializer(serializers.ModelSerializer):
    # ربط عناصر السلة باستخدام السيرياليزر المعدل أعلاه
    items = ShoppingCartItemSerializer(many=True, read_only=True)
    total_price = serializers.ReadOnlyField()

    class Meta:
        model = ShoppingCart
        fields = ['id', 'user', 'items', 'total_price']
from rest_framework import serializers
from .models import ProductCategory, Product, ProductItem, Variation, VariationOption, ProductConfiguration

class ProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = '__all__'

class VariationOptionSerializer(serializers.ModelSerializer):
    variation_name = serializers.ReadOnlyField(source='variation.name')

    class Meta:
        model = VariationOption
        fields = ['id', 'variation_name', 'value']

class ProductItemSerializer(serializers.ModelSerializer):
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(),
        write_only=True,
        required=False,
    )
    options = serializers.SerializerMethodField()

    class Meta:
        model = ProductItem
        fields = ['id', 'product', 'sku', 'qty_in_stock', 'price', 'product_image', 'options']

    def get_options(self, obj):
        configs = ProductConfiguration.objects.filter(product_item=obj)
        return VariationOptionSerializer([c.variation_option for c in configs], many=True).data

class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.ReadOnlyField(source='category.category_name')
    # إضافة اسم البائع للقراءة فقط لتحسين عرض البيانات
    seller_name = serializers.ReadOnlyField(source='seller.username')
    items = ProductItemSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        # أضفنا 'seller' و 'seller_name' و 'category' (للإدخال)
        fields = [
            'id', 'name', 'description', 'product_image', 
            'category', 'category_name', 'seller', 'seller_name', 'items'
        ]
        
        # أهم تعديل: جعل حقل الـ seller للقراءة فقط 
        # لكي يعتمد الـ API على المستخدم المسجل حالياً ولا يطلبه من المستخدم
        read_only_fields = ['seller']
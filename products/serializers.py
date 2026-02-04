"""Serializers for product catalog and variations."""

from rest_framework import serializers

from .models import ProductCategory, Product, ProductItem, Variation, VariationOption, ProductConfiguration


def _image_value_to_url(value, *, request=None):
    """Return a usable URL for an ImageField value.

    Our seeders may store absolute URLs (e.g. https://picsum.photos/...).
    Django's ImageField `url` property will prefix MEDIA_URL in that case,
    producing broken paths like /media/https%3A/... .

    This helper returns absolute URLs as-is and uses `.url` for real media files.
    """

    if not value:
        return None

    # `value` is typically an ImageFieldFile; its string form is the DB value.
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


class VariationSerializer(serializers.ModelSerializer):
    """Variation definition (e.g., Color, Size) tied to a category."""

    category_name = serializers.ReadOnlyField(source='category.category_name')

    class Meta:
        model = Variation
        fields = ['id', 'name', 'category', 'category_name']

class ProductCategorySerializer(serializers.ModelSerializer):
    """Product category serializer."""

    class Meta:
        model = ProductCategory
        fields = '__all__'

class VariationOptionSerializer(serializers.ModelSerializer):
    """Variation option value (e.g., Red, XL)."""

    variation_name = serializers.ReadOnlyField(source='variation.name')

    class Meta:
        model = VariationOption
        fields = ['id', 'variation_name', 'value']

class ProductItemSerializer(serializers.ModelSerializer):
    """SKU serializer.

    Exposes selected variation options via `options`.
    """

    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(),
        write_only=True,
        required=False,
    )
    product_image = serializers.SerializerMethodField()
    options = serializers.SerializerMethodField()

    class Meta:
        model = ProductItem
        fields = ['id', 'product', 'sku', 'qty_in_stock', 'price', 'product_image', 'options']

    def get_product_image(self, obj):
        request = self.context.get('request') if hasattr(self, 'context') else None
        return _image_value_to_url(obj.product_image, request=request)

    def get_options(self, obj):
        # Prefer prefetched reverse relation to avoid N+1 queries.
        configs = getattr(obj, 'configurations', None)
        if configs is not None:
            config_list = list(configs.all())
        else:
            config_list = list(ProductConfiguration.objects.filter(product_item=obj).select_related('variation_option', 'variation_option__variation'))

        return VariationOptionSerializer([c.variation_option for c in config_list], many=True).data

class ProductSerializer(serializers.ModelSerializer):
    """Product serializer with nested SKUs."""

    category_name = serializers.ReadOnlyField(source='category.category_name')
    # إضافة اسم البائع للقراءة فقط لتحسين عرض البيانات
    seller_name = serializers.ReadOnlyField(source='seller.username')
    product_image = serializers.SerializerMethodField()
    items = ProductItemSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        # أضفنا 'seller' و 'seller_name' و 'category' (للإدخال)
        fields = [
            'id', 'name', 'description', 'product_image',
            'is_published',
            'category', 'category_name', 'seller', 'seller_name', 'items'
        ]
        
        # أهم تعديل: جعل حقل الـ seller للقراءة فقط 
        # لكي يعتمد الـ API على المستخدم المسجل حالياً ولا يطلبه من المستخدم
        read_only_fields = ['seller']

    def get_product_image(self, obj):
        request = self.context.get('request') if hasattr(self, 'context') else None
        return _image_value_to_url(obj.product_image, request=request)
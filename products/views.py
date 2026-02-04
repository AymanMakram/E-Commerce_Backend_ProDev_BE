from rest_framework import viewsets, filters, permissions, status
from rest_framework.response import Response
from .models import Product, ProductCategory, ProductItem
from .serializers import ProductSerializer, ProductCategorySerializer, ProductItemSerializer
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination
from rest_framework import generics
from rest_framework.decorators import action

# 2. تعريف كلاس التحكم في العدد (Pagination)
class StandardResultsSetPagination(PageNumberPagination):
    page_size = 20 # الرقم اللي اتفقنا عليه كـ Best Practice
    page_size_query_param = 'page_size'
    max_page_size = 100

# 3. الـ View اللي بيربط كل حاجة ببعض
class ProductListView(generics.ListAPIView):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    # هنا بنربط الـ View بالكلاس اللي فوق عشان يطبق القواعد بتاعته
    pagination_class = StandardResultsSetPagination


# 2. نظام صلاحيات مخصص (يُفضل وضعه في ملف permissions.py أو هنا مؤقتاً)
class IsSellerOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        # القراءة مسموحة للكل (GET, HEAD, OPTIONS)
        if request.method in permissions.SAFE_METHODS:
            return True
        # الكتابة مسموحة فقط لمن نوعه seller ومسجل دخول
        return request.user.is_authenticated and request.user.user_type == 'seller'

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        # البائع يعدل منتجاته هو فقط
        return obj.seller == request.user

# 3. محول المنتجات المحدث
class ProductViewSet(viewsets.ModelViewSet): # تم تغييرها من ReadOnly لـ ModelViewSet للسماح بالـ POST
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    pagination_class = StandardResultsSetPagination
    
    # دمج الفلاتر والبحث والترتيب
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'seller'] # أضفنا الفلترة حسب البائع أيضاً
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'price'] # أضفنا الترتيب حسب السعر لو احتجته

    # إضافة الصلاحيات
    permission_classes = [IsSellerOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and getattr(user, 'user_type', None) == 'seller':
            return Product.objects.filter(seller=user)
        return Product.objects.filter(is_published=True)

    def perform_create(self, serializer):
        # أهم خطوة: ربط المنتج بالبائع اللي عامل login حالياً تلقائياً
        serializer.save(seller=self.request.user)

# 4. محول التصنيفات (كما هو)
class ProductCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ProductCategory.objects.order_by('category_name')
    serializer_class = ProductCategorySerializer


class IsSellerOrReadOnlyForProductItem(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_authenticated and request.user.user_type == 'seller'

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.product.seller == request.user


class ProductItemViewSet(viewsets.ModelViewSet):
    serializer_class = ProductItemSerializer
    permission_classes = [IsSellerOrReadOnlyForProductItem]

    def get_queryset(self):
        qs = ProductItem.objects.select_related('product', 'product__seller').all().order_by('id')

        product_id = self.request.query_params.get('product')
        if product_id:
            qs = qs.filter(product_id=product_id)

        if self.request.user.is_authenticated and getattr(self.request.user, 'user_type', None) == 'seller':
            return qs.filter(product__seller=self.request.user)

        # Non-seller: allow read-only discovery but never leak draft items if you later add those fields.
        return qs

    def create(self, request, *args, **kwargs):
        if not (request.user.is_authenticated and getattr(request.user, 'user_type', None) == 'seller'):
            return Response({'detail': 'Seller authentication required.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product = serializer.validated_data.get('product')
        if not product:
            return Response({'product': ['This field is required.']}, status=status.HTTP_400_BAD_REQUEST)

        if product.seller_id != request.user.id:
            return Response({'detail': 'You can only add items to your own products.'}, status=status.HTTP_403_FORBIDDEN)

        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        # Product is included in serializer validated data
        serializer.save()

    @action(detail=True, methods=['put'], url_path='options')
    def set_options(self, request, pk=None):
        """Seller-only: replace the ProductConfiguration options for this SKU."""
        user = request.user
        if not (user.is_authenticated and getattr(user, 'user_type', None) == 'seller'):
            return Response({'detail': 'Seller authentication required.'}, status=status.HTTP_403_FORBIDDEN)

        item = self.get_object()  # already seller-filtered by get_queryset

        option_ids = request.data.get('variation_option_ids')
        if option_ids is None:
            option_ids = request.data.get('options')
        if option_ids is None:
            option_ids = []

        if not isinstance(option_ids, list):
            return Response({'detail': 'variation_option_ids must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate options belong to the same category as the product
        from .models import VariationOption, ProductConfiguration

        unique_ids = []
        seen = set()
        for raw in option_ids:
            try:
                oid = int(raw)
            except Exception:
                continue
            if oid in seen:
                continue
            seen.add(oid)
            unique_ids.append(oid)

        options = list(VariationOption.objects.select_related('variation', 'variation__category').filter(id__in=unique_ids))
        if len(options) != len(unique_ids):
            return Response({'detail': 'One or more variation options are invalid.'}, status=status.HTTP_400_BAD_REQUEST)

        product_category_id = getattr(item.product, 'category_id', None)
        for opt in options:
            if getattr(opt.variation, 'category_id', None) != product_category_id:
                return Response({'detail': 'Variation option does not match product category.'}, status=status.HTTP_400_BAD_REQUEST)

        # Replace configs
        ProductConfiguration.objects.filter(product_item=item).delete()
        ProductConfiguration.objects.bulk_create([
            ProductConfiguration(product_item=item, variation_option=opt) for opt in options
        ])

        item.refresh_from_db()
        return Response(self.get_serializer(item).data)
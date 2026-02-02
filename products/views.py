from rest_framework import viewsets, filters, permissions
from .models import Product, ProductCategory
from .serializers import ProductSerializer, ProductCategorySerializer
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination
from rest_framework import generics

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

    def perform_create(self, serializer):
        # أهم خطوة: ربط المنتج بالبائع اللي عامل login حالياً تلقائياً
        serializer.save(seller=self.request.user)

# 4. محول التصنيفات (كما هو)
class ProductCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ProductCategory.objects.order_by('category_name')
    serializer_class = ProductCategorySerializer
from django.shortcuts import render # إضافة render لعرض الصفحات
from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from .models import User, Address, UserAddress, UserPaymentMethod
from .serializers import UserProfileSerializer, AddressSerializer, RegisterSerializer, UserPaymentMethodSerializer

def login_page(request):
    """عرض صفحة تسجيل الدخول"""
    return render(request, 'auth/login.html')

def register_page(request):
    return render(request, 'auth/register.html')
# 1. كلاس التسجيل (الذي كان يسبب الخطأ)
class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

# 2. كلاس إدارة البروفايل والعناوين والدفع
class UserProfileViewSet(viewsets.GenericViewSet):
    """
    إدارة شاملة للمستخدم: الملف الشخصي، العناوين، وطرق الدفع
    """
    permission_classes = [IsAuthenticated]
    serializer_class = UserProfileSerializer

    @action(detail=False, methods=['get', 'put'])
    def me(self, request):
        user = request.user
        if request.method == 'GET':
            serializer = self.get_serializer(user)
            return Response(serializer.data)
        
        serializer = self.get_serializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='add-address')
    def add_address(self, request):
        serializer = AddressSerializer(data=request.data)
        if serializer.is_valid():
            address = serializer.save()
            UserAddress.objects.create(
                user=request.user,
                address=address,
                is_default=request.data.get('is_default', False)
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get', 'post'], url_path='payment-methods')
    def payment_methods(self, request):
        if request.method == 'GET':
            payments = UserPaymentMethod.objects.filter(user=request.user)
            serializer = UserPaymentMethodSerializer(payments, many=True)
            return Response(serializer.data)

        if request.method == 'POST':
            serializer = UserPaymentMethodSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(user=request.user)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
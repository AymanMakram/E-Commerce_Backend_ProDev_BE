from rest_framework.decorators import api_view, action
from rest_framework.response import Response
from .models import PaymentType, Country, User, Address, UserAddress, UserPaymentMethod
from .serializers import PaymentTypeSerializer, CountrySerializer, UserProfileSerializer, AddressSerializer, RegisterSerializer, UserPaymentMethodSerializer

# Endpoint to list all payment types
@api_view(['GET'])
def payment_type_list(request):
    types = PaymentType.objects.all()
    serializer = PaymentTypeSerializer(types, many=True)
    return Response(serializer.data)
# Endpoint to list all countries
@api_view(['GET'])
def country_list(request):
    countries = Country.objects.all()
    serializer = CountrySerializer(countries, many=True)
    return Response(serializer.data)
from django.shortcuts import render # إضافة render لعرض الصفحات
from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from .models import User, Address, UserAddress, UserPaymentMethod
from .serializers import UserProfileSerializer, AddressSerializer, RegisterSerializer, UserPaymentMethodSerializer

from django.contrib.auth import authenticate, login
from django.shortcuts import redirect

def login_page(request):
    """عرض صفحة تسجيل الدخول مع دعم تسجيل الدخول بجلسة Django"""
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            # Redirect based on user type
            if hasattr(user, 'user_type') and user.user_type == 'seller':
                return redirect('/seller/')
            else:
                return redirect('/products/')
        else:
            return render(request, 'auth/login.html', {'login_error': 'بيانات الدخول غير صحيحة'})
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
            is_default = bool(request.data.get('is_default', False))
            if is_default:
                UserAddress.objects.filter(user=request.user).update(is_default=False)
            # If it's the first address, make it default automatically.
            if not UserAddress.objects.filter(user=request.user).exists():
                is_default = True
            UserAddress.objects.create(user=request.user, address=address, is_default=is_default)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['put', 'patch', 'delete'], url_path='addresses/(?P<address_id>[^/.]+)')
    def address_detail(self, request, address_id=None):
        """Update/Delete an address owned by the current user."""
        ua = UserAddress.objects.filter(user=request.user, address_id=address_id).select_related('address').first()
        if not ua:
            return Response({'detail': 'Address not found.'}, status=status.HTTP_404_NOT_FOUND)

        if request.method == 'DELETE':
            was_default = ua.is_default
            ua.address.delete()
            # If we deleted the default address, promote another address (if any).
            if was_default:
                next_ua = UserAddress.objects.filter(user=request.user).first()
                if next_ua:
                    next_ua.is_default = True
                    next_ua.save(update_fields=['is_default'])
            return Response(status=status.HTTP_204_NO_CONTENT)

        serializer = AddressSerializer(ua.address, data=request.data, partial=(request.method == 'PATCH'))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=False, methods=['patch'], url_path='addresses/(?P<address_id>[^/.]+)/set-default')
    def set_default_address(self, request, address_id=None):
        ua = UserAddress.objects.filter(user=request.user, address_id=address_id).first()
        if not ua:
            return Response({'detail': 'Address not found.'}, status=status.HTTP_404_NOT_FOUND)

        UserAddress.objects.filter(user=request.user).update(is_default=False)
        ua.is_default = True
        ua.save(update_fields=['is_default'])
        return Response({'detail': 'Default address updated.'})

    @action(detail=False, methods=['get', 'post'], url_path='payment-methods')
    def payment_methods(self, request):
        if request.method == 'GET':
            payments = UserPaymentMethod.objects.filter(user=request.user)
            serializer = UserPaymentMethodSerializer(payments, many=True)
            return Response(serializer.data)

        if request.method == 'POST':
            serializer = UserPaymentMethodSerializer(data=request.data, context={'user': request.user})
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['put', 'patch', 'delete'], url_path='payment-methods/(?P<payment_id>[^/.]+)')
    def payment_method_detail(self, request, payment_id=None):
        payment = UserPaymentMethod.objects.filter(user=request.user, id=payment_id).first()
        if not payment:
            return Response({'detail': 'Payment method not found.'}, status=status.HTTP_404_NOT_FOUND)

        if request.method == 'DELETE':
            was_default = payment.is_default
            payment.delete()
            if was_default:
                next_pm = UserPaymentMethod.objects.filter(user=request.user).first()
                if next_pm:
                    next_pm.is_default = True
                    next_pm.save(update_fields=['is_default'])
            return Response(status=status.HTTP_204_NO_CONTENT)

        serializer = UserPaymentMethodSerializer(payment, data=request.data, partial=(request.method == 'PATCH'), context={'user': request.user})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=False, methods=['patch'], url_path='payment-methods/(?P<payment_id>[^/.]+)/set-default')
    def set_default_payment_method(self, request, payment_id=None):
        payment = UserPaymentMethod.objects.filter(user=request.user, id=payment_id).first()
        if not payment:
            return Response({'detail': 'Payment method not found.'}, status=status.HTTP_404_NOT_FOUND)

        UserPaymentMethod.objects.filter(user=request.user).update(is_default=False)
        payment.is_default = True
        payment.save(update_fields=['is_default'])
        return Response({'detail': 'Default payment method updated.'})
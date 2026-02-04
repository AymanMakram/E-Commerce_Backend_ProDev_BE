"""Accounts app views.

Contains:
- Lightweight HTML entry pages (login/register)
- Auth-related API endpoints (register)
- Customer profile APIs (addresses & payment methods)
- Reference data APIs (countries, payment types)

Kept intentionally simple and DRF-native.
"""

from django.contrib.auth import authenticate, login
from django.shortcuts import redirect, render

from rest_framework import generics, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Country, PaymentType, SellerProfile, UserAddress, UserPaymentMethod
from .serializers import (
    AddressSerializer,
    CountrySerializer,
    PaymentTypeSerializer,
    RegisterSerializer,
    UserPaymentMethodSerializer,
    UserProfileSerializer,
)

def login_page(request):
    """Render login page (HTML) and support Django session login.

    Note: API authentication is handled via JWT under /api/accounts/login/.
    """
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


class SessionTokenObtainPairView(TokenObtainPairView):
    """JWT login that also establishes a Django session.

    The frontend navigates to server-rendered pages (e.g. `/seller/`) that are
    protected with `login_required`, which relies on Django's session auth.
    SimpleJWT's default `TokenObtainPairView` does not create a session.
    """

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = getattr(serializer, 'user', None)
        if user is not None and getattr(user, 'is_active', True):
            # DRF wraps the underlying Django HttpRequest at request._request.
            login(request._request, user)

        return Response(serializer.validated_data, status=status.HTTP_200_OK)

def register_page(request):
    """Render register page (HTML)."""
    return render(request, 'auth/register.html')


@api_view(['GET'])
def payment_type_list(request):
    """List payment types used by profile/payment-method forms."""
    types = PaymentType.objects.all().order_by('id')
    return Response(PaymentTypeSerializer(types, many=True).data)


@api_view(['GET'])
def country_list(request):
    """List supported countries for address forms."""
    countries = Country.objects.all().order_by('id')
    return Response(CountrySerializer(countries, many=True).data)
# 1. كلاس التسجيل (الذي كان يسبب الخطأ)
class RegisterView(generics.CreateAPIView):
    """Public registration endpoint."""
    queryset = RegisterSerializer.Meta.model.objects.all()
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

# 2. كلاس إدارة البروفايل والعناوين والدفع
class UserProfileViewSet(viewsets.GenericViewSet):
    """Authenticated profile management.

    - Customers: manage addresses and payment methods.
    - Sellers: can update seller profile fields (store_name, tax_number) through `me`.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = UserProfileSerializer

    def _deny_seller_customer_profile(self, request):
        """Block customer-only features for seller users."""
        if getattr(request.user, 'user_type', None) == 'seller':
            raise PermissionDenied('Customer profile features are not available for sellers.')

    @action(detail=False, methods=['get', 'put'])
    def me(self, request):
        """Get or update the authenticated user's profile."""
        user = request.user
        if request.method == 'GET':
            serializer = self.get_serializer(user)
            return Response(serializer.data)
        
        serializer = self.get_serializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Seller-only settings stored on SellerProfile
        if getattr(user, 'user_type', None) == 'seller':
            store_name = request.data.get('store_name', None)
            tax_number = request.data.get('tax_number', None)
            if store_name is not None or tax_number is not None:
                sp, _ = SellerProfile.objects.get_or_create(user=user)
                if store_name is not None:
                    s = str(store_name).strip()
                    sp.store_name = s or None
                if tax_number is not None:
                    t = str(tax_number).strip()
                    sp.tax_number = t or None
                sp.save()

        user.refresh_from_db()
        return Response(self.get_serializer(user).data)

    @action(detail=False, methods=['post'], url_path='add-address')
    def add_address(self, request):
        """Customer-only: add a new address and optionally set it as default."""
        self._deny_seller_customer_profile(request)
        serializer = AddressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        address = serializer.save()
        is_default = bool(request.data.get('is_default', False))
        if is_default:
            UserAddress.objects.filter(user=request.user).update(is_default=False)
        # If it's the first address, make it default automatically.
        if not UserAddress.objects.filter(user=request.user).exists():
            is_default = True
        UserAddress.objects.create(user=request.user, address=address, is_default=is_default)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['put', 'patch', 'delete'], url_path='addresses/(?P<address_id>[^/.]+)')
    def address_detail(self, request, address_id=None):
        """Update/Delete an address owned by the current user."""
        self._deny_seller_customer_profile(request)
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
        """Customer-only: set a specific address as default."""
        self._deny_seller_customer_profile(request)
        ua = UserAddress.objects.filter(user=request.user, address_id=address_id).first()
        if not ua:
            return Response({'detail': 'Address not found.'}, status=status.HTTP_404_NOT_FOUND)

        UserAddress.objects.filter(user=request.user).update(is_default=False)
        ua.is_default = True
        ua.save(update_fields=['is_default'])
        return Response({'detail': 'Default address updated.'})

    @action(detail=False, methods=['get', 'post'], url_path='payment-methods')
    def payment_methods(self, request):
        """Customer-only: list or create payment methods."""
        self._deny_seller_customer_profile(request)
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
        """Customer-only: update or delete a payment method owned by the user."""
        self._deny_seller_customer_profile(request)
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
        """Customer-only: set a specific payment method as default."""
        self._deny_seller_customer_profile(request)
        payment = UserPaymentMethod.objects.filter(user=request.user, id=payment_id).first()
        if not payment:
            return Response({'detail': 'Payment method not found.'}, status=status.HTTP_404_NOT_FOUND)

        UserPaymentMethod.objects.filter(user=request.user).update(is_default=False)
        payment.is_default = True
        payment.save(update_fields=['is_default'])
        return Response({'detail': 'Default payment method updated.'})
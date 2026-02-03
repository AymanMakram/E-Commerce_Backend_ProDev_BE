from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, AllowAny
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.authentication import SessionAuthentication, BasicAuthentication
from .models import ShoppingCart, ShoppingCartItem
from .serializers import ShoppingCartSerializer, ShoppingCartItemSerializer

class CSRFExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return None

class CartViewSet(viewsets.ModelViewSet):
    serializer_class = ShoppingCartSerializer
    permission_classes = [AllowAny]
    authentication_classes = [CSRFExemptSessionAuthentication, JWTAuthentication, BasicAuthentication]

    def get_queryset(self):
        if self.request.user.is_authenticated:
            return ShoppingCart.objects.filter(user=self.request.user)
        else:
            return ShoppingCart.objects.filter(user__isnull=True, session_id=self.request.session.session_key)

    def list(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            cart, _ = ShoppingCart.objects.get_or_create(user=request.user, defaults={'session_id': None})
            if cart.session_id:
                cart.session_id = None
                cart.save(update_fields=['session_id'])
        else:
            session_key = request.session.session_key
            if not session_key:
                request.session.create()
                session_key = request.session.session_key
            cart, _ = ShoppingCart.objects.get_or_create(user=None, session_id=session_key)
        serializer = self.get_serializer(cart)
        return Response(serializer.data)

def cart_detail(request):
    return render(request, 'cart/cart_detail.html')

class CartItemViewSet(viewsets.ModelViewSet):
    serializer_class = ShoppingCartItemSerializer
    permission_classes = [AllowAny]
    authentication_classes = [CSRFExemptSessionAuthentication, JWTAuthentication, BasicAuthentication]

    def get_queryset(self):
        if self.request.user.is_authenticated:
            return ShoppingCartItem.objects.filter(cart__user=self.request.user)
        else:
            return ShoppingCartItem.objects.filter(cart__user__isnull=True, cart__session_id=self.request.session.session_key)

    def create(self, request, *args, **kwargs):
        try:
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            
            if request.user.is_authenticated:
                cart, _ = ShoppingCart.objects.get_or_create(user=request.user, defaults={'session_id': None})
                if cart.session_id:
                    cart.session_id = None
                    cart.save(update_fields=['session_id'])
            else:
                session_key = request.session.session_key
                if not session_key:
                    request.session.create()
                    session_key = request.session.session_key
                cart, _ = ShoppingCart.objects.get_or_create(user=None, session_id=session_key)
            product_item = serializer.validated_data.get('product_item')
            quantity = int(request.data.get('quantity', 1))

            # دمج المنتج إذا كان موجوداً
            cart_item, created = ShoppingCartItem.objects.get_or_create(
                cart=cart, 
                product_item=product_item,
                defaults={'qty': quantity}
            )

            if not created:
                cart_item.qty += quantity
                cart_item.save()

            result_serializer = self.get_serializer(cart_item)
            return Response(result_serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            print("Error in create:", e)
            return Response({'error': str(e)}, status=400)

    def perform_update(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        instance.delete()
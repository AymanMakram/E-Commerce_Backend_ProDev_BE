from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication, BasicAuthentication
from .models import ShoppingCart, ShoppingCartItem
from .serializers import ShoppingCartSerializer, ShoppingCartItemSerializer

class CSRFExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return None

class CartViewSet(viewsets.ModelViewSet):
    serializer_class = ShoppingCartSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [CSRFExemptSessionAuthentication, BasicAuthentication]

    def get_queryset(self):
        return ShoppingCart.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        cart, _ = ShoppingCart.objects.get_or_create(user=request.user)
        serializer = self.get_serializer(cart)
        return Response(serializer.data)

def cart_detail(request):
    return render(request, 'cart/cart_detail.html')

class CartItemViewSet(viewsets.ModelViewSet):
    serializer_class = ShoppingCartItemSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [CSRFExemptSessionAuthentication, BasicAuthentication]

    def get_queryset(self):
        return ShoppingCartItem.objects.filter(cart__user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        cart, _ = ShoppingCart.objects.get_or_create(user=self.request.user)
        product_item = serializer.validated_data.get('product_item')
        quantity = int(request.data.get('qty', 1))

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

    def perform_update(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        instance.delete()
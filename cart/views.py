"""Cart APIs and HTML view.

Supports authenticated carts (user) and guest carts (session_id).
"""

from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.authentication import SessionAuthentication, BasicAuthentication
from django.db import transaction
from .models import ShoppingCart, ShoppingCartItem
from .serializers import ShoppingCartSerializer, ShoppingCartItemSerializer

class CartViewSet(viewsets.ModelViewSet):
    """Cart API.

    - Authenticated users: cart is stored via ``user``.
    - Anonymous users: cart is stored via Django session key.
    """

    serializer_class = ShoppingCartSerializer
    permission_classes = [AllowAny]
    # SessionAuthentication enforces CSRF; our frontend sends X-CSRFToken via frontend/frontend/js/api.js.
    authentication_classes = [SessionAuthentication, JWTAuthentication, BasicAuthentication]

    def initial(self, request, *args, **kwargs):
        """Deny seller accounts from using customer cart endpoints."""
        super().initial(request, *args, **kwargs)
        if request.user.is_authenticated and getattr(request.user, 'user_type', None) == 'seller':
            raise PermissionDenied('Sellers cannot use the customer cart.')

    def get_queryset(self):
        """Return cart queryset scoped to the current user/session."""
        if self.request.user.is_authenticated:
            return ShoppingCart.objects.filter(user=self.request.user)
        else:
            return ShoppingCart.objects.filter(user__isnull=True, session_id=self.request.session.session_key)

    def list(self, request, *args, **kwargs):
        """Return a single cart representation (create if missing)."""
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
    """Render the cart HTML page."""
    return render(request, 'cart/cart_detail.html')

class CartItemViewSet(viewsets.ModelViewSet):
    """Cart item API for adding/updating/removing items from the cart."""

    serializer_class = ShoppingCartItemSerializer
    permission_classes = [AllowAny]
    authentication_classes = [SessionAuthentication, JWTAuthentication, BasicAuthentication]

    def initial(self, request, *args, **kwargs):
        """Deny seller accounts from using customer cart endpoints."""
        super().initial(request, *args, **kwargs)
        if request.user.is_authenticated and getattr(request.user, 'user_type', None) == 'seller':
            raise PermissionDenied('Sellers cannot use the customer cart.')

    def get_queryset(self):
        """Return cart items scoped to the current user/session."""
        if self.request.user.is_authenticated:
            return ShoppingCartItem.objects.filter(cart__user=self.request.user)
        else:
            return ShoppingCartItem.objects.filter(cart__user__isnull=True, cart__session_id=self.request.session.session_key)

    def create(self, request, *args, **kwargs):
        """Add an item to the cart, merging quantity if it already exists."""
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
        incoming_qty = int(serializer.validated_data.get('qty') or 1)

        # Merge with existing line, but do not exceed available stock.
        with transaction.atomic():
            cart_item = ShoppingCartItem.objects.select_for_update().filter(cart=cart, product_item=product_item).first()
            if cart_item is None:
                cart_item = ShoppingCartItem(cart=cart, product_item=product_item, qty=incoming_qty)
            else:
                cart_item.qty = int(cart_item.qty or 0) + incoming_qty

            # Re-run stock validation against the final quantity.
            final_serializer = self.get_serializer(cart_item, data={'quantity': cart_item.qty}, partial=True)
            final_serializer.is_valid(raise_exception=True)
            final_serializer.save()

        result_serializer = self.get_serializer(cart_item)
        return Response(result_serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """Update cart item quantity with stock validation."""
        instance = self.get_object()

        # Do not allow switching the product_item via update.
        if isinstance(request.data, dict) and 'product_item' in request.data:
            raise ValidationError({'product_item': 'Changing product_item is not allowed.'})

        serializer = self.get_serializer(instance, data=request.data, partial=False)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        """Partial update cart item (typically quantity) with stock validation."""
        instance = self.get_object()
        if isinstance(request.data, dict) and 'product_item' in request.data:
            raise ValidationError({'product_item': 'Changing product_item is not allowed.'})

        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def perform_update(self, serializer):
        """Persist item updates (e.g., quantity changes)."""
        serializer.save()

    def perform_destroy(self, instance):
        """Delete an item from the cart."""
        instance.delete()
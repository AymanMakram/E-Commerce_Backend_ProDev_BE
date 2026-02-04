"""Custom DRF permissions for the products app."""

from rest_framework import permissions


class IsSellerOrReadOnly(permissions.BasePermission):
    """Allow public reads; allow writes only for authenticated sellers.

    For object-level writes, only allow the product owner (seller).
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_authenticated and getattr(request.user, 'user_type', None) == 'seller'

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return getattr(obj, 'seller', None) == request.user


class IsSellerOrReadOnlyForProductItem(permissions.BasePermission):
    """Allow public reads; allow writes only for authenticated sellers.

    For object-level writes, only allow if the SKU belongs to the seller.
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_authenticated and getattr(request.user, 'user_type', None) == 'seller'

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        product = getattr(obj, 'product', None)
        return getattr(product, 'seller', None) == request.user

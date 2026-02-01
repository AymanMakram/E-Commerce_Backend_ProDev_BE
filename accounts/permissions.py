from rest_framework import permissions

class IsSeller(permissions.BasePermission):
    """
    تسمح فقط للمستخدمين من نوع seller بالقيام بالعمليات.
    """
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.user_type == 'seller'

class IsProductOwner(permissions.BasePermission):
    """
    تسمح للبائع بتعديل منتجاته الخاصة فقط.
    """
    def has_object_permission(self, request, view, obj):
        return obj.seller == request.user
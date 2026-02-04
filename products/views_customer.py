"""Customer-facing HTML views for product browsing."""

from django.shortcuts import render, redirect

def product_list_view(request):
    """Render the customer product list page.

    Sellers are redirected to the seller dashboard.
    """
    user = request.user
    if hasattr(user, 'user_type') and user.user_type == 'seller':
        return redirect('/seller/')
    return render(request, 'products/list.html')

def product_detail_view(request, product_id: int):
    """Render the customer product detail page.

    Sellers are redirected to the seller dashboard.
    """
    user = request.user
    if hasattr(user, 'user_type') and user.user_type == 'seller':
        return redirect('/seller/')
    return render(request, 'products/detail.html', {'product_id': product_id})

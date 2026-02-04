"""Seller-facing HTML views (server-side protected)."""

from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required

@login_required(login_url='/api/accounts/login-view/')
def seller_dashboard_view(request):
    """Render the seller dashboard.

    Non-seller users are redirected to the public products page.
    """
    user = request.user
    if not hasattr(user, 'user_type') or user.user_type != 'seller':
        return redirect('/products/')
    return render(request, 'products/seller_dashboard.html')


@login_required(login_url='/api/accounts/login-view/')
def seller_profile_view(request):
    """Render the seller profile page.

    Non-seller users are redirected to the public products page.
    """
    user = request.user
    if not hasattr(user, 'user_type') or user.user_type != 'seller':
        return redirect('/products/')
    return render(request, 'products/seller_profile.html')

from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from accounts.models import User

@login_required(login_url='/api/accounts/login-view/')
def seller_dashboard_view(request):
    user = request.user
    if not hasattr(user, 'user_type') or user.user_type != 'seller':
        return redirect('/products/')
    return render(request, 'products/seller_dashboard.html')

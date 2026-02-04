from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render


@login_required(login_url='/api/accounts/login-view/')
def seller_orders_view(request):
    user = request.user
    if not hasattr(user, 'user_type') or user.user_type != 'seller':
        return redirect('/products/')
    return render(request, 'orders/seller_orders.html')

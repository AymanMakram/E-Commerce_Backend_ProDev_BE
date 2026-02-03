from django.shortcuts import render, redirect

def product_list_view(request):
    user = request.user
    if hasattr(user, 'user_type') and user.user_type == 'seller':
        return redirect('/seller/')
    return render(request, 'products/list.html')

def product_detail_view(request, product_id: int):
    user = request.user
    if hasattr(user, 'user_type') and user.user_type == 'seller':
        return redirect('/seller/')
    return render(request, 'products/detail.html', {'product_id': product_id})

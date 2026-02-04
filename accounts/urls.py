"""URL routes for accounts APIs and HTML auth pages."""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from django.contrib.auth import views as auth_views
from .views import RegisterView, UserProfileViewSet, login_page, register_page, country_list, payment_type_list

router = DefaultRouter()
router.register(r'profile', UserProfileViewSet, basename='user-profile')

urlpatterns = [
    # واجهة المستخدم (HTML)
    path('login-view/', login_page, name='login_html'), 
    path('register-view/', register_page, name='register_html'),
    # 1. نظام التسجيل
    path('register/', RegisterView.as_view(), name='auth_register'),
    # Endpoint for payment types
    path('payment-types/', payment_type_list, name='payment_type_list'),

    # Endpoint for countries
    path('countries/', country_list, name='country_list'),

    # 2. نظام الدخول - هذا هو المسار الذي يجب أن ينادي عليه الـ JS
    # إذا كان هذا الملف مستدعى في الرئيسي تحت 'api/accounts/'
    # سيكون المسار الكامل: /api/accounts/login/
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Password reset (HTML) - uses console email backend in DEBUG
    path('password-reset/', auth_views.PasswordResetView.as_view(
        template_name='auth/password_reset_form.html',
        email_template_name='auth/password_reset_email.html',
        subject_template_name='auth/password_reset_subject.txt',
        success_url='/api/accounts/password-reset/done/',
    ), name='password_reset'),
    path('password-reset/done/', auth_views.PasswordResetDoneView.as_view(
        template_name='auth/password_reset_done.html'
    ), name='password_reset_done'),
    path('reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(
        template_name='auth/password_reset_confirm.html',
        success_url='/api/accounts/reset/done/',
    ), name='password_reset_confirm'),
    path('reset/done/', auth_views.PasswordResetCompleteView.as_view(
        template_name='auth/password_reset_complete.html'
    ), name='password_reset_complete'),

    # 3. روابط الـ ViewSet
    path('', include(router.urls)),
]
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from .views import RegisterView, UserProfileViewSet, login_page, register_page

router = DefaultRouter()
router.register(r'profile', UserProfileViewSet, basename='user-profile')

urlpatterns = [
    # واجهة المستخدم (HTML)
    path('login-view/', login_page, name='login_html'), 
    path('register-view/', register_page, name='register_html'),
    # 1. نظام التسجيل
    path('register/', RegisterView.as_view(), name='auth_register'),

    # 2. نظام الدخول - هذا هو المسار الذي يجب أن ينادي عليه الـ JS
    # إذا كان هذا الملف مستدعى في الرئيسي تحت 'api/accounts/'
    # سيكون المسار الكامل: /api/accounts/login/
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # 3. روابط الـ ViewSet
    path('', include(router.urls)),
]
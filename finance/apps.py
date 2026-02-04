"""Finance app configuration and signal registration."""

from django.apps import AppConfig

class FinanceConfig(AppConfig):
    """Django app config for finance; registers signal handlers."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'finance'

    def ready(self):
        import finance.signals  # تفعيل الربط عند تشغيل السيرفر
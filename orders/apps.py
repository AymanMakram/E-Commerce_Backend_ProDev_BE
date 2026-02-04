"""Orders app configuration and signal registration."""

from django.apps import AppConfig

class OrdersConfig(AppConfig):
    """Django app config for orders; registers signal handlers."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'orders'

    def ready(self):
        """Import signal handlers on app ready."""
        import orders.signals # استدعاء السينجل عند تشغيل التطبيق
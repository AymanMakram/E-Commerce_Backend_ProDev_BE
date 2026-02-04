"""Invoices app configuration and signal registration."""

from django.apps import AppConfig

class InvoicesConfig(AppConfig):
    """Django app config for invoices; registers signal handlers."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'invoices'

    def ready(self):
        import invoices.signals  # دي اللي بتشغل الماكينة أول ما السيرفر يقوم
"""DRF serializers for finance APIs."""

from rest_framework import serializers
from .models import Transaction, PaymentStatus

class TransactionSerializer(serializers.ModelSerializer):
    """Serializer for transactions.

    Exposes a human-readable payment status string.
    """

    status = serializers.ReadOnlyField(source='payment_status.status')

    class Meta:
        model = Transaction
        fields = ['id', 'order', 'amount', 'transaction_date', 'status']
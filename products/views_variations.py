from rest_framework import viewsets, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Variation, VariationOption
from .serializers import VariationSerializer, VariationOptionSerializer


class VariationViewSet(viewsets.ReadOnlyModelViewSet):
    """List variations; used by seller UI to configure SKU options."""

    queryset = Variation.objects.select_related('category').all().order_by('id')
    serializer_class = VariationSerializer
    permission_classes = [permissions.IsAuthenticated]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category']
    search_fields = ['name']
    ordering_fields = ['id', 'name']

    @action(detail=True, methods=['get'], url_path='options')
    def options(self, request, pk=None):
        variation = self.get_object()
        opts = VariationOption.objects.filter(variation=variation).order_by('value')
        return Response(VariationOptionSerializer(opts, many=True).data)

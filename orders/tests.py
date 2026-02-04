"""Orders app tests."""

from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import Country, Address, UserAddress, PaymentType, UserPaymentMethod
from cart.models import ShoppingCart, ShoppingCartItem
from orders.models import OrderStatus, ShopOrder
from products.models import ProductCategory, Product, ProductItem


@override_settings(ALLOWED_HOSTS=['testserver', 'localhost', '127.0.0.1'])
class OrderCheckoutSmokeTests(TestCase):
	"""Checkout smoke test covering minimal COD checkout prerequisites."""

	@classmethod
	def setUpTestData(cls):
		User = get_user_model()

		cls.customer = User.objects.create_user(
			username='test_customer',
			email='test_customer@example.com',
			password='12345678',
			user_type='customer',
		)

		cls.seller = User.objects.create_user(
			username='test_seller',
			email='test_seller@example.com',
			password='12345678',
			user_type='seller',
		)

		cls.country = Country.objects.create(country_name='Egypt')
		cls.address = Address.objects.create(
			unit_number='1',
			street_number='10',
			address_line1='Test Street',
			address_line2='',
			city='Cairo',
			region='Cairo',
			postal_code='12345',
			country=cls.country,
		)
		UserAddress.objects.create(user=cls.customer, address=cls.address, is_default=True)

		cls.cod_type = PaymentType.objects.create(value='Cash on Delivery')
		UserPaymentMethod.objects.create(
			user=cls.customer,
			payment_type=cls.cod_type,
			provider='Cash on Delivery',
			account_number='COD-0000',
			expiry_date=date(2099, 12, 31),
			is_default=True,
		)

		OrderStatus.objects.get_or_create(status='Pending')
		OrderStatus.objects.get_or_create(status='Completed')

		cls.category = ProductCategory.objects.create(category_name='TestCat')
		cls.product = Product.objects.create(
			seller=cls.seller,
			category=cls.category,
			name='TestProduct',
			description='Test',
		)
		cls.item = ProductItem.objects.create(
			product=cls.product,
			sku='TEST-SKU-1',
			qty_in_stock=100,
			price='10.00',
		)

	def test_create_order_cod_returns_201_and_clears_cart(self):
		cart, _ = ShoppingCart.objects.get_or_create(user=self.customer, defaults={'session_id': None})
		ShoppingCartItem.objects.get_or_create(cart=cart, product_item=self.item, defaults={'qty': 2})

		client = APIClient()
		client.force_authenticate(user=self.customer)

		res = client.post('/api/orders/', data={}, format='json')
		self.assertEqual(res.status_code, 201)

		# cart should be cleared
		cart.refresh_from_db()
		self.assertEqual(cart.items.count(), 0)

		# order should exist and be Pending for COD
		order_id = res.data.get('id')
		self.assertIsNotNone(order_id)
		order = ShopOrder.objects.get(id=order_id)
		self.assertEqual(order.user_id, self.customer.id)
		self.assertEqual(order.order_status.status, 'Pending')

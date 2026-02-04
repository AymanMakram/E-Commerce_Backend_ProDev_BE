"""Cart app tests."""

from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import Country, Address, UserAddress, PaymentType, UserPaymentMethod
from products.models import ProductCategory, Product, ProductItem


@override_settings(ALLOWED_HOSTS=['testserver', 'localhost', '127.0.0.1'])
class CartStockValidationTests(TestCase):
	@classmethod
	def setUpTestData(cls):
		User = get_user_model()
		cls.customer = User.objects.create_user(
			username='cart_customer',
			email='cart_customer@example.com',
			password='12345678',
			user_type='customer',
		)
		cls.seller = User.objects.create_user(
			username='cart_seller',
			email='cart_seller@example.com',
			password='12345678',
			user_type='seller',
		)

		# Minimal profile prerequisites (not strictly needed for cart, but keeps parity)
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

		cls.category = ProductCategory.objects.create(category_name='TestCat')
		cls.product = Product.objects.create(
			seller=cls.seller,
			category=cls.category,
			name='CartProduct',
			description='Test',
			is_published=True,
		)
		cls.item = ProductItem.objects.create(
			product=cls.product,
			sku='CART-SKU-1',
			qty_in_stock=2,
			price='10.00',
		)

	def test_cannot_add_more_than_stock(self):
		client = APIClient()
		client.force_authenticate(user=self.customer)
		res = client.post('/api/cart/cart-items/', data={'product_item': self.item.id, 'quantity': 3}, format='json')
		self.assertEqual(res.status_code, 400)

	def test_cannot_update_quantity_more_than_stock(self):
		client = APIClient()
		client.force_authenticate(user=self.customer)
		# add 1
		res1 = client.post('/api/cart/cart-items/', data={'product_item': self.item.id, 'quantity': 1}, format='json')
		self.assertEqual(res1.status_code, 201)
		item_id = res1.data.get('id')
		self.assertIsNotNone(item_id)

		# update to 3 (exceeds stock=2)
		res2 = client.patch(f'/api/cart/cart-items/{item_id}/', data={'quantity': 3}, format='json')
		self.assertEqual(res2.status_code, 400)

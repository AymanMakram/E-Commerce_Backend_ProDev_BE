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

		# stock should be decremented
		self.item.refresh_from_db()
		self.assertEqual(self.item.qty_in_stock, 98)

	def test_checkout_fails_when_insufficient_stock_and_cart_unchanged(self):
		self.item.qty_in_stock = 1
		self.item.save(update_fields=['qty_in_stock'])

		cart, _ = ShoppingCart.objects.get_or_create(user=self.customer, defaults={'session_id': None})
		ShoppingCartItem.objects.get_or_create(cart=cart, product_item=self.item, defaults={'qty': 2})

		client = APIClient()
		client.force_authenticate(user=self.customer)

		res = client.post('/api/orders/', data={}, format='json')
		self.assertEqual(res.status_code, 400)

		# cart should remain
		cart.refresh_from_db()
		self.assertEqual(cart.items.count(), 1)
		self.item.refresh_from_db()
		self.assertEqual(self.item.qty_in_stock, 1)

	def test_seller_cancelled_restores_stock_if_not_shipped(self):
		cart, _ = ShoppingCart.objects.get_or_create(user=self.customer, defaults={'session_id': None})
		ShoppingCartItem.objects.get_or_create(cart=cart, product_item=self.item, defaults={'qty': 3})

		client = APIClient()
		client.force_authenticate(user=self.customer)
		res = client.post('/api/orders/', data={}, format='json')
		self.assertEqual(res.status_code, 201)
		order = ShopOrder.objects.get(id=res.data.get('id'))

		# stock decreased
		self.item.refresh_from_db()
		stock_after_checkout = self.item.qty_in_stock
		self.assertEqual(stock_after_checkout, 97)

		# seller cancels
		cancelled, _ = OrderStatus.objects.get_or_create(status='Cancelled')
		seller_client = APIClient()
		seller_client.force_authenticate(user=self.seller)
		res2 = seller_client.patch(f'/api/orders/{order.id}/set-status/', data={'order_status': cancelled.id}, format='json')
		self.assertEqual(res2.status_code, 200)
		order.refresh_from_db()
		self.assertEqual(order.order_status.status, 'Cancelled')

		# stock restored
		self.item.refresh_from_db()
		self.assertEqual(self.item.qty_in_stock, 100)

	def test_multi_vendor_order_status_update_is_forbidden(self):
		User = get_user_model()
		other_seller = User.objects.create_user(
			username='test_seller_2',
			email='test_seller2@example.com',
			password='12345678',
			user_type='seller',
		)
		product2 = Product.objects.create(
			seller=other_seller,
			category=self.category,
			name='OtherProduct',
			description='Test',
		)
		item2 = ProductItem.objects.create(
			product=product2,
			sku='TEST-SKU-2',
			qty_in_stock=50,
			price='5.00',
		)

		cart, _ = ShoppingCart.objects.get_or_create(user=self.customer, defaults={'session_id': None})
		ShoppingCartItem.objects.get_or_create(cart=cart, product_item=self.item, defaults={'qty': 1})
		ShoppingCartItem.objects.get_or_create(cart=cart, product_item=item2, defaults={'qty': 1})

		client = APIClient()
		client.force_authenticate(user=self.customer)
		res = client.post('/api/orders/', data={}, format='json')
		self.assertEqual(res.status_code, 201)
		order = ShopOrder.objects.get(id=res.data.get('id'))

		cancelled, _ = OrderStatus.objects.get_or_create(status='Cancelled')
		seller_client = APIClient()
		seller_client.force_authenticate(user=self.seller)
		res2 = seller_client.patch(f'/api/orders/{order.id}/set-status/', data={'order_status': cancelled.id}, format='json')
		self.assertEqual(res2.status_code, 403)
		order.refresh_from_db()
		self.assertEqual(order.order_status.status, 'Pending')

	def test_multi_vendor_seller_can_update_own_line_only(self):
		User = get_user_model()
		other_seller = User.objects.create_user(
			username='test_seller_3',
			email='test_seller3@example.com',
			password='12345678',
			user_type='seller',
		)
		product2 = Product.objects.create(
			seller=other_seller,
			category=self.category,
			name='OtherProduct2',
			description='Test',
		)
		item2 = ProductItem.objects.create(
			product=product2,
			sku='TEST-SKU-3',
			qty_in_stock=50,
			price='5.00',
		)

		cart, _ = ShoppingCart.objects.get_or_create(user=self.customer, defaults={'session_id': None})
		ShoppingCartItem.objects.get_or_create(cart=cart, product_item=self.item, defaults={'qty': 1})
		ShoppingCartItem.objects.get_or_create(cart=cart, product_item=item2, defaults={'qty': 1})

		client = APIClient()
		client.force_authenticate(user=self.customer)
		res = client.post('/api/orders/', data={}, format='json')
		self.assertEqual(res.status_code, 201)
		order = ShopOrder.objects.get(id=res.data.get('id'))
		self.assertEqual(order.order_status.status, 'Pending')

		processing, _ = OrderStatus.objects.get_or_create(status='Processing')

		# Seller 1 updates their own line to Processing
		line_own = order.lines.get(product_item=self.item)
		seller_client = APIClient()
		seller_client.force_authenticate(user=self.seller)
		res2 = seller_client.patch(
			f'/api/orders/{order.id}/set-line-status/',
			data={'line_id': line_own.id, 'line_status': processing.id},
			format='json',
		)
		self.assertEqual(res2.status_code, 200)
		order.refresh_from_db()
		# One line processing, one pending => overall should be Processing
		self.assertEqual(order.order_status.status, 'Processing')

		# Seller 1 cannot update other seller's line
		line_other = order.lines.get(product_item=item2)
		res3 = seller_client.patch(
			f'/api/orders/{order.id}/set-line-status/',
			data={'line_id': line_other.id, 'line_status': processing.id},
			format='json',
		)
		self.assertEqual(res3.status_code, 403)

	def test_seller_orders_api_hides_other_sellers_lines(self):
		User = get_user_model()
		other_seller = User.objects.create_user(
			username='test_seller_4',
			email='test_seller4@example.com',
			password='12345678',
			user_type='seller',
		)
		product2 = Product.objects.create(
			seller=other_seller,
			category=self.category,
			name='OtherProduct3',
			description='Test',
		)
		item2 = ProductItem.objects.create(
			product=product2,
			sku='TEST-SKU-4',
			qty_in_stock=50,
			price='5.00',
		)

		cart, _ = ShoppingCart.objects.get_or_create(user=self.customer, defaults={'session_id': None})
		ShoppingCartItem.objects.get_or_create(cart=cart, product_item=self.item, defaults={'qty': 1})
		ShoppingCartItem.objects.get_or_create(cart=cart, product_item=item2, defaults={'qty': 1})

		client = APIClient()
		client.force_authenticate(user=self.customer)
		res = client.post('/api/orders/', data={}, format='json')
		self.assertEqual(res.status_code, 201)

		seller_client = APIClient()
		seller_client.force_authenticate(user=self.seller)
		res2 = seller_client.get('/api/orders/seller-orders/', format='json')
		self.assertEqual(res2.status_code, 200)
		data = res2.data
		results = data.get('results') if isinstance(data, dict) else data
		self.assertTrue(isinstance(results, list) and len(results) >= 1)

		# In mixed-vendor orders, seller should only see their own lines.
		mixed = None
		for o in results:
			if int(o.get('other_sellers_lines_count') or 0) > 0:
				mixed = o
				break
		self.assertIsNotNone(mixed)
		lines = mixed.get('lines') or []
		self.assertEqual(len(lines), 1)
		self.assertEqual(lines[0].get('sku'), 'TEST-SKU-1')

	def test_line_cancel_restores_only_that_sku_stock(self):
		User = get_user_model()
		other_seller = User.objects.create_user(
			username='test_seller_5',
			email='test_seller5@example.com',
			password='12345678',
			user_type='seller',
		)
		product2 = Product.objects.create(
			seller=other_seller,
			category=self.category,
			name='OtherProduct4',
			description='Test',
		)
		item2 = ProductItem.objects.create(
			product=product2,
			sku='TEST-SKU-5',
			qty_in_stock=50,
			price='5.00',
		)

		cancelled, _ = OrderStatus.objects.get_or_create(status='Cancelled')

		cart, _ = ShoppingCart.objects.get_or_create(user=self.customer, defaults={'session_id': None})
		ShoppingCartItem.objects.get_or_create(cart=cart, product_item=self.item, defaults={'qty': 2})
		ShoppingCartItem.objects.get_or_create(cart=cart, product_item=item2, defaults={'qty': 1})

		client = APIClient()
		client.force_authenticate(user=self.customer)
		res = client.post('/api/orders/', data={}, format='json')
		self.assertEqual(res.status_code, 201)
		order = ShopOrder.objects.get(id=res.data.get('id'))

		# stock decremented
		self.item.refresh_from_db()
		item2.refresh_from_db()
		self.assertEqual(self.item.qty_in_stock, 98)
		self.assertEqual(item2.qty_in_stock, 49)

		line_own = order.lines.get(product_item=self.item)
		seller_client = APIClient()
		seller_client.force_authenticate(user=self.seller)
		res2 = seller_client.patch(
			f'/api/orders/{order.id}/set-line-status/',
			data={'line_id': line_own.id, 'line_status': cancelled.id},
			format='json',
		)
		self.assertEqual(res2.status_code, 200)

		self.item.refresh_from_db()
		item2.refresh_from_db()
		# Only seller1 SKU restored
		self.assertEqual(self.item.qty_in_stock, 100)
		self.assertEqual(item2.qty_in_stock, 49)

	def test_set_status_syncs_line_status_and_timestamps(self):
		shipped, _ = OrderStatus.objects.get_or_create(status='Shipped')

		cart, _ = ShoppingCart.objects.get_or_create(user=self.customer, defaults={'session_id': None})
		ShoppingCartItem.objects.get_or_create(cart=cart, product_item=self.item, defaults={'qty': 1})

		client = APIClient()
		client.force_authenticate(user=self.customer)
		res = client.post('/api/orders/', data={}, format='json')
		self.assertEqual(res.status_code, 201)
		order = ShopOrder.objects.get(id=res.data.get('id'))

		seller_client = APIClient()
		seller_client.force_authenticate(user=self.seller)
		res2 = seller_client.patch(
			f'/api/orders/{order.id}/set-status/',
			data={'order_status': shipped.id},
			format='json',
		)
		self.assertEqual(res2.status_code, 200)
		order.refresh_from_db()
		self.assertEqual(order.order_status.status, 'Shipped')

		line = order.lines.first()
		self.assertIsNotNone(line)
		self.assertEqual(getattr(line.line_status, 'status', None), 'Shipped')
		self.assertIsNotNone(line.line_shipped_at)

	def test_partial_delivered_aggregates_to_shipped(self):
		User = get_user_model()
		other_seller = User.objects.create_user(
			username='test_seller_6',
			email='test_seller6@example.com',
			password='12345678',
			user_type='seller',
		)
		product2 = Product.objects.create(
			seller=other_seller,
			category=self.category,
			name='OtherProduct5',
			description='Test',
		)
		item2 = ProductItem.objects.create(
			product=product2,
			sku='TEST-SKU-6',
			qty_in_stock=50,
			price='5.00',
		)

		shipped, _ = OrderStatus.objects.get_or_create(status='Shipped')
		delivered, _ = OrderStatus.objects.get_or_create(status='Delivered')

		cart, _ = ShoppingCart.objects.get_or_create(user=self.customer, defaults={'session_id': None})
		ShoppingCartItem.objects.get_or_create(cart=cart, product_item=self.item, defaults={'qty': 1})
		ShoppingCartItem.objects.get_or_create(cart=cart, product_item=item2, defaults={'qty': 1})

		client = APIClient()
		client.force_authenticate(user=self.customer)
		res = client.post('/api/orders/', data={}, format='json')
		self.assertEqual(res.status_code, 201)
		order = ShopOrder.objects.get(id=res.data.get('id'))

		line_own = order.lines.get(product_item=self.item)
		seller_client = APIClient()
		seller_client.force_authenticate(user=self.seller)
		# pending -> shipped -> delivered
		res2 = seller_client.patch(
			f'/api/orders/{order.id}/set-line-status/',
			data={'line_id': line_own.id, 'line_status': shipped.id},
			format='json',
		)
		self.assertEqual(res2.status_code, 200)
		res3 = seller_client.patch(
			f'/api/orders/{order.id}/set-line-status/',
			data={'line_id': line_own.id, 'line_status': delivered.id},
			format='json',
		)
		self.assertEqual(res3.status_code, 200)
		order.refresh_from_db()
		# Other line still pending => overall should be Shipped (partial delivered)
		self.assertEqual(order.order_status.status, 'Shipped')

"""Serializers for the accounts app.

Includes:
- Registration with strong validation
- Profile aggregation (addresses + payment methods)
- Reference data (countries, payment types)
"""

import re
import phonenumbers
from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Address, Country, CustomerProfile, PaymentType, SellerProfile, UserAddress, UserPaymentMethod


User = get_user_model()


class PaymentTypeSerializer(serializers.ModelSerializer):
    """Payment type reference values."""

    class Meta:
        model = PaymentType
        fields = ['id', 'value']

# 1. محول الدول (Country)
class CountrySerializer(serializers.ModelSerializer):
    """Country reference values."""

    class Meta:
        model = Country
        fields = ['id', 'country_name']

# 2. محول العناوين (Address)
class AddressSerializer(serializers.ModelSerializer):
    """Address payload used for create/update."""

    class Meta:
        model = Address
        fields = [
            'id', 'unit_number', 'street_number', 'address_line1', 
            'address_line2', 'city', 'region', 'postal_code', 'country'
        ]

# 3. محول التسجيل (النسخة النهائية والمؤمنة بالكامل)
class RegisterSerializer(serializers.ModelSerializer):
    """Create a new user (customer or seller) with strong validation.

    Also creates the corresponding profile model based on ``user_type``.
    """

    password = serializers.CharField(write_only=True)
    user_type = serializers.ChoiceField(choices=User.USER_TYPE_CHOICES)
    
    # حقول إضافية (تم ضبطها لتكون مرنة في التعريف وصارمة في الـ Validation)
    store_name = serializers.CharField(required=False, allow_blank=True)
    tax_number = serializers.CharField(required=False, allow_blank=True)
    seller_phone = serializers.CharField(required=False, allow_blank=True)
    phone_number = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = (
            'username', 'password', 'email', 'user_type', 
            'store_name', 'tax_number', 'seller_phone', 'phone_number'
        )

    # --- بداية دوال الـ Validation القوي ---

    def validate_username(self, value):
        if not re.match(r'^[a-zA-Z0-9._]+$', value):
            raise serializers.ValidationError("اسم المستخدم يجب أن يحتوي على حروف وأرقام ونقطة أو شرطة سفلية فقط.")
        if len(value) < 4:
            raise serializers.ValidationError("اسم المستخدم يجب أن يكون 4 أحرف على الأقل.")
        return value

    def validate_email(self, value):
        email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_regex, value):
            raise serializers.ValidationError("يرجى إدخال بريد إلكتروني صحيح.")
        return value.lower().strip()

    #def _validate_egyptian_phone(self, phone, field_name):
    #    pattern = r'^01[0125][0-9]{8}$'
    #    if not phone or not re.match(pattern, phone):
    #        raise serializers.ValidationError({field_name: "يرجى إدخال رقم هاتف مصري صحيح (11 رقم)."})
    def _validate_global_phone(self, phone, field_name):
        if not phone:
            raise serializers.ValidationError({field_name: "رقم الهاتف مطلوب."})
    
        # 1. تنظيف الرقم: إزالة أي شيء ليس رقماً (مع الإبقاء على + في البداية فقط)
        # هذا يحول "+20 10-123" إلى "+2010123"
        phone_input = str(phone).strip()
        clean_phone = re.sub(r'(?<!^)\+|[^\d+]', '', phone_input)
    
        # 2. معالجة البداية: تحويل 00 إلى +
        if clean_phone.startswith('00'):
            clean_phone = '+' + clean_phone[2:]
        
        # 3. محاولة التحليل (Parsing)
        try:
            # إذا لم يبدأ بـ +، سنحاول معالجته كأنه رقم دولي بدون علامة
            if not clean_phone.startswith('+'):
                # سنفترض أن أول أرقام هي كود الدولة (مثلاً 2010...)
                # سنضيف + ونحاول
                parsed_phone = phonenumbers.parse('+' + clean_phone, None)
            else:
                parsed_phone = phonenumbers.parse(clean_phone, None)
    
            # 4. التحقق الفعلي
            if not phonenumbers.is_valid_number(parsed_phone):
                # إذا فشل التحقق، سنعطي المستخدم مثالاً للتوضيح
                raise ValueError
    
        except (phonenumbers.NumberParseException, ValueError):
            # هنا سنظهر للمستخدم الرقم الذي استلمه السيرفر لنعرف سبب المشكلة
            raise serializers.ValidationError({
                field_name: f"رقم الهاتف {phone_input} غير صحيح. يرجى إدخال كود الدولة (مثلاً +20 لمصر أو +233 لغانا)."
            })

    def validate(self, attrs):
        user_type = attrs.get('user_type')
        
        if user_type == 'seller':
            # 1. التحقق من اسم المتجر (إجباري)
            if not attrs.get('store_name') or not attrs.get('store_name').strip():
                raise serializers.ValidationError({"store_name": "اسم علامتك التجارية إلزامي للتجار."})
            
            # 2. التحقق من هاتف البائع (إجباري)
            s_phone = attrs.get('seller_phone')
            if not s_phone:
                raise serializers.ValidationError({"seller_phone": "رقم هاتف التواصل التجاري مطلوب."})
            self._validate_egyptian_phone(s_phone, "seller_phone")

            # 3. التحقق من الرقم الضريبي (إجباري و 9 أرقام)
            tax = attrs.get('tax_number')
            if not tax:
                raise serializers.ValidationError({"tax_number": "الرقم الضريبي إلزامي للتوثيق القانوني للمتجر."})
            if not tax.isdigit() or len(tax) != 9:
                raise serializers.ValidationError({"tax_number": "الرقم الضريبي يجب أن يتكون من 9 أرقام فقط."})

            # تنظيف حقول العميل في حالة التاجر
            attrs['phone_number'] = None 
            
        elif user_type == 'customer':
            # 1. التحقق من هاتف العميل (إجباري)
            c_phone = attrs.get('phone_number')
            if not c_phone:
                raise serializers.ValidationError({"phone_number": "رقم الهاتف الجوال مطلوب للمتسوق."})
            self._validate_egyptian_phone(c_phone, "phone_number")

            # تنظيف حقول التاجر في حالة العميل
            attrs['store_name'] = None
            attrs['tax_number'] = None
            attrs['seller_phone'] = None
            
        return attrs

    def create(self, validated_data):
        store_name = validated_data.pop('store_name', None)
        tax_number = validated_data.pop('tax_number', None)
        seller_phone = validated_data.pop('seller_phone', None)
        phone_number = validated_data.pop('phone_number', None)
        user_type = validated_data.get('user_type')

        user = User.objects.create_user(**validated_data)

        if user_type == 'seller':
            SellerProfile.objects.create(
                user=user, 
                store_name=store_name, 
                tax_number=tax_number
            )
            user.phone_number = seller_phone
        else:
            CustomerProfile.objects.create(
                user=user, 
                phone_number=phone_number
            )
            user.phone_number = phone_number
            
        user.save()
        return user

# 4. محول طرق الدفع (User Payment Method)
class UserPaymentMethodSerializer(serializers.ModelSerializer):
    """Serializer for user's saved payment methods."""

    payment_type_name = serializers.ReadOnlyField(source='payment_type.value')
    payment_status = serializers.SerializerMethodField()

    class Meta:
        model = UserPaymentMethod
        fields = [
            'id', 'payment_type', 'payment_type_name', 'provider', 
            'account_number', 'expiry_date', 'is_default', 'payment_status'
        ]

    def get_payment_status(self, obj):
        # For demo, infer status from payment type
        if hasattr(obj, 'payment_type') and obj.payment_type.value == 'Cash on Delivery':
            return 'Pending'
        return 'Success'

    def create(self, validated_data):
        payment_type = validated_data.get('payment_type')
        provider = validated_data.get('provider')
        account_number = validated_data.get('account_number')
        expiry_date = validated_data.get('expiry_date')
        is_default = validated_data.get('is_default', False)
        user = self.context.get('user') or validated_data.get('user')
        # Set payment status logic
        from finance.models import PaymentStatus
        status_name = 'Success'
        if payment_type.value == 'Cash on Delivery':
            status_name = 'Pending'
        status_obj, _ = PaymentStatus.objects.get_or_create(status=status_name)
        # Create payment method
        payment_method = UserPaymentMethod.objects.create(
            user=user,
            payment_type=payment_type,
            provider=provider,
            account_number=account_number,
            expiry_date=expiry_date,
            is_default=is_default
        )
        # Optionally, you can link status to a transaction if needed
        return payment_method

# 5. محول الملف الشخصي الكامل (User Profile)
class UserProfileSerializer(serializers.ModelSerializer):
    """Aggregated profile view.

    Includes addresses, payment methods, and seller metadata when applicable.
    """

    addresses = serializers.SerializerMethodField()
    payment_methods = UserPaymentMethodSerializer(many=True, read_only=True)
    store_name = serializers.SerializerMethodField()
    tax_number = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'phone_number', 'user_type', 'store_name', 'tax_number', 'addresses', 'payment_methods')
        read_only_fields = ('username', 'user_type')

    def get_store_name(self, obj):
        try:
            return getattr(obj.seller_profile, 'store_name', None)
        except Exception:
            return None

    def get_tax_number(self, obj):
        try:
            return getattr(obj.seller_profile, 'tax_number', None)
        except Exception:
            return None

    def get_addresses(self, obj):
        user_addresses = UserAddress.objects.filter(user=obj).select_related('address')
        results = []
        for ua in user_addresses:
            data = AddressSerializer(ua.address).data
            data['is_default'] = ua.is_default
            results.append(data)
        return results

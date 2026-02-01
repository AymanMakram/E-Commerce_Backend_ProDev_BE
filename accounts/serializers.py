import re
from rest_framework import serializers
from .models import (
    User, Address, UserAddress, Country, 
    UserPaymentMethod, PaymentType, SellerProfile, CustomerProfile
)
from django.contrib.auth import get_user_model

User = get_user_model()

# 1. محول الدول (Country)
class CountrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Country
        fields = ['id', 'country_name']

# 2. محول العناوين (Address)
class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = [
            'id', 'unit_number', 'street_number', 'address_line1', 
            'address_line2', 'city', 'region', 'postal_code', 'country'
        ]

# 3. محول التسجيل (النسخة النهائية والمؤمنة بالكامل)
class RegisterSerializer(serializers.ModelSerializer):
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

    def _validate_egyptian_phone(self, phone, field_name):
        pattern = r'^01[0125][0-9]{8}$'
        if not phone or not re.match(pattern, phone):
            raise serializers.ValidationError({field_name: "يرجى إدخال رقم هاتف مصري صحيح (11 رقم)."})

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
    payment_type_name = serializers.ReadOnlyField(source='payment_type.value')

    class Meta:
        model = UserPaymentMethod
        fields = [
            'id', 'payment_type', 'payment_type_name', 'provider', 
            'account_number', 'expiry_date', 'is_default'
        ]

# 5. محول الملف الشخصي الكامل (User Profile)
class UserProfileSerializer(serializers.ModelSerializer):
    addresses = serializers.SerializerMethodField()
    payment_methods = UserPaymentMethodSerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'phone_number', 'user_type', 'addresses', 'payment_methods')
        read_only_fields = ('username', 'user_type')

    def get_addresses(self, obj):
        user_addresses = UserAddress.objects.filter(user=obj)
        return AddressSerializer([ua.address for ua in user_addresses], many=True).data
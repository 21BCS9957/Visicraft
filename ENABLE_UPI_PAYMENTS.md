# Enable UPI and Other Payment Methods in Razorpay

## Why UPI is Not Showing

UPI and other payment methods need to be explicitly enabled in your Razorpay Dashboard settings.

## 🔧 Enable Payment Methods

### Step 1: Go to Razorpay Dashboard

1. Open [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Make sure you're in **Test Mode** (toggle at top left)
3. Sign in with your credentials

### Step 2: Enable Payment Methods

1. Go to **Settings** (gear icon) in left sidebar
2. Click on **Payment Methods**
3. You'll see all available payment methods

### Step 3: Enable UPI

1. Find **UPI** in the list
2. Toggle it to **Enabled**
3. Click **Save Changes**

### Step 4: Enable Other Methods (Optional)

Enable these for more payment options:

**Cards:**
- ✅ Credit Cards
- ✅ Debit Cards
- ✅ International Cards (if needed)

**UPI:**
- ✅ UPI (Unified Payments Interface)
- ✅ UPI Intent
- ✅ UPI QR

**Net Banking:**
- ✅ All Banks
- ✅ Popular Banks

**Wallets:**
- ✅ Paytm
- ✅ PhonePe
- ✅ Amazon Pay
- ✅ Mobikwik
- ✅ Freecharge

**Other:**
- ✅ EMI (if applicable)
- ✅ Cardless EMI
- ✅ Pay Later

### Step 5: Save Configuration

1. After enabling all desired methods
2. Click **Save** or **Update**
3. Changes take effect immediately

## 🧪 Test UPI Payment

After enabling UPI:

### Test UPI IDs (Test Mode Only)

**Successful Payment:**
- UPI ID: `success@razorpay`
- Any UPI app simulation will work

**Failed Payment:**
- UPI ID: `failure@razorpay`

### Test Flow

1. Go to pricing page
2. Click any plan
3. Razorpay modal opens
4. Click **UPI** tab
5. Enter test UPI ID: `success@razorpay`
6. Click Pay
7. Payment should succeed

## 📱 Available Payment Methods

Once enabled, users will see:

### 1. UPI
- Enter UPI ID
- Scan QR code
- UPI Intent (mobile apps)

### 2. Cards
- Credit cards
- Debit cards
- Saved cards

### 3. Net Banking
- All major banks
- Direct bank login

### 4. Wallets
- Paytm
- PhonePe
- Amazon Pay
- Others

### 5. EMI
- Credit card EMI
- Cardless EMI
- Pay Later options

## 🔒 Test Mode vs Live Mode

### Test Mode
- All payment methods available
- Use test credentials
- No real money involved
- Perfect for development

### Live Mode
- Requires KYC completion
- Real payments processed
- Bank account needed
- Production use

## ⚙️ Payment Method Configuration

### In Razorpay Dashboard

```
Settings → Payment Methods
├── Cards
│   ├── Credit Cards ✓
│   ├── Debit Cards ✓
│   └── International Cards
├── UPI
│   ├── UPI ✓
│   ├── UPI Intent ✓
│   └── UPI QR ✓
├── Net Banking
│   ├── All Banks ✓
│   └── Popular Banks ✓
├── Wallets
│   ├── Paytm ✓
│   ├── PhonePe ✓
│   └── Others ✓
└── EMI
    ├── Credit Card EMI
    └── Cardless EMI
```

## 🎯 Recommended Settings

For best user experience, enable:

**Essential:**
- ✅ UPI (most popular in India)
- ✅ Credit/Debit Cards
- ✅ Net Banking

**Optional:**
- ✅ Wallets (Paytm, PhonePe)
- ✅ EMI (for higher amounts)
- ✅ International Cards (for global users)

## 🐛 Troubleshooting

### Issue: UPI still not showing

**Solutions:**
1. Clear browser cache
2. Refresh the page
3. Check Razorpay dashboard settings saved
4. Wait 1-2 minutes for changes to propagate
5. Try in incognito mode

### Issue: "Payment method not available"

**Solutions:**
1. Verify method is enabled in dashboard
2. Check you're in correct mode (Test/Live)
3. Ensure amount is within limits
4. Check currency is INR

### Issue: Test UPI not working

**Solutions:**
1. Use exact test UPI ID: `success@razorpay`
2. Make sure you're in Test Mode
3. Check payment method is enabled
4. Try different payment method first

## 📊 Payment Method Analytics

In Razorpay Dashboard, you can see:
- Most used payment methods
- Success rates per method
- Average transaction value
- User preferences

Go to: **Analytics** → **Payment Methods**

## 🚀 Production Checklist

Before going live:

- [ ] Complete KYC verification
- [ ] Add bank account details
- [ ] Enable desired payment methods
- [ ] Test all payment methods
- [ ] Set up webhooks
- [ ] Configure settlement schedule
- [ ] Add business logo
- [ ] Set up refund policy

## 💡 Tips

### 1. Enable Multiple Methods
Give users choice - increases conversion rates

### 2. UPI is Popular
In India, UPI is the most used payment method

### 3. Test Everything
Test each payment method before going live

### 4. Monitor Analytics
Check which methods users prefer

### 5. Optimize Checkout
Fewer steps = higher conversion

## 📱 Mobile Optimization

UPI works best on mobile:
- UPI Intent opens payment apps directly
- QR code scanning
- Saved UPI IDs
- One-tap payments

## 🎉 Success Criteria

Payment methods are working when:

- ✅ UPI tab visible in checkout
- ✅ Can enter UPI ID
- ✅ Test payment succeeds
- ✅ All enabled methods show up
- ✅ Users can choose preferred method

## 🔗 Quick Links

- [Razorpay Dashboard](https://dashboard.razorpay.com/)
- [Payment Methods Settings](https://dashboard.razorpay.com/app/payment-methods)
- [Test Credentials](https://razorpay.com/docs/payments/payments/test-card-details/)
- [UPI Documentation](https://razorpay.com/docs/payments/payment-methods/upi/)

---

**Need help?** Contact Razorpay support or check their documentation for specific payment method requirements.

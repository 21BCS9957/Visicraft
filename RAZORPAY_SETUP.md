# Razorpay Payment Integration Setup

Complete guide to set up Razorpay payments for Visicraft subscription plans.

## 🎯 What Was Implemented

### Payment Features

✅ **Razorpay Integration**
- Create payment orders
- Process payments securely
- Verify payment signatures
- Handle payment callbacks

✅ **Pricing Page Integration**
- Click any plan to initiate payment
- Automatic Razorpay checkout modal
- User authentication check
- Payment success/failure handling

✅ **Security**
- Server-side order creation
- Payment signature verification
- Secure webhook handling
- Environment variable protection

## 📁 Files Created

```
thumbnail-generator/
├── lib/
│   └── razorpay/
│       └── client.ts                  # Razorpay client setup
├── app/
│   └── api/
│       └── payment/
│           ├── create-order/
│           │   └── route.ts           # Create Razorpay order
│           └── verify/
│               └── route.ts           # Verify payment
└── RAZORPAY_SETUP.md                  # This file
```

## 📝 Files Modified

```
thumbnail-generator/
├── app/
│   └── pricing/
│       └── page.tsx                   # Added payment handling
└── .env.example                       # Added Razorpay keys
```

## 🔧 Step 1: Create Razorpay Account

### 1.1 Sign Up

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Click **Sign Up**
3. Fill in your details:
   - Email
   - Password
   - Business name: **Visicraft**
4. Verify your email

### 1.2 Complete KYC (For Production)

For test mode, you can skip this. For production:
1. Go to **Settings** → **Account & Settings**
2. Complete KYC verification
3. Add bank account details
4. Submit documents

## 🔑 Step 2: Get API Keys

### 2.1 Test Mode Keys (For Development)

1. In Razorpay Dashboard, toggle to **Test Mode** (top left)
2. Go to **Settings** → **API Keys**
3. Click **Generate Test Key**
4. Copy both keys:
   - **Key ID**: `rzp_test_xxxxxxxxxxxxx`
   - **Key Secret**: `xxxxxxxxxxxxxxxxxxxxx`

### 2.2 Add Keys to Environment

Add to `.env.local`:

```bash
# Razorpay Test Keys
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxx
```

**Important**: 
- `NEXT_PUBLIC_RAZORPAY_KEY_ID` is public (used in frontend)
- `RAZORPAY_KEY_SECRET` is private (never expose to frontend)

## 🧪 Step 3: Test Payment Flow

### 3.1 Start Development Server

```bash
cd thumbnail-generator
npm run dev
```

### 3.2 Test Payment

1. Go to `http://localhost:3000/pricing`
2. Make sure you're signed in (click Sign In if not)
3. Click any plan's button (e.g., "Get Started")
4. Razorpay checkout modal should open

### 3.3 Use Test Cards

Razorpay provides test cards for testing:

**Successful Payment:**
- Card Number: `4111 1111 1111 1111`
- CVV: Any 3 digits (e.g., `123`)
- Expiry: Any future date (e.g., `12/25`)
- Name: Any name

**Failed Payment:**
- Card Number: `4000 0000 0000 0002`
- CVV: Any 3 digits
- Expiry: Any future date

**Other Test Scenarios:**
- UPI: Use `success@razorpay` for success
- Netbanking: Select any bank, use any credentials
- Wallet: Select any wallet

### 3.4 Verify Payment

After successful payment:
1. Check browser console for success message
2. Check terminal for payment verification logs
3. Check Razorpay Dashboard → Payments for transaction

## 📊 Step 4: Monitor Payments

### 4.1 Razorpay Dashboard

1. Go to **Transactions** → **Payments**
2. View all payment attempts
3. Check payment status
4. View payment details

### 4.2 Payment Statuses

- **Created**: Order created, payment not attempted
- **Authorized**: Payment successful, awaiting capture
- **Captured**: Payment completed
- **Failed**: Payment failed
- **Refunded**: Payment refunded

## 🔒 Step 5: Production Setup

### 5.1 Switch to Live Mode

1. Complete KYC verification
2. Toggle to **Live Mode** in dashboard
3. Generate Live API Keys
4. Update `.env.local` with live keys

### 5.2 Production Keys

```bash
# Razorpay Live Keys
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxx
```

### 5.3 Update Site URL

```bash
NEXT_PUBLIC_SITE_URL=https://your-production-domain.com
```

## 🎨 Payment Flow

### User Journey

```
User clicks plan button
    ↓
Check if user is signed in
    ↓
Create order on backend (/api/payment/create-order)
    ↓
Load Razorpay checkout script
    ↓
Open Razorpay modal
    ↓
User enters payment details
    ↓
Payment processed by Razorpay
    ↓
Payment success callback
    ↓
Verify signature on backend (/api/payment/verify)
    ↓
Update user subscription
    ↓
Redirect to workflow page
```

### Technical Flow

```typescript
// 1. Create Order
POST /api/payment/create-order
Body: { amount, planName, billingCycle }
Response: { orderId, amount, currency }

// 2. Open Razorpay Checkout
window.Razorpay({
  key: RAZORPAY_KEY_ID,
  order_id: orderId,
  handler: (response) => {
    // 3. Verify Payment
    POST /api/payment/verify
    Body: {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    }
  }
})
```

## 🔐 Security Best Practices

### 1. Never Expose Key Secret

❌ **Wrong:**
```typescript
// Don't use RAZORPAY_KEY_SECRET in frontend
const secret = process.env.RAZORPAY_KEY_SECRET;
```

✅ **Correct:**
```typescript
// Only use in API routes (server-side)
// In app/api/payment/create-order/route.ts
const razorpay = new Razorpay({
  key_secret: process.env.RAZORPAY_KEY_SECRET!
});
```

### 2. Always Verify Signatures

```typescript
// In app/api/payment/verify/route.ts
const expectedSign = crypto
  .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
  .update(sign.toString())
  .digest('hex');

if (razorpay_signature === expectedSign) {
  // Payment is genuine
}
```

### 3. Use HTTPS in Production

- Razorpay requires HTTPS for live mode
- Use SSL certificate for your domain
- Update `NEXT_PUBLIC_SITE_URL` to https://

## 💾 Step 6: Store Subscription Data

After payment verification, you should:

### 6.1 Create Subscriptions Table

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  plan_name TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  amount INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  status TEXT DEFAULT 'active',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  starts_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 6.2 Update User Credits

```sql
CREATE TABLE user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  credits INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 6.3 Update Verify Route

In `app/api/payment/verify/route.ts`, add:

```typescript
if (razorpay_signature === expectedSign) {
  // Store subscription in database
  await supabase.from('subscriptions').insert({
    user_id: user.id,
    plan_name: planName,
    amount: amount,
    razorpay_order_id,
    razorpay_payment_id,
    status: 'active',
  });

  // Add credits to user
  await supabase.from('user_credits').upsert({
    user_id: user.id,
    credits: planCredits,
  });
}
```

## 🎯 Testing Checklist

- [ ] Razorpay account created
- [ ] Test API keys obtained
- [ ] Keys added to `.env.local`
- [ ] Development server running
- [ ] User signed in
- [ ] Can click plan button
- [ ] Razorpay modal opens
- [ ] Test card payment works
- [ ] Payment success toast appears
- [ ] Payment visible in Razorpay dashboard
- [ ] Signature verification works

## 🐛 Troubleshooting

### Issue: Razorpay modal doesn't open

**Solution:**
1. Check browser console for errors
2. Verify `NEXT_PUBLIC_RAZORPAY_KEY_ID` is set
3. Check if Razorpay script loaded
4. Try clearing browser cache

### Issue: "Key ID is invalid"

**Solution:**
1. Verify key ID starts with `rzp_test_` or `rzp_live_`
2. Check for extra spaces in `.env.local`
3. Restart development server after adding keys

### Issue: Payment verification fails

**Solution:**
1. Check `RAZORPAY_KEY_SECRET` is correct
2. Verify signature calculation matches Razorpay docs
3. Check server logs for errors

### Issue: "User not signed in" error

**Solution:**
1. Make sure Google authentication is working
2. Sign in before clicking plan button
3. Check AuthContext is providing user data

## 📚 Additional Features

### Webhooks (Optional)

Set up webhooks for real-time payment updates:

1. Go to Razorpay Dashboard → **Settings** → **Webhooks**
2. Add webhook URL: `https://your-domain.com/api/payment/webhook`
3. Select events: `payment.captured`, `payment.failed`
4. Create webhook endpoint in your app

### Refunds

To process refunds:

```typescript
const refund = await razorpay.payments.refund(paymentId, {
  amount: amount * 100, // in paise
  notes: {
    reason: 'Customer request'
  }
});
```

### Recurring Payments

For automatic subscription renewals:

1. Create subscription plan in Razorpay
2. Use Razorpay Subscriptions API
3. Handle subscription webhooks

## 🎉 Success Criteria

Payment integration is working when:

- ✅ Can create orders from pricing page
- ✅ Razorpay modal opens correctly
- ✅ Test payments succeed
- ✅ Payment verification works
- ✅ Success toast appears
- ✅ Payments visible in dashboard
- ✅ User redirected after payment

## 🚀 Next Steps

1. **Add Subscription Management**
   - View current plan
   - Upgrade/downgrade plans
   - Cancel subscription

2. **Credits System**
   - Deduct credits on generation
   - Show remaining credits
   - Low credit warnings

3. **Invoice Generation**
   - Generate PDF invoices
   - Email invoices to users
   - Download invoice option

4. **Payment History**
   - Show all past payments
   - Download receipts
   - Refund requests

---

**Ready to accept payments?** Follow the steps above and start testing with Razorpay test mode!

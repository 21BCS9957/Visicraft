# Razorpay Webhook Setup Guide

## Why Use Webhooks?

Webhooks provide a backup mechanism for payment verification. If the user closes the browser before the payment verification completes, the webhook will still process the payment and add credits.

## Setup Steps

### 1. Configure Webhook in Razorpay Dashboard

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Navigate to **Settings** → **Webhooks**
3. Click **Create New Webhook**
4. Configure:
   - **Webhook URL**: `https://visicraft-eta.vercel.app/api/payment/webhook`
   - **Secret**: Generate a strong secret (save this!)
   - **Active Events**: Select `payment.captured`
   - **Alert Email**: Your email for webhook failures

### 2. Add Webhook Secret to Environment Variables

#### Local Development (.env.local)
```env
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
```

#### Production (Vercel)
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add:
   - **Name**: `RAZORPAY_WEBHOOK_SECRET`
   - **Value**: Your webhook secret from Razorpay
   - **Environment**: Production, Preview, Development

### 3. Test the Webhook

#### Using Razorpay Dashboard
1. Go to **Settings** → **Webhooks**
2. Click on your webhook
3. Click **Send Test Webhook**
4. Select `payment.captured` event
5. Check the response (should be 200 OK)

#### Using a Real Payment
1. Make a test payment (₹1 test plan)
2. Check Vercel logs for webhook processing
3. Verify credits are added to your account

## Webhook Flow

```
User completes payment
    ↓
Razorpay sends webhook → /api/payment/webhook
    ↓
Verify webhook signature
    ↓
Extract payment details from notes
    ↓
Add credits to user account
    ↓
Return 200 OK to Razorpay
```

## Troubleshooting

### Webhook Not Receiving Events
- Check webhook URL is correct and accessible
- Verify webhook is active in Razorpay dashboard
- Check Vercel function logs for errors

### Signature Verification Failed
- Ensure `RAZORPAY_WEBHOOK_SECRET` matches the secret in Razorpay dashboard
- Check for extra spaces or newlines in the secret

### Credits Not Added
- Check Vercel logs for error messages
- Verify `userId` is included in payment notes
- Check Supabase `user_credits` table permissions

## Monitoring

### Razorpay Dashboard
- View webhook delivery status
- See failed webhooks and retry them
- Check webhook logs

### Vercel Logs
```bash
vercel logs --follow
```

Look for:
- `🔔 Webhook received: payment.captured`
- `✅ Webhook: Credits added`
- `❌` for any errors

## Security Notes

1. **Always verify webhook signature** - Already implemented
2. **Use HTTPS only** - Vercel provides this
3. **Keep webhook secret secure** - Never commit to git
4. **Log all webhook events** - For debugging and audit trail

## Current Implementation

### Files
- `/app/api/payment/webhook/route.ts` - Webhook handler
- `/app/api/payment/verify/route.ts` - Direct payment verification
- `/app/api/payment/create-order/route.ts` - Order creation with metadata

### Features
- ✅ Signature verification
- ✅ Automatic credit allocation
- ✅ Detailed logging
- ✅ Error handling
- ✅ Metadata in order notes (userId, credits, planName)

## Next Steps

1. Add webhook secret to environment variables
2. Configure webhook in Razorpay dashboard
3. Test with ₹1 payment
4. Monitor logs to ensure credits are added
5. Optional: Create `payments` table to track all transactions

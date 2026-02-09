# Payment Troubleshooting Guide

## Issue: "Payment verification failed"

### Step 1: Check Environment Variables

Make sure these are set in **Vercel** (not just locally):

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Verify these exist:
   ```
   NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_...
   RAZORPAY_KEY_SECRET=your_secret_key
   ```
3. **Important**: After adding/updating, redeploy your app

### Step 2: Check Browser Console

1. Open browser DevTools (F12)
2. Go to Console tab
3. Make a test payment
4. Look for these logs:
   - `💳 Payment completed, verifying...`
   - `📋 Verification response:`
   - Any error messages

### Step 3: Check Vercel Logs

```bash
# Install Vercel CLI if not already
npm i -g vercel

# Login
vercel login

# View logs
vercel logs --follow
```

Look for:
- `🔍 Payment verification request:`
- `🔐 Signature verification:`
- `✅ Payment verified and credits added:`
- Any `❌` error messages

### Step 4: Common Issues

#### Issue: "RAZORPAY_KEY_SECRET is not configured"
**Solution**: Add `RAZORPAY_KEY_SECRET` to Vercel environment variables and redeploy

#### Issue: "Invalid signature"
**Possible causes**:
1. Using test keys in production or vice versa
2. Wrong secret key
3. Keys don't match between frontend and backend

**Solution**: 
- Verify `NEXT_PUBLIC_RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are from the same mode (both test or both live)
- Check for typos or extra spaces

#### Issue: "Failed to fetch current credits"
**Possible causes**:
1. Supabase credentials not set
2. `user_credits` table doesn't exist
3. RLS policies blocking access

**Solution**:
1. Check Supabase credentials in Vercel
2. Run the setup SQL script to create tables
3. Check RLS policies allow service role access

#### Issue: Credits not showing after payment
**Possible causes**:
1. Payment succeeded but verification failed
2. User not logged in
3. Wrong userId

**Solution**:
1. Check Vercel logs for verification errors
2. Use webhooks as backup (see RAZORPAY_WEBHOOK_SETUP.md)
3. Manually check Supabase `user_credits` table

### Step 5: Test with ₹1 Payment

1. Go to `/pricing`
2. Click "Test Payment (₹1)" on Test Plan
3. Complete payment with test card:
   - Card: 4111 1111 1111 1111
   - CVV: Any 3 digits
   - Expiry: Any future date
4. Check console and Vercel logs
5. Verify credits added in Supabase

### Step 6: Enable Webhooks (Recommended)

Webhooks provide a backup if the browser-based verification fails.

See `RAZORPAY_WEBHOOK_SETUP.md` for setup instructions.

## Debug Checklist

- [ ] Razorpay keys added to Vercel environment variables
- [ ] Redeployed after adding environment variables
- [ ] Using correct mode (test/live) keys
- [ ] Supabase credentials configured
- [ ] `user_credits` table exists
- [ ] User is logged in when making payment
- [ ] Browser console shows no errors
- [ ] Vercel logs show payment verification attempt

## Getting More Help

1. **Check Razorpay Dashboard**:
   - Go to Payments → All Payments
   - Find your payment
   - Check status and notes

2. **Check Supabase**:
   - Go to Table Editor → `user_credits`
   - Find your user_id
   - Check current credits

3. **Share Logs**:
   - Copy browser console logs
   - Copy Vercel function logs
   - Share for debugging

## Manual Credit Addition (Emergency)

If payment succeeded but credits weren't added:

1. Go to Supabase Dashboard
2. Table Editor → `user_credits`
3. Find your user row (or insert new)
4. Update credits manually
5. Investigate why automatic addition failed

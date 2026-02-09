import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';

// Razorpay webhook endpoint
// This provides a backup mechanism for payment verification
// Configure this URL in Razorpay Dashboard: https://dashboard.razorpay.com/app/webhooks

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-razorpay-signature');

    if (!signature) {
      console.error('❌ No signature in webhook request');
      return NextResponse.json(
        { error: 'No signature provided' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('❌ RAZORPAY_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook not configured' },
        { status: 500 }
      );
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('❌ Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Parse the webhook payload
    const event = JSON.parse(body);
    console.log('🔔 Webhook received:', event.event);

    // Handle payment.captured event
    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const orderId = payment.order_id;
      const paymentId = payment.id;
      const amount = payment.amount / 100; // Convert paise to rupees

      console.log('💰 Payment captured:', {
        orderId,
        paymentId,
        amount,
      });

      // Extract metadata from payment notes
      const notes = payment.notes || {};
      const userId = notes.userId;
      const credits = parseInt(notes.credits || '0');
      const planName = notes.planName;

      if (!userId || !credits) {
        console.error('❌ Missing userId or credits in payment notes');
        return NextResponse.json(
          { error: 'Invalid payment metadata' },
          { status: 400 }
        );
      }

      // Add credits to user account
      const supabase = await createClient();

      const { data: currentData, error: fetchError } = await supabase
        .from('user_credits')
        .select('credits')
        .eq('user_id', userId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('❌ Error fetching credits:', fetchError);
        return NextResponse.json(
          { error: 'Database error' },
          { status: 500 }
        );
      }

      const currentCredits = currentData?.credits || 0;
      const newCredits = currentCredits + credits;

      const { error: upsertError } = await supabase
        .from('user_credits')
        .upsert({
          user_id: userId,
          credits: newCredits,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (upsertError) {
        console.error('❌ Error updating credits:', upsertError);
        return NextResponse.json(
          { error: 'Failed to add credits' },
          { status: 500 }
        );
      }

      console.log('✅ Webhook: Credits added via webhook:', {
        userId,
        planName,
        credits,
        paymentId,
        orderId,
        newBalance: newCredits,
      });

      return NextResponse.json({ success: true });
    }

    // Handle other events
    console.log('ℹ️ Unhandled webhook event:', event.event);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error.message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planName,
      planId,
      amount,
      credits,
      billingCycle,
      userId,
    } = body;

    console.log('🔍 Payment verification request:', {
      razorpay_order_id,
      razorpay_payment_id,
      userId,
      credits,
      amount,
    });

    // Check if RAZORPAY_KEY_SECRET is configured
    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error('❌ RAZORPAY_KEY_SECRET is not configured');
      return NextResponse.json(
        { success: false, error: 'Payment gateway not configured' },
        { status: 500 }
      );
    }

    // Verify signature
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest('hex');

    console.log('🔐 Signature verification:', {
      received: razorpay_signature,
      expected: expectedSign,
      match: razorpay_signature === expectedSign,
    });

    if (razorpay_signature === expectedSign) {
      // Payment is verified - Add credits to user account
      console.log('✅ Signature verified, adding credits to user:', userId);
      
      // Use service role client to bypass RLS
      const supabase = createServiceClient();
      
      // Get current credits
      const { data: currentData, error: fetchError } = await supabase
        .from('user_credits')
        .select('credits')
        .eq('user_id', userId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('❌ Error fetching credits:', fetchError);
        return NextResponse.json(
          { success: false, error: 'Failed to fetch current credits', details: fetchError.message },
          { status: 500 }
        );
      }

      const currentCredits = currentData?.credits || 0;
      const newCredits = currentCredits + credits;

      console.log('💳 Credit calculation:', {
        currentCredits,
        creditsToAdd: credits,
        newCredits,
      });

      // Update or insert credits
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
          { success: false, error: 'Failed to add credits', details: upsertError.message },
          { status: 500 }
        );
      }

      // Log the transaction
      console.log('✅ Payment verified and credits added:', {
        userId,
        planName,
        planId,
        amount,
        credits,
        billingCycle,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        newBalance: newCredits,
      });

      return NextResponse.json({
        success: true,
        message: 'Payment verified successfully',
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        creditsAdded: credits,
        newBalance: newCredits,
      });
    } else {
      console.error('❌ Signature verification failed');
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    console.error('❌ Error verifying payment:', error);
    const details = error instanceof Error ? error.message : 'Payment verification failed';
    return NextResponse.json(
      { success: false, error: 'Payment verification failed', details },
      { status: 500 }
    );
  }
}

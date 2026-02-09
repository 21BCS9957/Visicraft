import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';

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

    // Verify signature
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(sign.toString())
      .digest('hex');

    if (razorpay_signature === expectedSign) {
      // Payment is verified - Add credits to user account
      const supabase = await createClient();
      
      // Get current credits
      const { data: currentData, error: fetchError } = await supabase
        .from('user_credits')
        .select('credits')
        .eq('user_id', userId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching credits:', fetchError);
        throw new Error('Failed to fetch current credits');
      }

      const currentCredits = currentData?.credits || 0;
      const newCredits = currentCredits + credits;

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
        console.error('Error updating credits:', upsertError);
        throw new Error('Failed to add credits');
      }

      // Log the transaction (optional - create a payments table if needed)
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
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    return NextResponse.json(
      { success: false, error: 'Payment verification failed' },
      { status: 500 }
    );
  }
}

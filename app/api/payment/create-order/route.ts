import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, planName, billingCycle, credits, planId, userId } = body;

    console.log('📝 Creating order:', { amount, planName, billingCycle, credits, userId });

    if (!amount || !planName) {
      return NextResponse.json(
        { error: 'Amount and plan name are required' },
        { status: 400 }
      );
    }

    if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('❌ Razorpay credentials not configured');
      return NextResponse.json(
        { error: 'Payment gateway not configured' },
        { status: 500 }
      );
    }

    // Initialize Razorpay with credentials
    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: {
        planName,
        planId: planId || '',
        billingCycle: billingCycle || 'monthly',
        credits: String(credits || 0),
        userId: userId || '',
      },
    });

    console.log('✅ Razorpay order created:', {
      orderId: order.id,
      amount: amount,
      planName,
      billingCycle,
      credits,
      userId,
    });

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error: any) {
    console.error('❌ Error creating Razorpay order:', error);
    return NextResponse.json(
      { error: 'Failed to create order', details: error.message },
      { status: 500 }
    );
  }
}

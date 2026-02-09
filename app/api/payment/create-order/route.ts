import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, planName, billingCycle, credits, planId } = body;

    if (!amount || !planName) {
      return NextResponse.json(
        { error: 'Amount and plan name are required' },
        { status: 400 }
      );
    }

    // Initialize Razorpay with credentials
    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
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
        credits: credits || 0,
      },
    });

    console.log('✅ Razorpay order created:', {
      orderId: order.id,
      amount: amount,
      planName,
      billingCycle,
      credits,
    });

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}

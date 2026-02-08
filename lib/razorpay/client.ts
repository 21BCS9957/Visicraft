import Razorpay from 'razorpay';

// Server-side Razorpay instance
export const razorpay = new Razorpay({
  key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// Client-side Razorpay options
export const getRazorpayOptions = (
  orderId: string,
  amount: number,
  planName: string,
  userEmail?: string,
  userName?: string
) => {
  return {
    key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    amount: amount * 100, // Convert to paise
    currency: 'INR',
    name: 'Visicraft',
    description: `${planName} Plan`,
    order_id: orderId,
    prefill: {
      email: userEmail || '',
      name: userName || '',
    },
    theme: {
      color: '#8b5cf6', // Purple theme
    },
    modal: {
      ondismiss: () => {
        console.log('Payment cancelled by user');
      },
    },
  };
};

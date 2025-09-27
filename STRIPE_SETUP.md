# Stripe Connect Setup for Fohr Platform

This guide explains how to set up Stripe Connect for your platform to allow brands to fund their accounts and pay influencers.

## Environment Variables

Add these environment variables to your `.env` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...  # Your Stripe secret key
STRIPE_PUBLISHABLE_KEY=pk_test_...  # Your Stripe publishable key
STRIPE_WEBHOOK_SECRET=whsec_...  # Your webhook endpoint secret
```

## Setup Steps

### 1. Stripe Dashboard Setup

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Enable Connect in your Stripe account
3. Go to Connect > Settings and configure:
   - Platform name: "Fohr"
   - Platform website: Your website URL
   - Platform logo: Upload your logo
   - Business type: Select appropriate type

### 2. Webhook Configuration

1. In Stripe Dashboard, go to Developers > Webhooks
2. Add endpoint: `https://yourdomain.com/stripe/webhook`
3. Select events to listen for:
   - `account.updated`
   - `payment_intent.succeeded`
   - `transfer.created`
   - `payout.created`
4. Copy the webhook secret and add to your environment variables

### 3. Database Schema

You'll need to add these fields to your brands table:

```sql
ALTER TABLE brands ADD COLUMN stripe_account_id VARCHAR(255);
ALTER TABLE brands ADD COLUMN stripe_account_status VARCHAR(50);
ALTER TABLE brands ADD COLUMN stripe_charges_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE brands ADD COLUMN stripe_payouts_enabled BOOLEAN DEFAULT FALSE;
```

## API Endpoints

All Stripe routes are now organized in `/routes/stripe.js` and mounted at `/stripe` prefix.

### Brand Account Management

#### Create Stripe Connect Account

```http
POST /stripe/create-account
Content-Type: application/json

{
  "email": "brand@example.com",
  "name": "Brand Name",
  "country": "US",
  "type": "express"
}
```

#### Create Account Onboarding Link

```http
POST /stripe/create-account-link
Content-Type: application/json

{
  "accountId": "acct_...",
  "refreshUrl": "https://yourdomain.com/onboarding/refresh",
  "returnUrl": "https://yourdomain.com/onboarding/success"
}
```

#### Create Login Link

```http
POST /stripe/create-login-link
Content-Type: application/json

{
  "accountId": "acct_..."
}
```

### Payment Processing

#### Fund Brand Account

```http
POST /stripe/create-funding-payment
Content-Type: application/json

{
  "amount": 10000,  // $100.00 in cents
  "currency": "usd",
  "brandAccountId": "acct_...",
  "metadata": {
    "campaignId": "123",
    "brandId": "456"
  }
}
```

#### Pay Influencer

```http
POST /stripe/create-influencer-payment
Content-Type: application/json

{
  "amount": 5000,  // $50.00 in cents
  "currency": "usd",
  "influencerAccountId": "acct_...",
  "brandAccountId": "acct_...",
  "metadata": {
    "campaignId": "123",
    "influencerId": "789",
    "deliverableId": "101"
  }
}
```

### Account Information

#### Get Account Details

```http
GET /stripe/account/{accountId}
```

#### Get Account Balance

```http
GET /stripe/account/{accountId}/balance
```

#### List Transfers

```http
GET /stripe/account/{accountId}/transfers?limit=10&starting_after=tr_...
```

## Frontend Integration

### 1. Install Stripe.js

```bash
npm install @stripe/stripe-js
```

### 2. Create Payment Component

```jsx
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

function PaymentForm({ clientSecret, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    const { error, paymentIntent } = await stripe.confirmCardPayment(
      clientSecret,
      {
        payment_method: {
          card: elements.getElement(CardElement),
        },
      }
    );

    if (error) {
      console.error(error);
    } else if (paymentIntent.status === "succeeded") {
      onSuccess(paymentIntent);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <CardElement />
      <button type="submit" disabled={!stripe}>
        Pay
      </button>
    </form>
  );
}

function App() {
  const [clientSecret, setClientSecret] = useState("");

  const createPaymentIntent = async () => {
    const response = await fetch("/stripe/create-funding-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: 10000,
        currency: "usd",
        brandAccountId: "acct_...",
      }),
    });

    const { clientSecret } = await response.json();
    setClientSecret(clientSecret);
  };

  return (
    <Elements stripe={stripePromise}>
      <PaymentForm clientSecret={clientSecret} onSuccess={console.log} />
    </Elements>
  );
}
```

## Workflow

### 1. Brand Onboarding

1. Brand signs up on your platform
2. Create Stripe Connect account via API
3. Redirect to Stripe onboarding flow
4. Brand completes KYC/verification
5. Update database with account status

### 2. Account Funding

1. Brand wants to fund their account
2. Create payment intent with platform fee
3. Process payment using Stripe Elements
4. Funds are transferred to brand's Stripe account

### 3. Influencer Payment

1. Campaign is completed
2. Create payment intent to pay influencer
3. Process payment from brand's account
4. Platform takes fee, influencer receives payment

## Security Considerations

1. Always verify webhook signatures
2. Store Stripe account IDs securely
3. Implement proper error handling
4. Use HTTPS for all webhook endpoints
5. Validate all input data
6. Implement rate limiting

## Testing

Use Stripe's test mode with test cards:

- Success: 4242424242424242
- Decline: 4000000000000002
- 3D Secure: 4000002500003155

## Support

- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [Stripe Connect Quickstart](https://stripe.com/docs/connect/quickstart)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)

# 🚀 Fohr Platform - Stripe Connect Integration

A comprehensive Node.js backend service that enables brands to fund their accounts and pay influencers through Stripe Connect. Built with Express.js and modular architecture for scalability and maintainability.

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [API Endpoints](#-api-endpoints)
- [Setup & Installation](#-setup--installation)
- [Usage Examples](#-usage-examples)
- [Payment Flows](#-payment-flows)
- [Security](#-security)
- [Contributing](#-contributing)

## ✨ Features

- **🔗 Stripe Connect Integration** - Full Connect platform for multi-party payments
- **💰 Account Funding** - Brands can fund their accounts with platform fees
- **💸 Influencer Payments** - Direct payments to influencers with fee management
- **🔐 Secure Webhooks** - Signature verification and event processing
- **📊 Account Management** - Balance checking, transfer history, and payouts
- **🏗️ Modular Architecture** - Clean separation of concerns with Express Router

## 🏗️ Architecture

### Brand Onboarding Flow

```mermaid
sequenceDiagram
    participant B as 🏢 Brand/Influencer
    participant FE as 📱 React App
    participant API as ⚡ Rails API
    participant STRIPE as 🏦 Stripe Connect
    participant DB as 🗄️ Database

    Note over B,DB: Brand Registration & Onboarding

    B->>FE: Sign Up for Platform
    FE->>API: POST /stripe/create-account
    Note right of API: {email, name, country, type}

    API->>STRIPE: Create Connect Account
    STRIPE-->>API: Account ID & Details
    API->>DB: Store Account Info
    API->>STRIPE: Generate Onboarding Link
    API-->>FE: Account Created Successfully
    STRIPE-->>API: Onboarding URL
    API-->>FE: Redirect URL

    FE->>B: Redirect to Stripe Onboarding
    B->>STRIPE: Complete KYC & Verification
    STRIPE->>API: Webhook: account.updated
    API->>DB: Update Account Status
    API-->>STRIPE: Webhook Acknowledged

    Note over B,DB: Brand is now ready to fund and pay!
```

### Account Funding Flow

```mermaid
graph LR
    subgraph "🎨 Frontend Experience"
        A["Brand Dashboard<br/>💰 Add Funds"]
        B["Payment Form<br/>💳 Stripe Elements"]
        C["Success Page<br/>✅ Funds Added"]
    end

    subgraph "⚡ Backend Processing"
        D["Payment Intent<br/>🎯 /create-funding-payment"]
        E["Stripe Service<br/>🔧 Process Payment"]
        F["Account Balance<br/>📊 Updated"]
    end

    subgraph "🏦 Stripe Processing"
        G["Payment Method<br/>💳 Card/Bank"]
        H["Platform Fee<br/>📈 2.9%"]
        I["Brand Account<br/>💰 Funds Deposited"]
    end

    A --> B
    B --> D
    D --> E
    E --> G
    G --> H
    H --> I
    I --> F
    F --> C

    classDef frontend fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef backend fill:#f1f8e9,stroke:#388e3c,stroke-width:2px
    classDef stripe fill:#fff8e1,stroke:#f57c00,stroke-width:2px

    class A,B,C frontend
    class D,E,F backend
    class G,H,I stripe
```

## 🔌 API Endpoints

### Account Management

#### Create Stripe Connect Account

```http
POST /stripe/create-account
Content-Type: application/json

```

#### Returns

`{ url: "Stripe onboarding link" }`

The API takes brand or influencer info from the logged in user. If it's a brand it sets `business_type` to `company` and if it's an influencer to `individual`. The API calls the Stripe.accounts.create method on the SDK to create a connected account. For a connected account you need a secret key which is only available on the BE. After creating the account the BE calls the Stripe SDK to create an account link for onboarding and returns it to the FE. It's the Stripe.accountLinks.create method.

#### Delete Stripe Connect Account

```http
DELETE /stripe/account
Content-Type: application/json

```

The BE deletes the Stripe account ID from either the influencer or brand. It also saves `disconnectedBy` and `disconnectedOn` somewhere in the DB and returns it to the FE. When the FE calls `GET /accounts/:id` the BE returns this info.

```http
GET /stripe/account
Content-Type: application/json

```

The BE proxies this call to Stripe and returns all the account properties. If the account has been disconnected it returns `disconnectedBy` and `disconnectedOn`, which were saved when the account was disconnected.

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

## 🚀 Setup & Installation

### Prerequisites

- Node.js 14+
- npm or yarn
- Stripe account with Connect enabled

### Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd fohr-nodejs
```

2. **Install dependencies**

```bash
npm install
```

3. **Environment Variables**
   Create a `.env` file with:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Server Configuration
PORT=4000
```

4. **Start the server**

```bash
npm start
# or for development
npm run start:dev
```

### Stripe Dashboard Setup

1. Enable Connect in your Stripe Dashboard
2. Configure Connect settings:

   - Platform name: "Fohr"
   - Platform website: Your website URL
   - Business type: Select appropriate type

3. Set up webhook endpoint:
   - URL: `https://yourdomain.com/stripe/webhook`
   - Events: `account.updated`, `payment_intent.succeeded`, `transfer.created`

## 💡 Usage Examples

### Frontend Integration

```javascript
// Create payment intent for funding
const createFundingPayment = async (amount, brandAccountId) => {
  const response = await fetch("/stripe/create-funding-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: amount * 100, // Convert to cents
      currency: "usd",
      brandAccountId,
    }),
  });

  const { clientSecret } = await response.json();
  return clientSecret;
};

// Pay influencer
const payInfluencer = async (amount, influencerAccountId, brandAccountId) => {
  const response = await fetch("/stripe/create-influencer-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: amount * 100,
      currency: "usd",
      influencerAccountId,
      brandAccountId,
    }),
  });

  const { clientSecret } = await response.json();
  return clientSecret;
};
```

### React Integration with Stripe Elements

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

    if (!stripe || !elements) return;

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
```

## 🔐 Security

### Environment Variables

- Store all sensitive keys in environment variables
- Never commit secrets to version control
- Use different keys for development and production

### Webhook Security

- Always verify webhook signatures
- Use HTTPS for webhook endpoints
- Implement proper error handling

### Data Protection

- PCI compliance handled by Stripe
- GDPR ready with proper data handling
- Secure headers and CORS configuration

## 📊 Database Schema

Add these fields to your brands table:

```sql
ALTER TABLE brands ADD COLUMN stripe_account_id VARCHAR(255);
ALTER TABLE brands ADD COLUMN stripe_account_status VARCHAR(50);
ALTER TABLE brands ADD COLUMN stripe_charges_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE brands ADD COLUMN stripe_payouts_enabled BOOLEAN DEFAULT FALSE;
```

## 🧪 Testing

Use Stripe's test mode with test cards:

- **Success**: 4242424242424242
- **Decline**: 4000000000000002
- **3D Secure**: 4000002500003155

## 📈 Monitoring

The system includes comprehensive logging and error handling:

- Payment success/failure tracking
- Webhook event processing logs
- Performance metrics collection
- Error rate monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📚 Documentation

- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [Stripe Connect Quickstart](https://stripe.com/docs/connect/quickstart)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

**Built with ❤️ for the Fohr platform**

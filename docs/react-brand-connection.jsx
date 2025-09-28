import React, { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

// Initialize Stripe
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:4000";

/**
 * Brand Account Connection Component
 * Handles the complete flow from account creation to funding
 */
const BrandAccountConnection = ({ brandId, onAccountConnected }) => {
  const [step, setStep] = useState("create"); // create, onboard, fund, complete
  const [accountId, setAccountId] = useState(null);
  const [accountStatus, setAccountStatus] = useState(null);
  const [onboardingUrl, setOnboardingUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Brand data - in real app, this would come from props or context
  const brandData = {
    email: "brand@example.com",
    name: "Brand Name",
    country: "US",
    type: "express",
  };

  /**
   * Step 1: Create Stripe Connect Account
   */
  const createStripeAccount = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/stripe/create-account`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(brandData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setAccountId(data.accountId);

      // Move to onboarding step
      await createOnboardingLink(data.accountId);
    } catch (err) {
      console.error("Error creating Stripe account:", err);
      setError(`Failed to create account: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Step 2: Create Onboarding Link
   */
  const createOnboardingLink = async (accountId) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/stripe/create-account-link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accountId,
            refreshUrl: `${window.location.origin}/brand/onboarding/refresh`,
            returnUrl: `${window.location.origin}/brand/onboarding/success`,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setOnboardingUrl(data.url);
      setStep("onboard");
    } catch (err) {
      console.error("Error creating onboarding link:", err);
      setError(`Failed to create onboarding link: ${err.message}`);
    }
  };

  /**
   * Step 3: Handle Onboarding Return
   */
  const handleOnboardingReturn = async () => {
    setLoading(true);

    try {
      // Check account status
      const response = await fetch(
        `${API_BASE_URL}/stripe/account/${accountId}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setAccountStatus(data.account);

      // Check if onboarding is complete
      if (data.account.charges_enabled && data.account.details_submitted) {
        setStep("fund");
      } else {
        setError("Onboarding not complete. Please try again.");
      }
    } catch (err) {
      console.error("Error checking account status:", err);
      setError(`Failed to verify account: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Step 4: Create Login Link (for existing accounts)
   */
  const createLoginLink = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/stripe/create-login-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      window.open(data.url, "_blank");
    } catch (err) {
      console.error("Error creating login link:", err);
      setError(`Failed to create login link: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get Account Balance
   */
  const getAccountBalance = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/stripe/account/${accountId}/balance`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.balance;
    } catch (err) {
      console.error("Error getting account balance:", err);
      return null;
    }
  };

  /**
   * Payment Form Component for Funding
   */
  const PaymentForm = ({ onPaymentSuccess }) => {
    const stripe = useStripe();
    const elements = useElements();
    const [paymentLoading, setPaymentLoading] = useState(false);

    const handleSubmit = async (event) => {
      event.preventDefault();

      if (!stripe || !elements) {
        return;
      }

      setPaymentLoading(true);

      try {
        // Create payment intent
        const response = await fetch(
          `${API_BASE_URL}/stripe/create-funding-payment`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              amount: 10000, // $100.00 in cents
              currency: "usd",
              brandAccountId: accountId,
              metadata: {
                brandId,
                type: "account_funding",
              },
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const { clientSecret } = await response.json();

        // Confirm payment
        const { error, paymentIntent } = await stripe.confirmCardPayment(
          clientSecret,
          {
            payment_method: {
              card: elements.getElement(CardElement),
            },
          }
        );

        if (error) {
          console.error("Payment failed:", error);
          setError(`Payment failed: ${error.message}`);
        } else if (paymentIntent.status === "succeeded") {
          console.log("Payment succeeded:", paymentIntent);
          onPaymentSuccess(paymentIntent);
        }
      } catch (err) {
        console.error("Error processing payment:", err);
        setError(`Payment error: ${err.message}`);
      } finally {
        setPaymentLoading(false);
      }
    };

    return (
      <form onSubmit={handleSubmit} className="payment-form">
        <div className="form-group">
          <label>Card Details</label>
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: "16px",
                  color: "#424770",
                  "::placeholder": {
                    color: "#aab7c4",
                  },
                },
              },
            }}
          />
        </div>

        <button
          type="submit"
          disabled={!stripe || paymentLoading}
          className="btn btn-primary"
        >
          {paymentLoading ? "Processing..." : "Fund Account ($100)"}
        </button>
      </form>
    );
  };

  /**
   * Render different steps
   */
  const renderStep = () => {
    switch (step) {
      case "create":
        return (
          <div className="step-container">
            <h3>Connect Your Account</h3>
            <p>
              Create a Stripe Connect account to start accepting payments and
              paying influencers.
            </p>

            <div className="brand-info">
              <p>
                <strong>Email:</strong> {brandData.email}
              </p>
              <p>
                <strong>Name:</strong> {brandData.name}
              </p>
              <p>
                <strong>Country:</strong> {brandData.country}
              </p>
            </div>

            <button
              onClick={createStripeAccount}
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? "Creating Account..." : "Create Stripe Account"}
            </button>
          </div>
        );

      case "onboard":
        return (
          <div className="step-container">
            <h3>Complete Onboarding</h3>
            <p>Complete your Stripe onboarding to enable payments.</p>

            <div className="account-info">
              <p>
                <strong>Account ID:</strong> {accountId}
              </p>
            </div>

            <button
              onClick={() => window.open(onboardingUrl, "_blank")}
              className="btn btn-primary"
            >
              Complete Onboarding
            </button>

            <button
              onClick={handleOnboardingReturn}
              disabled={loading}
              className="btn btn-secondary"
            >
              {loading ? "Checking Status..." : "I've Completed Onboarding"}
            </button>
          </div>
        );

      case "fund":
        return (
          <div className="step-container">
            <h3>Fund Your Account</h3>
            <p>Add funds to your account to start paying influencers.</p>

            <div className="account-status">
              <p>
                <strong>Account Status:</strong> ✅ Active
              </p>
              <p>
                <strong>Charges Enabled:</strong>{" "}
                {accountStatus?.charges_enabled ? "✅" : "❌"}
              </p>
              <p>
                <strong>Payouts Enabled:</strong>{" "}
                {accountStatus?.payouts_enabled ? "✅" : "❌"}
              </p>
            </div>

            <Elements stripe={stripePromise}>
              <PaymentForm onPaymentSuccess={() => setStep("complete")} />
            </Elements>

            <button
              onClick={createLoginLink}
              disabled={loading}
              className="btn btn-secondary"
            >
              {loading ? "Creating Link..." : "Manage Account"}
            </button>
          </div>
        );

      case "complete":
        return (
          <div className="step-container success">
            <h3>🎉 Account Connected Successfully!</h3>
            <p>Your Stripe Connect account is now active and ready to use.</p>

            <div className="next-steps">
              <h4>Next Steps:</h4>
              <ul>
                <li>Start creating campaigns</li>
                <li>Connect influencer accounts</li>
                <li>Process payments</li>
              </ul>
            </div>

            <button
              onClick={() =>
                onAccountConnected && onAccountConnected(accountId)
              }
              className="btn btn-primary"
            >
              Continue to Dashboard
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="brand-account-connection">
      <div className="header">
        <h2>Brand Account Setup</h2>
        <div className="progress-indicator">
          <span className={step === "create" ? "active" : ""}>1. Create</span>
          <span className={step === "onboard" ? "active" : ""}>2. Onboard</span>
          <span className={step === "fund" ? "active" : ""}>3. Fund</span>
          <span className={step === "complete" ? "active" : ""}>
            4. Complete
          </span>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p>❌ {error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {renderStep()}

      {/* Account Balance Component */}
      {accountId && <AccountBalance accountId={accountId} />}
    </div>
  );
};

/**
 * Account Balance Component
 */
const AccountBalance = ({ accountId }) => {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchBalance = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/stripe/account/${accountId}/balance`
      );

      if (response.ok) {
        const data = await response.json();
        setBalance(data.balance);
      }
    } catch (err) {
      console.error("Error fetching balance:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, [accountId]);

  if (loading) {
    return <div className="balance-loading">Loading balance...</div>;
  }

  if (!balance) {
    return null;
  }

  return (
    <div className="account-balance">
      <h4>Account Balance</h4>
      {balance.available.map((item, index) => (
        <div key={index} className="balance-item">
          <span className="amount">${(item.amount / 100).toFixed(2)}</span>
          <span className="currency">{item.currency.toUpperCase()}</span>
          <span className="type">
            {item.source_types.card ? "Card" : "Bank"}
          </span>
        </div>
      ))}
    </div>
  );
};

export default BrandAccountConnection;

// Usage Example:
/*
import BrandAccountConnection from './components/BrandAccountConnection';

function App() {
  const handleAccountConnected = (accountId) => {
    console.log('Account connected:', accountId);
    // Redirect to dashboard or update app state
  };

  return (
    <div className="App">
      <BrandAccountConnection 
        brandId="brand_123"
        onAccountConnected={handleAccountConnected}
      />
    </div>
  );
}
*/

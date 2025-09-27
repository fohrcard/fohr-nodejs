const express = require("express");
const router = express.Router();
const StripeService = require("../services/stripe");

// Create a Stripe Connect account for a brand
router.post("/create-account", async (req, res) => {
  try {
    const { email, name, country, type } = req.body;

    const account = await StripeService.createConnectAccount({
      email,
      name,
      country,
      type: type || "express",
    });

    res.json({ accountId: account.id, account });
  } catch (error) {
    console.error("Error creating Stripe account:", error);
    res.status(500).json({ error: "Failed to create Stripe account" });
  }
});

// Create account link for onboarding
router.post("/create-account-link", async (req, res) => {
  try {
    const { accountId, refreshUrl, returnUrl } = req.body;

    const accountLink = await StripeService.createAccountLink(
      accountId,
      refreshUrl,
      returnUrl
    );

    res.json({ url: accountLink.url });
  } catch (error) {
    console.error("Error creating account link:", error);
    res.status(500).json({ error: "Failed to create account link" });
  }
});

// Create login link for existing accounts
router.post("/create-login-link", async (req, res) => {
  try {
    const { accountId } = req.body;

    const loginLink = await StripeService.createLoginLink(accountId);

    res.json({ url: loginLink.url });
  } catch (error) {
    console.error("Error creating login link:", error);
    res.status(500).json({ error: "Failed to create login link" });
  }
});

// Get account details
router.get("/account/:accountId", async (req, res) => {
  try {
    const { accountId } = req.params;

    const account = await StripeService.getAccount(accountId);

    res.json({ account });
  } catch (error) {
    console.error("Error retrieving account:", error);
    res.status(500).json({ error: "Failed to retrieve account" });
  }
});

// Create payment intent for funding brand account
router.post("/create-funding-payment", async (req, res) => {
  try {
    const { amount, currency, brandAccountId, metadata } = req.body;

    const paymentIntent = await StripeService.createFundingPaymentIntent(
      amount,
      currency,
      brandAccountId,
      metadata
    );

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Error creating funding payment:", error);
    res.status(500).json({ error: "Failed to create funding payment" });
  }
});

// Create payment intent for paying influencer
router.post("/create-influencer-payment", async (req, res) => {
  try {
    const { amount, currency, influencerAccountId, brandAccountId, metadata } =
      req.body;

    const paymentIntent = await StripeService.createInfluencerPaymentIntent(
      amount,
      currency,
      influencerAccountId,
      brandAccountId,
      metadata
    );

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Error creating influencer payment:", error);
    res.status(500).json({ error: "Failed to create influencer payment" });
  }
});

// Get account balance
router.get("/account/:accountId/balance", async (req, res) => {
  try {
    const { accountId } = req.params;

    const balance = await StripeService.getAccountBalance(accountId);

    res.json({ balance });
  } catch (error) {
    console.error("Error retrieving account balance:", error);
    res.status(500).json({ error: "Failed to retrieve account balance" });
  }
});

// Create payout for brand
router.post("/create-payout", async (req, res) => {
  try {
    const { amount, currency, accountId, metadata } = req.body;

    const payout = await StripeService.createPayout(
      amount,
      currency,
      accountId,
      metadata
    );

    res.json({ payout });
  } catch (error) {
    console.error("Error creating payout:", error);
    res.status(500).json({ error: "Failed to create payout" });
  }
});

// List transfers for an account
router.get("/account/:accountId/transfers", async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit = 10, starting_after } = req.query;

    const transfers = await StripeService.listTransfers(accountId, {
      limit: parseInt(limit),
      starting_after,
    });

    res.json({ transfers });
  } catch (error) {
    console.error("Error listing transfers:", error);
    res.status(500).json({ error: "Failed to list transfers" });
  }
});

// Stripe webhook handler
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    try {
      const event = StripeService.verifyWebhookSignature(
        req.body,
        sig,
        endpointSecret
      );

      // Handle the event
      switch (event.type) {
        case "account.updated":
          console.log("Account updated:", event.data.object.id);
          // Update your database with account status
          break;
        case "payment_intent.succeeded":
          console.log("Payment succeeded:", event.data.object.id);
          // Handle successful payment
          break;
        case "transfer.created":
          console.log("Transfer created:", event.data.object.id);
          // Handle transfer creation
          break;
        default:
          console.log(`Unhandled event type ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook signature verification failed:", error);
      res.status(400).send(`Webhook Error: ${error.message}`);
    }
  }
);

module.exports = router;

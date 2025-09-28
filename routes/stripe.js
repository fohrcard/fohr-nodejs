const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const StripeService = require("../services/stripe");

const getAccountsFromDisk = () => {
  try {
    // Read the JSON file
    const jsonString = fs.readFileSync(
      path.join(__dirname, "accounts.json"),
      "utf8"
    );
    // Parse JSON string to object
    const data = JSON.parse(jsonString);

    return data;
  } catch (err) {
    console.error("Error reading or parsing the JSON file:", err);
  }
};

const updateBrand = (updates) => {
  const accounts = getAccountsFromDisk();

  const { brands } = accounts;

  const updatedBrand = {
    ...brands[0],
    ...updates,
  };

  updateAccounts({ ...accounts, brands: [updatedBrand] });
};

const updateCreator = (email, updates) => {
  const accounts = getAccountsFromDisk();

  const { creators } = accounts;

  const creator = creators.find((c) => c.email === email);

  let updatedCreators;

  if (!creator) {
    updatedCreators = [...creators, updates];
  } else {
    updatedCreators = creators.map((c) => {
      if (c.id === creator.id) {
        return {
          ...c,
          ...updates,
        };
      }

      return c;
    });
  }

  updateAccounts({ ...accounts, creators: updatedCreators });
};

const updateAccounts = (accounts) => {
  const jsonString = JSON.stringify(accounts, null, 2);

  fs.writeFileSync(path.join(__dirname, "accounts.json"), jsonString);
};

// Create a Stripe Connect account for a brand
router.post("/create-account", async (req, res) => {
  try {
    // TODO: This is just for test purposes and should be the email of the actual user
    const { email, name } = req.body;

    const isBrand = !email;

    console.log("Email", email, isBrand);

    const brand = getAccountsFromDisk().brands[0];

    const params = isBrand
      ? { email: brand.email, name: brand.name }
      : { email, name };

    const account = await StripeService.createConnectAccount(params, isBrand);

    const updates = {
      accountId: account.id,
      disconnectedBy: null,
      disconnectedOn: null,
    };

    if (isBrand) {
      updateBrand(updates);
    } else {
      updateCreator(email, { ...updates, email });
    }

    const accountLink = await StripeService.createAccountLink(
      account.id,
      "http://localhost:5173/settings/payments",
      "http://localhost:5173/settings/payments"
    );

    res.json({ accountId: account.id, url: accountLink.url });
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
router.get("/account/:account_id?", async (req, res) => {
  try {
    // TODO: This is just for testing. The email should come from the authenticated user
    const { email } = req.query;

    const { brands, creators } = getAccountsFromDisk();

    let entity = null;

    if (email) {
      entity = creators.find((c) => c.email === email);
    } else {
      entity = brands[0];
    }

    const { accountId, disconnectedBy, disconnectedOn } = entity;

    if (!accountId) {
      res.json({ account: { disconnectedBy, disconnectedOn } }).end();

      return;
    }

    const account = await StripeService.getAccount(accountId);

    if (!account) {
      res.json({ account: null }).end();

      return;
    }

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

// Account cleanup routes

// Get cleanup summary (list all accounts without deleting)
router.get("/cleanup/summary", async (req, res) => {
  try {
    const { limit = 100, starting_after } = req.query;

    const summary = await StripeService.getCleanupSummary({
      limit: parseInt(limit),
      starting_after,
    });

    res.json({ summary });
  } catch (error) {
    console.error("Error getting cleanup summary:", error);
    res.status(500).json({ error: "Failed to get cleanup summary" });
  }
});

// List all connected accounts
router.get("/accounts", async (req, res) => {
  try {
    const { limit = 100, starting_after } = req.query;

    const accounts = await StripeService.listAllConnectedAccounts({
      limit: parseInt(limit),
      starting_after,
    });

    res.json({ accounts: accounts.data, has_more: accounts.has_more });
  } catch (error) {
    console.error("Error listing connected accounts:", error);
    res.status(500).json({ error: "Failed to list connected accounts" });
  }
});

// Delete a specific connected account
router.delete("/account/:accountId", async (req, res) => {
  try {
    const { accountId } = req.params;

    const { brands, creators } = getAccountsFromDisk();

    const isBrand = brands[0].accountId === accountId;

    const deletedAccount = await StripeService.deleteConnectedAccount(
      accountId
    );

    const updates = {
      accountId: null,
      disconnectedBy: "Mihovil Kovacevic",
      disconnectedOn: "2025-09-27T20:47:15.442Z",
    };

    if (isBrand) {
      updateBrand(updates);
    } else {
      const creator = creators.find((c) => c.accountId === accountId);

      updateCreator(creator.email, updates);
    }

    res.json({
      message: "Account deleted successfully",
      account: deletedAccount,
    });
  } catch (error) {
    console.error("Error deleting connected account:", error);
    res.status(500).json({ error: "Failed to delete connected account" });
  }
});

// Delete all connected accounts (DANGER ZONE!)
router.delete("/cleanup/all", async (req, res) => {
  try {
    const { confirm } = req.body;

    // Require explicit confirmation
    if (confirm !== "DELETE_ALL_ACCOUNTS") {
      return res.status(400).json({
        error:
          "Confirmation required. Send { confirm: 'DELETE_ALL_ACCOUNTS' } in request body.",
      });
    }

    const results = await StripeService.deleteAllConnectedAccounts();

    res.json({
      message: "Account cleanup completed",
      results,
    });
  } catch (error) {
    console.error("Error in account cleanup:", error);
    res.status(500).json({ error: "Failed to cleanup accounts" });
  }
});

// Delete accounts by email domain
router.delete("/cleanup/by-domain", async (req, res) => {
  try {
    const { domain, confirm } = req.body;

    if (!domain) {
      return res.status(400).json({
        error: "Domain parameter required (e.g., '@test.com')",
      });
    }

    if (confirm !== "DELETE_BY_DOMAIN") {
      return res.status(400).json({
        error:
          "Confirmation required. Send { confirm: 'DELETE_BY_DOMAIN' } in request body.",
      });
    }

    const results = await StripeService.deleteAccountsByEmailDomain(domain);

    res.json({
      message: `Account cleanup completed for domain: ${domain}`,
      results,
    });
  } catch (error) {
    console.error("Error in domain cleanup:", error);
    res.status(500).json({ error: "Failed to cleanup accounts by domain" });
  }
});

// Stripe webhook handler
router.post("/webhook", async (req, res) => {
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
});

module.exports = router;

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

class StripeService {
  /**
   * Create a Stripe Connect account for a brand
   * @param {Object} brandData - Brand information
   * @param {string} brandData.email - Brand email
   * @param {string} brandData.name - Brand name
   * @param {string} brandData.country - Brand country code (e.g., 'US')
   * @param {string} brandData.type - Account type ('express' or 'standard')
   * @returns {Promise<Object>} Stripe account object
   */
  async createConnectAccount(brandData, isBrand) {
    try {
      const account = await stripe.accounts.create({
        type: brandData.type || "standard",
        country: brandData.country,
        email: brandData.email,
        business_type: isBrand ? "company" : "individual",
        company: {
          name: brandData.name,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        settings: {
          payouts: {
            schedule: {
              interval: "daily",
            },
          },
        },
      });

      return account;
    } catch (error) {
      console.error("Error creating Stripe Connect account:", error);
      throw error;
    }
  }

  /**
   * Create an account link for onboarding
   * @param {string} accountId - Stripe Connect account ID
   * @param {string} refreshUrl - URL to redirect to if link expires
   * @param {string} returnUrl - URL to redirect to after onboarding
   * @returns {Promise<Object>} Account link object
   */
  async createAccountLink(accountId, refreshUrl, returnUrl) {
    try {
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });

      return accountLink;
    } catch (error) {
      console.error("Error creating account link:", error);
      throw error;
    }
  }

  /**
   * Create a login link for existing accounts
   * @param {string} accountId - Stripe Connect account ID
   * @returns {Promise<Object>} Login link object
   */
  async createLoginLink(accountId) {
    try {
      const loginLink = await stripe.accounts.createLoginLink(accountId);
      return loginLink;
    } catch (error) {
      console.error("Error creating login link:", error);
      throw error;
    }
  }

  /**
   * Get account details
   * @param {string} accountId - Stripe Connect account ID
   * @returns {Promise<Object>} Account details
   */
  async getAccount(accountId) {
    try {
      const account = await stripe.accounts.retrieve(accountId);
      return account;
    } catch (error) {
      console.error("Error retrieving account:", error);
      throw error;
    }
  }

  /**
   * Create a payment intent for funding a brand's account
   * @param {number} amount - Amount in cents
   * @param {string} currency - Currency code (e.g., 'usd')
   * @param {string} brandAccountId - Stripe Connect account ID
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Payment intent object
   */
  async createFundingPaymentIntent(
    amount,
    currency,
    brandAccountId,
    metadata = {}
  ) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        application_fee_amount: Math.round(amount * 0.029), // 2.9% platform fee
        transfer_data: {
          destination: brandAccountId,
        },
        metadata: {
          type: "account_funding",
          ...metadata,
        },
      });

      return paymentIntent;
    } catch (error) {
      console.error("Error creating funding payment intent:", error);
      throw error;
    }
  }

  /**
   * Create a transfer to pay an influencer
   * @param {number} amount - Amount in cents
   * @param {string} currency - Currency code
   * @param {string} influencerAccountId - Influencer's Stripe Connect account ID
   * @param {string} brandAccountId - Brand's Stripe Connect account ID
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Transfer object
   */
  async createInfluencerPayment(
    amount,
    currency,
    influencerAccountId,
    brandAccountId,
    metadata = {}
  ) {
    try {
      const transfer = await stripe.transfers.create({
        amount,
        currency,
        destination: influencerAccountId,
        source_transaction: null, // Will be set when payment is made
        metadata: {
          type: "influencer_payment",
          brand_account: brandAccountId,
          ...metadata,
        },
      });

      return transfer;
    } catch (error) {
      console.error("Error creating influencer payment:", error);
      throw error;
    }
  }

  /**
   * Create a payment intent for paying an influencer
   * @param {number} amount - Amount in cents
   * @param {string} currency - Currency code
   * @param {string} influencerAccountId - Influencer's Stripe Connect account ID
   * @param {string} brandAccountId - Brand's Stripe Connect account ID
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Payment intent object
   */
  async createInfluencerPaymentIntent(
    amount,
    currency,
    influencerAccountId,
    brandAccountId,
    metadata = {}
  ) {
    try {
      const platformFee = Math.round(amount * 0.029); // 2.9% platform fee

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        application_fee_amount: platformFee,
        transfer_data: {
          destination: influencerAccountId,
        },
        metadata: {
          type: "influencer_payment",
          brand_account: brandAccountId,
          influencer_account: influencerAccountId,
          ...metadata,
        },
      });

      return paymentIntent;
    } catch (error) {
      console.error("Error creating influencer payment intent:", error);
      throw error;
    }
  }

  /**
   * Get account balance
   * @param {string} accountId - Stripe Connect account ID
   * @returns {Promise<Object>} Balance object
   */
  async getAccountBalance(accountId) {
    try {
      const balance = await stripe.balance.retrieve({
        stripeAccount: accountId,
      });

      return balance;
    } catch (error) {
      console.error("Error retrieving account balance:", error);
      throw error;
    }
  }

  /**
   * Create a payout for a brand
   * @param {number} amount - Amount in cents
   * @param {string} currency - Currency code
   * @param {string} accountId - Stripe Connect account ID
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Payout object
   */
  async createPayout(amount, currency, accountId, metadata = {}) {
    try {
      const payout = await stripe.payouts.create(
        {
          amount,
          currency,
          metadata,
        },
        {
          stripeAccount: accountId,
        }
      );

      return payout;
    } catch (error) {
      console.error("Error creating payout:", error);
      throw error;
    }
  }

  /**
   * List transfers for an account
   * @param {string} accountId - Stripe Connect account ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Transfers list
   */
  async listTransfers(accountId, options = {}) {
    try {
      const transfers = await stripe.transfers.list({
        destination: accountId,
        ...options,
      });

      return transfers;
    } catch (error) {
      console.error("Error listing transfers:", error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   * @param {string} payload - Raw request body
   * @param {string} signature - Stripe signature header
   * @param {string} endpointSecret - Webhook endpoint secret
   * @returns {Object} Event object
   */
  verifyWebhookSignature(payload, signature, endpointSecret) {
    try {
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        endpointSecret
      );
      return event;
    } catch (error) {
      console.error("Error verifying webhook signature:", error);
      throw error;
    }
  }

  /**
   * Fetch all connected accounts
   * @param {Object} options - Query options (limit, starting_after, etc.)
   * @returns {Promise<Object>} List of connected accounts
   */
  async listAllConnectedAccounts(options = {}) {
    try {
      const accounts = await stripe.accounts.list({
        limit: 100,
        ...options,
      });

      return accounts;
    } catch (error) {
      console.error("Error listing connected accounts:", error);
      throw error;
    }
  }

  /**
   * Delete a specific connected account
   * @param {string} accountId - Stripe Connect account ID
   * @returns {Promise<Object>} Deleted account object
   */
  async deleteConnectedAccount(accountId) {
    try {
      const deletedAccount = await stripe.accounts.del(accountId);
      console.log(`Deleted account: ${accountId}`);
      return deletedAccount;
    } catch (error) {
      console.error(`Error deleting account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Delete all connected accounts (use with caution!)
   * @param {Object} options - Query options for listing accounts
   * @returns {Promise<Object>} Summary of deletion results
   */
  async deleteAllConnectedAccounts(options = {}) {
    try {
      console.log("Starting to delete all connected accounts...");

      // Get all connected accounts
      const accounts = await this.listAllConnectedAccounts(options);

      if (accounts.data.length === 0) {
        console.log("No connected accounts found to delete.");
        return {
          total: 0,
          deleted: 0,
          failed: 0,
          results: [],
        };
      }

      console.log(
        `Found ${accounts.data.length} connected accounts to delete.`
      );

      const results = {
        total: accounts.data.length,
        deleted: 0,
        failed: 0,
        results: [],
      };

      // Delete each account
      for (const account of accounts.data) {
        try {
          const deletedAccount = await this.deleteConnectedAccount(account.id);
          results.deleted++;
          results.results.push({
            accountId: account.id,
            email: account.email,
            status: "deleted",
            deletedAt: new Date().toISOString(),
          });

          // Add a small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(
            `Failed to delete account ${account.id}:`,
            error.message
          );
          results.failed++;
          results.results.push({
            accountId: account.id,
            email: account.email,
            status: "failed",
            error: error.message,
          });
        }
      }

      console.log(
        `Deletion complete: ${results.deleted} deleted, ${results.failed} failed`
      );
      return results;
    } catch (error) {
      console.error("Error in deleteAllConnectedAccounts:", error);
      throw error;
    }
  }

  /**
   * Delete connected accounts by email domain
   * @param {string} emailDomain - Email domain to match (e.g., '@test.com')
   * @returns {Promise<Object>} Summary of deletion results
   */
  async deleteAccountsByEmailDomain(emailDomain) {
    try {
      console.log(`Deleting accounts with email domain: ${emailDomain}`);

      const accounts = await this.listAllConnectedAccounts();
      const filteredAccounts = accounts.data.filter(
        (account) => account.email && account.email.endsWith(emailDomain)
      );

      if (filteredAccounts.length === 0) {
        console.log(`No accounts found with email domain: ${emailDomain}`);
        return {
          total: 0,
          deleted: 0,
          failed: 0,
          results: [],
        };
      }

      console.log(
        `Found ${filteredAccounts.length} accounts with domain ${emailDomain}`
      );

      const results = {
        total: filteredAccounts.length,
        deleted: 0,
        failed: 0,
        results: [],
      };

      for (const account of filteredAccounts) {
        try {
          const deletedAccount = await this.deleteConnectedAccount(account.id);
          results.deleted++;
          results.results.push({
            accountId: account.id,
            email: account.email,
            status: "deleted",
            deletedAt: new Date().toISOString(),
          });

          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(
            `Failed to delete account ${account.id}:`,
            error.message
          );
          results.failed++;
          results.results.push({
            accountId: account.id,
            email: account.email,
            status: "failed",
            error: error.message,
          });
        }
      }

      console.log(
        `Domain deletion complete: ${results.deleted} deleted, ${results.failed} failed`
      );
      return results;
    } catch (error) {
      console.error("Error in deleteAccountsByEmailDomain:", error);
      throw error;
    }
  }

  /**
   * Get account cleanup summary (without deleting)
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Summary of accounts that would be deleted
   */
  async getCleanupSummary(options = {}) {
    try {
      const accounts = await this.listAllConnectedAccounts(options);

      const summary = {
        total: accounts.data.length,
        byStatus: {},
        byCountry: {},
        byType: {},
        accounts: accounts.data.map((account) => ({
          id: account.id,
          email: account.email,
          country: account.country,
          type: account.type,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          created: new Date(account.created * 1000).toISOString(),
        })),
      };

      // Group by status
      accounts.data.forEach((account) => {
        const status = account.charges_enabled ? "active" : "incomplete";
        summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;

        summary.byCountry[account.country] =
          (summary.byCountry[account.country] || 0) + 1;
        summary.byType[account.type] = (summary.byType[account.type] || 0) + 1;
      });

      return summary;
    } catch (error) {
      console.error("Error getting cleanup summary:", error);
      throw error;
    }
  }
}

module.exports = new StripeService();

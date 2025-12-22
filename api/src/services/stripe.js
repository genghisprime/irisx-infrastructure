/**
 * Stripe Payment Integration Service
 * Full payment processing with Stripe
 *
 * Features:
 * - Customer management (create, update, delete)
 * - Payment methods (cards, bank accounts)
 * - Subscriptions for recurring billing
 * - One-time payments for usage charges
 * - Invoice generation and synchronization
 * - Webhook handling for payment events
 *
 * Based on: IRIS_Billing_Payments.md
 */

import Stripe from 'stripe';
import { query } from '../db/connection.js';
import billingService from './billing.js';
import dunningService from './dunning.js';

class StripeService {
  constructor() {
    this.stripe = null;
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    this.initStripe();
  }

  initStripe() {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (apiKey) {
      this.stripe = new Stripe(apiKey, {
        apiVersion: '2024-11-20.acacia'
      });
      console.log('[Stripe] Initialized successfully');
    } else {
      console.warn('[Stripe] STRIPE_SECRET_KEY not configured - payment processing disabled');
    }
  }

  isConfigured() {
    return this.stripe !== null;
  }

  // ===== CUSTOMER MANAGEMENT =====

  /**
   * Create or get Stripe customer for a tenant
   */
  async getOrCreateCustomer(tenantId) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      // Check if tenant already has a Stripe customer ID
      const tenantResult = await query(
        `SELECT stripe_customer_id, name, email, billing_email
         FROM tenants WHERE id = $1`,
        [tenantId]
      );

      if (tenantResult.rows.length === 0) {
        throw new Error('Tenant not found');
      }

      const tenant = tenantResult.rows[0];

      // Return existing customer if we have one
      if (tenant.stripe_customer_id) {
        try {
          const customer = await this.stripe.customers.retrieve(tenant.stripe_customer_id);
          if (!customer.deleted) {
            return customer;
          }
        } catch (error) {
          // Customer doesn't exist in Stripe, create new one
          console.warn(`[Stripe] Customer ${tenant.stripe_customer_id} not found in Stripe, creating new`);
        }
      }

      // Create new Stripe customer
      const customer = await this.stripe.customers.create({
        email: tenant.billing_email || tenant.email,
        name: tenant.name,
        metadata: {
          tenant_id: tenantId.toString(),
          platform: 'irisx'
        }
      });

      // Save Stripe customer ID to tenant
      await query(
        `UPDATE tenants SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2`,
        [customer.id, tenantId]
      );

      console.log(`[Stripe] Created customer ${customer.id} for tenant ${tenantId}`);
      return customer;

    } catch (error) {
      console.error('[Stripe] Error getting/creating customer:', error);
      throw error;
    }
  }

  /**
   * Update Stripe customer details
   */
  async updateCustomer(tenantId, updates) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      const customer = await this.getOrCreateCustomer(tenantId);

      const updatedCustomer = await this.stripe.customers.update(customer.id, {
        email: updates.email,
        name: updates.name,
        phone: updates.phone,
        address: updates.address,
        metadata: {
          ...customer.metadata,
          ...updates.metadata
        }
      });

      return updatedCustomer;

    } catch (error) {
      console.error('[Stripe] Error updating customer:', error);
      throw error;
    }
  }

  // ===== PAYMENT METHODS =====

  /**
   * Create a SetupIntent for adding a payment method
   */
  async createSetupIntent(tenantId) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      const customer = await this.getOrCreateCustomer(tenantId);

      const setupIntent = await this.stripe.setupIntents.create({
        customer: customer.id,
        payment_method_types: ['card'],
        usage: 'off_session',
        metadata: {
          tenant_id: tenantId.toString()
        }
      });

      return {
        client_secret: setupIntent.client_secret,
        setup_intent_id: setupIntent.id
      };

    } catch (error) {
      console.error('[Stripe] Error creating setup intent:', error);
      throw error;
    }
  }

  /**
   * Attach payment method to customer and save to DB
   */
  async attachPaymentMethod(tenantId, paymentMethodId, setAsDefault = true) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      const customer = await this.getOrCreateCustomer(tenantId);

      // Attach payment method to customer
      const paymentMethod = await this.stripe.paymentMethods.attach(
        paymentMethodId,
        { customer: customer.id }
      );

      // Set as default if requested
      if (setAsDefault) {
        await this.stripe.customers.update(customer.id, {
          invoice_settings: {
            default_payment_method: paymentMethodId
          }
        });
      }

      // Save to our database
      const savedMethod = await billingService.createPaymentMethod(tenantId, {
        provider: 'stripe',
        provider_payment_method_id: paymentMethod.id,
        type: paymentMethod.type,
        brand: paymentMethod.card?.brand,
        last4: paymentMethod.card?.last4,
        exp_month: paymentMethod.card?.exp_month,
        exp_year: paymentMethod.card?.exp_year,
        is_default: setAsDefault
      });

      return {
        payment_method: savedMethod,
        stripe_payment_method: paymentMethod
      };

    } catch (error) {
      console.error('[Stripe] Error attaching payment method:', error);
      throw error;
    }
  }

  /**
   * List payment methods for a customer from Stripe
   */
  async listPaymentMethods(tenantId, type = 'card') {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      const customer = await this.getOrCreateCustomer(tenantId);

      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customer.id,
        type: type
      });

      return paymentMethods.data;

    } catch (error) {
      console.error('[Stripe] Error listing payment methods:', error);
      throw error;
    }
  }

  /**
   * Detach (remove) a payment method
   */
  async detachPaymentMethod(tenantId, paymentMethodId) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      // Detach from Stripe
      await this.stripe.paymentMethods.detach(paymentMethodId);

      // Soft delete from our database
      await billingService.deletePaymentMethod(paymentMethodId, tenantId);

      return { success: true };

    } catch (error) {
      console.error('[Stripe] Error detaching payment method:', error);
      throw error;
    }
  }

  // ===== SUBSCRIPTIONS =====

  /**
   * Create a subscription for a tenant
   */
  async createSubscription(tenantId, priceId, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      const customer = await this.getOrCreateCustomer(tenantId);

      // Check if customer has a default payment method
      if (!customer.invoice_settings?.default_payment_method) {
        throw new Error('No default payment method. Please add a payment method first.');
      }

      const subscription = await this.stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription'
        },
        expand: ['latest_invoice.payment_intent'],
        trial_period_days: options.trial_days || null,
        metadata: {
          tenant_id: tenantId.toString(),
          plan_type: options.plan_type || 'standard'
        }
      });

      // Save subscription to our database
      await query(`
        INSERT INTO tenant_subscriptions (
          tenant_id, stripe_subscription_id, stripe_price_id,
          status, current_period_start, current_period_end, plan_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id) DO UPDATE SET
          stripe_subscription_id = EXCLUDED.stripe_subscription_id,
          stripe_price_id = EXCLUDED.stripe_price_id,
          status = EXCLUDED.status,
          current_period_start = EXCLUDED.current_period_start,
          current_period_end = EXCLUDED.current_period_end,
          plan_type = EXCLUDED.plan_type,
          updated_at = NOW()
      `, [
        tenantId,
        subscription.id,
        priceId,
        subscription.status,
        new Date(subscription.current_period_start * 1000),
        new Date(subscription.current_period_end * 1000),
        options.plan_type || 'standard'
      ]);

      return subscription;

    } catch (error) {
      console.error('[Stripe] Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(tenantId, immediately = false) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      const subResult = await query(
        `SELECT stripe_subscription_id FROM tenant_subscriptions WHERE tenant_id = $1`,
        [tenantId]
      );

      if (subResult.rows.length === 0 || !subResult.rows[0].stripe_subscription_id) {
        throw new Error('No active subscription found');
      }

      const subscriptionId = subResult.rows[0].stripe_subscription_id;

      let subscription;
      if (immediately) {
        subscription = await this.stripe.subscriptions.cancel(subscriptionId);
      } else {
        subscription = await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });
      }

      // Update our database
      await query(`
        UPDATE tenant_subscriptions
        SET status = $1, cancel_at_period_end = $2, updated_at = NOW()
        WHERE tenant_id = $3
      `, [subscription.status, subscription.cancel_at_period_end, tenantId]);

      return subscription;

    } catch (error) {
      console.error('[Stripe] Error canceling subscription:', error);
      throw error;
    }
  }

  /**
   * Get subscription status
   */
  async getSubscription(tenantId) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      const subResult = await query(
        `SELECT * FROM tenant_subscriptions WHERE tenant_id = $1`,
        [tenantId]
      );

      if (subResult.rows.length === 0) {
        return null;
      }

      const dbSub = subResult.rows[0];

      // Fetch latest from Stripe
      if (dbSub.stripe_subscription_id) {
        const stripeSub = await this.stripe.subscriptions.retrieve(dbSub.stripe_subscription_id);
        return {
          ...dbSub,
          stripe_status: stripeSub.status,
          stripe_data: stripeSub
        };
      }

      return dbSub;

    } catch (error) {
      console.error('[Stripe] Error getting subscription:', error);
      throw error;
    }
  }

  // ===== ONE-TIME PAYMENTS =====

  /**
   * Create a PaymentIntent for a one-time charge
   */
  async createPaymentIntent(tenantId, amount, currency = 'usd', options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      const customer = await this.getOrCreateCustomer(tenantId);

      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency,
        customer: customer.id,
        automatic_payment_methods: {
          enabled: true
        },
        description: options.description || 'IRISX Usage Charge',
        metadata: {
          tenant_id: tenantId.toString(),
          invoice_id: options.invoice_id?.toString(),
          ...options.metadata
        }
      });

      return {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        amount: amount,
        currency: currency
      };

    } catch (error) {
      console.error('[Stripe] Error creating payment intent:', error);
      throw error;
    }
  }

  /**
   * Charge a customer using their default payment method
   */
  async chargeCustomer(tenantId, amount, currency = 'usd', options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      const customer = await this.getOrCreateCustomer(tenantId);

      if (!customer.invoice_settings?.default_payment_method) {
        throw new Error('No default payment method');
      }

      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: currency,
        customer: customer.id,
        payment_method: customer.invoice_settings.default_payment_method,
        off_session: true,
        confirm: true,
        description: options.description || 'IRISX Usage Charge',
        metadata: {
          tenant_id: tenantId.toString(),
          invoice_id: options.invoice_id?.toString(),
          ...options.metadata
        }
      });

      // Update invoice status if applicable
      if (options.invoice_id) {
        await billingService.updateInvoiceStatus(options.invoice_id, 'paid', {
          stripe_payment_intent_id: paymentIntent.id
        });
      }

      return paymentIntent;

    } catch (error) {
      console.error('[Stripe] Error charging customer:', error);

      // Handle specific Stripe errors
      if (error.code === 'authentication_required') {
        // Payment requires 3D Secure authentication
        throw new Error('Payment requires authentication. Please complete verification.');
      }
      if (error.code === 'card_declined') {
        throw new Error('Card was declined. Please try another payment method.');
      }

      throw error;
    }
  }

  // ===== INVOICES =====

  /**
   * Create a Stripe invoice from our invoice
   */
  async createStripeInvoice(invoiceId, tenantId) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      const customer = await this.getOrCreateCustomer(tenantId);

      // Get our invoice details
      const invoice = await billingService.getInvoice(invoiceId, tenantId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      const lineItems = await billingService.getInvoiceLineItems(invoiceId);

      // Create Stripe invoice
      const stripeInvoice = await this.stripe.invoices.create({
        customer: customer.id,
        auto_advance: false, // Don't auto-finalize
        collection_method: 'charge_automatically',
        metadata: {
          invoice_id: invoiceId.toString(),
          tenant_id: tenantId.toString()
        }
      });

      // Add line items
      for (const item of lineItems) {
        await this.stripe.invoiceItems.create({
          customer: customer.id,
          invoice: stripeInvoice.id,
          amount: Math.round(parseFloat(item.amount) * 100),
          currency: 'usd',
          description: item.description
        });
      }

      // Finalize the invoice
      const finalizedInvoice = await this.stripe.invoices.finalizeInvoice(stripeInvoice.id);

      // Update our invoice with Stripe ID
      await billingService.updateInvoiceStatus(invoiceId, 'pending', {
        stripe_invoice_id: finalizedInvoice.id
      });

      return finalizedInvoice;

    } catch (error) {
      console.error('[Stripe] Error creating Stripe invoice:', error);
      throw error;
    }
  }

  /**
   * Pay a Stripe invoice
   */
  async payInvoice(stripeInvoiceId) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      const paidInvoice = await this.stripe.invoices.pay(stripeInvoiceId);
      return paidInvoice;
    } catch (error) {
      console.error('[Stripe] Error paying invoice:', error);
      throw error;
    }
  }

  /**
   * Get Stripe invoice
   */
  async getStripeInvoice(stripeInvoiceId) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      const invoice = await this.stripe.invoices.retrieve(stripeInvoiceId);
      return invoice;
    } catch (error) {
      console.error('[Stripe] Error getting Stripe invoice:', error);
      throw error;
    }
  }

  // ===== WEBHOOK HANDLING =====

  /**
   * Verify and parse webhook event
   */
  verifyWebhookSignature(payload, signature) {
    if (!this.webhookSecret) {
      console.warn('[Stripe] Webhook secret not configured');
      return JSON.parse(payload);
    }

    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );
    } catch (error) {
      console.error('[Stripe] Webhook signature verification failed:', error);
      throw new Error('Invalid webhook signature');
    }
  }

  /**
   * Handle webhook events
   */
  async handleWebhookEvent(event) {
    console.log(`[Stripe] Handling webhook event: ${event.type}`);

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(event.data.object);
          break;

        case 'invoice.paid':
          await this.handleInvoicePaid(event.data.object);
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object);
          break;

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;

        case 'setup_intent.succeeded':
          await this.handleSetupIntentSucceeded(event.data.object);
          break;

        default:
          console.log(`[Stripe] Unhandled event type: ${event.type}`);
      }

      return { received: true };

    } catch (error) {
      console.error(`[Stripe] Error handling webhook event ${event.type}:`, error);
      throw error;
    }
  }

  // Webhook event handlers
  async handlePaymentSuccess(paymentIntent) {
    const tenantId = paymentIntent.metadata?.tenant_id;
    const invoiceId = paymentIntent.metadata?.invoice_id;

    if (invoiceId) {
      await billingService.updateInvoiceStatus(invoiceId, 'paid', {
        stripe_payment_intent_id: paymentIntent.id
      });
    }

    // Log the successful payment
    await this.logPaymentEvent(tenantId, 'payment_success', {
      payment_intent_id: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency
    });
  }

  async handlePaymentFailure(paymentIntent) {
    const tenantId = paymentIntent.metadata?.tenant_id;
    const invoiceId = paymentIntent.metadata?.invoice_id;

    if (invoiceId) {
      await billingService.updateInvoiceStatus(invoiceId, 'failed');
    }

    // Create or update dunning record
    if (tenantId) {
      try {
        await dunningService.createDunningRecord(tenantId, {
          invoice_id: invoiceId,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
          failure_reason: paymentIntent.last_payment_error?.message
        });
      } catch (dunningError) {
        console.error('[Stripe] Error creating dunning record:', dunningError);
      }
    }

    await this.logPaymentEvent(tenantId, 'payment_failed', {
      payment_intent_id: paymentIntent.id,
      error: paymentIntent.last_payment_error?.message
    });
  }

  async handleInvoicePaid(stripeInvoice) {
    const invoiceId = stripeInvoice.metadata?.invoice_id;
    const tenantId = stripeInvoice.metadata?.tenant_id;

    if (invoiceId) {
      await billingService.updateInvoiceStatus(invoiceId, 'paid', {
        stripe_invoice_id: stripeInvoice.id
      });
    }

    await this.logPaymentEvent(tenantId, 'invoice_paid', {
      stripe_invoice_id: stripeInvoice.id,
      amount: stripeInvoice.amount_paid / 100
    });
  }

  async handleInvoicePaymentFailed(stripeInvoice) {
    const invoiceId = stripeInvoice.metadata?.invoice_id;
    const tenantId = stripeInvoice.metadata?.tenant_id;

    if (invoiceId) {
      await billingService.updateInvoiceStatus(invoiceId, 'failed');
    }

    // Create or update dunning record for invoice failure
    if (tenantId) {
      try {
        await dunningService.createDunningRecord(tenantId, {
          invoice_id: invoiceId,
          stripe_invoice_id: stripeInvoice.id,
          amount: stripeInvoice.amount_due / 100,
          currency: stripeInvoice.currency,
          failure_reason: stripeInvoice.last_finalization_error?.message || 'Invoice payment failed'
        });
      } catch (dunningError) {
        console.error('[Stripe] Error creating dunning record for invoice:', dunningError);
      }
    }

    await this.logPaymentEvent(tenantId, 'invoice_payment_failed', {
      stripe_invoice_id: stripeInvoice.id
    });
  }

  async handleSubscriptionUpdated(subscription) {
    const tenantId = subscription.metadata?.tenant_id;

    if (tenantId) {
      await query(`
        UPDATE tenant_subscriptions
        SET status = $1,
            current_period_start = $2,
            current_period_end = $3,
            cancel_at_period_end = $4,
            updated_at = NOW()
        WHERE tenant_id = $5
      `, [
        subscription.status,
        new Date(subscription.current_period_start * 1000),
        new Date(subscription.current_period_end * 1000),
        subscription.cancel_at_period_end,
        tenantId
      ]);
    }
  }

  async handleSubscriptionDeleted(subscription) {
    const tenantId = subscription.metadata?.tenant_id;

    if (tenantId) {
      await query(`
        UPDATE tenant_subscriptions
        SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
        WHERE tenant_id = $1
      `, [tenantId]);
    }
  }

  async handleSetupIntentSucceeded(setupIntent) {
    // Payment method has been set up successfully
    const tenantId = setupIntent.metadata?.tenant_id;
    console.log(`[Stripe] Setup intent succeeded for tenant ${tenantId}`);
  }

  // ===== UTILITY METHODS =====

  /**
   * Log payment events for audit trail
   */
  async logPaymentEvent(tenantId, eventType, data) {
    try {
      await query(`
        INSERT INTO payment_events (tenant_id, event_type, event_data, created_at)
        VALUES ($1, $2, $3, NOW())
      `, [tenantId, eventType, JSON.stringify(data)]);
    } catch (error) {
      console.error('[Stripe] Error logging payment event:', error);
    }
  }

  /**
   * Get billing portal session for customer self-service
   */
  async createBillingPortalSession(tenantId, returnUrl) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      const customer = await this.getOrCreateCustomer(tenantId);

      const session = await this.stripe.billingPortal.sessions.create({
        customer: customer.id,
        return_url: returnUrl
      });

      return { url: session.url };

    } catch (error) {
      console.error('[Stripe] Error creating billing portal session:', error);
      throw error;
    }
  }

  /**
   * List all prices (for showing available plans)
   */
  async listPrices(productId = null) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      const params = {
        active: true,
        type: 'recurring',
        expand: ['data.product']
      };

      if (productId) {
        params.product = productId;
      }

      const prices = await this.stripe.prices.list(params);
      return prices.data;

    } catch (error) {
      console.error('[Stripe] Error listing prices:', error);
      throw error;
    }
  }

  /**
   * Get payment history for a tenant
   */
  async getPaymentHistory(tenantId, limit = 10) {
    if (!this.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    try {
      const customer = await this.getOrCreateCustomer(tenantId);

      const paymentIntents = await this.stripe.paymentIntents.list({
        customer: customer.id,
        limit: limit
      });

      return paymentIntents.data.map(pi => ({
        id: pi.id,
        amount: pi.amount / 100,
        currency: pi.currency,
        status: pi.status,
        description: pi.description,
        created: new Date(pi.created * 1000),
        payment_method: pi.payment_method_types[0]
      }));

    } catch (error) {
      console.error('[Stripe] Error getting payment history:', error);
      throw error;
    }
  }
}

// Singleton instance
const stripeService = new StripeService();

export default stripeService;

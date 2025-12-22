/**
 * Stripe Payment API Routes
 * Full payment processing integration with Stripe
 *
 * Based on: IRIS_Billing_Payments.md
 */

import { Hono } from 'hono';
import stripeService from '../services/stripe.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';

const stripe = new Hono();

// Helper to get tenantId from user context
function getTenantId(c) {
  const user = c.get('user');
  if (user?.tenantId) return user.tenantId;
  return null;
}

// Helper to check if user is authenticated (either tenant user or admin)
function isAuthenticated(c) {
  const user = c.get('user');
  return !!(user && (user.tenantId || user.adminId || user.role === 'superadmin'));
}

// Helper to get user for auth check (works with both tenant and admin tokens)
function getAuthenticatedUser(c) {
  const user = c.get('user');
  if (!user) return null;
  // For tenant users
  if (user.tenantId) return { tenantId: user.tenantId, isAdmin: false };
  // For admin users (superadmin, admin, etc.)
  if (user.adminId || user.role === 'superadmin') return { tenantId: null, isAdmin: true };
  return null;
}

// All routes except webhook require authentication
stripe.use('*', async (c, next) => {
  // Skip auth for webhook endpoint
  if (c.req.path.endsWith('/webhook')) {
    return next();
  }
  return authenticateJWT(c, next);
});

// ===== CONFIGURATION =====

/**
 * Check if Stripe is configured
 * GET /v1/stripe/status
 */
stripe.get('/status', async (c) => {
  try {
    return c.json({
      configured: stripeService.isConfigured(),
      features: {
        payments: true,
        subscriptions: true,
        invoices: true,
        billing_portal: true
      }
    });
  } catch (error) {
    console.error('[Stripe Routes] Error checking status:', error);
    return c.json({ error: 'Failed to check Stripe status' }, 500);
  }
});

// ===== PAYMENT METHODS =====

/**
 * Create a SetupIntent for adding a payment method
 * POST /v1/stripe/setup-intent
 *
 * Returns client_secret for Stripe.js
 */
stripe.post('/setup-intent', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);

    if (!user || !tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const result = await stripeService.createSetupIntent(tenantId);

    return c.json(result);
  } catch (error) {
    console.error('[Stripe Routes] Error creating setup intent:', error);
    if (error.message === 'Stripe not configured') {
      return c.json({ error: 'Payment processing not configured' }, 503);
    }
    return c.json({ error: 'Failed to create setup intent', message: error.message }, 500);
  }
});

/**
 * Attach a payment method after SetupIntent succeeds
 * POST /v1/stripe/payment-methods
 *
 * Body: { payment_method_id: string, set_as_default?: boolean }
 */
stripe.post('/payment-methods', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);
    const body = await c.req.json();

    if (!user || !tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!body.payment_method_id) {
      return c.json({ error: 'payment_method_id is required' }, 400);
    }

    const result = await stripeService.attachPaymentMethod(
      tenantId,
      body.payment_method_id,
      body.set_as_default !== false
    );

    return c.json(result, 201);
  } catch (error) {
    console.error('[Stripe Routes] Error attaching payment method:', error);
    if (error.message === 'Stripe not configured') {
      return c.json({ error: 'Payment processing not configured' }, 503);
    }
    return c.json({ error: 'Failed to attach payment method', message: error.message }, 500);
  }
});

/**
 * List payment methods
 * GET /v1/stripe/payment-methods
 *
 * Query params:
 * - type: card | us_bank_account (default: card)
 */
stripe.get('/payment-methods', async (c) => {
  try {
    const authUser = getAuthenticatedUser(c);
    const tenantId = getTenantId(c);
    const type = c.req.query('type') || 'card';

    if (!authUser) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Admin users can view but tenant-scoped operations need tenantId
    if (!tenantId && !authUser.isAdmin) {
      return c.json({ error: 'Tenant context required' }, 400);
    }

    // For admin without tenant context, return empty list
    if (!tenantId) {
      return c.json({ payment_methods: [], message: 'No tenant context - showing empty list' });
    }

    const paymentMethods = await stripeService.listPaymentMethods(tenantId, type);

    return c.json({
      payment_methods: paymentMethods.map(pm => ({
        id: pm.id,
        type: pm.type,
        brand: pm.card?.brand,
        last4: pm.card?.last4,
        exp_month: pm.card?.exp_month,
        exp_year: pm.card?.exp_year,
        created: new Date(pm.created * 1000)
      }))
    });
  } catch (error) {
    console.error('[Stripe Routes] Error listing payment methods:', error);
    if (error.message === 'Stripe not configured') {
      return c.json({ error: 'Payment processing not configured' }, 503);
    }
    return c.json({ error: 'Failed to list payment methods', message: error.message }, 500);
  }
});

/**
 * Remove a payment method
 * DELETE /v1/stripe/payment-methods/:paymentMethodId
 */
stripe.delete('/payment-methods/:paymentMethodId', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);
    const paymentMethodId = c.req.param('paymentMethodId');

    if (!user || !tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    await stripeService.detachPaymentMethod(tenantId, paymentMethodId);

    return c.json({ success: true });
  } catch (error) {
    console.error('[Stripe Routes] Error removing payment method:', error);
    if (error.message === 'Stripe not configured') {
      return c.json({ error: 'Payment processing not configured' }, 503);
    }
    return c.json({ error: 'Failed to remove payment method', message: error.message }, 500);
  }
});

// ===== SUBSCRIPTIONS =====

/**
 * Get available subscription plans/prices
 * GET /v1/stripe/plans
 */
stripe.get('/plans', async (c) => {
  try {
    const prices = await stripeService.listPrices();

    return c.json({
      plans: prices.map(price => ({
        id: price.id,
        product_id: price.product?.id,
        product_name: price.product?.name,
        amount: price.unit_amount / 100,
        currency: price.currency,
        interval: price.recurring?.interval,
        interval_count: price.recurring?.interval_count,
        features: price.product?.metadata?.features?.split(',') || []
      }))
    });
  } catch (error) {
    console.error('[Stripe Routes] Error listing plans:', error);
    if (error.message === 'Stripe not configured') {
      return c.json({ error: 'Payment processing not configured' }, 503);
    }
    return c.json({ error: 'Failed to list plans', message: error.message }, 500);
  }
});

/**
 * Get current subscription
 * GET /v1/stripe/subscription
 */
stripe.get('/subscription', async (c) => {
  try {
    const authUser = getAuthenticatedUser(c);
    const tenantId = getTenantId(c);

    if (!authUser) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // For admin without tenant context, return null subscription
    if (!tenantId) {
      return c.json({ subscription: null, message: 'No tenant context' });
    }

    const subscription = await stripeService.getSubscription(tenantId);

    if (!subscription) {
      return c.json({ subscription: null });
    }

    return c.json({ subscription });
  } catch (error) {
    console.error('[Stripe Routes] Error getting subscription:', error);
    if (error.message === 'Stripe not configured') {
      return c.json({ error: 'Payment processing not configured' }, 503);
    }
    return c.json({ error: 'Failed to get subscription', message: error.message }, 500);
  }
});

/**
 * Create a subscription
 * POST /v1/stripe/subscription
 *
 * Body: { price_id: string, trial_days?: number, plan_type?: string }
 */
stripe.post('/subscription', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);
    const body = await c.req.json();

    if (!user || !tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!body.price_id) {
      return c.json({ error: 'price_id is required' }, 400);
    }

    const subscription = await stripeService.createSubscription(tenantId, body.price_id, {
      trial_days: body.trial_days,
      plan_type: body.plan_type
    });

    return c.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000),
        current_period_end: new Date(subscription.current_period_end * 1000),
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
      }
    }, 201);
  } catch (error) {
    console.error('[Stripe Routes] Error creating subscription:', error);
    if (error.message === 'Stripe not configured') {
      return c.json({ error: 'Payment processing not configured' }, 503);
    }
    if (error.message.includes('No default payment method')) {
      return c.json({ error: 'Please add a payment method before subscribing' }, 400);
    }
    return c.json({ error: 'Failed to create subscription', message: error.message }, 500);
  }
});

/**
 * Cancel subscription
 * DELETE /v1/stripe/subscription
 *
 * Query params:
 * - immediately: true | false (default: false, cancels at period end)
 */
stripe.delete('/subscription', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);
    const immediately = c.req.query('immediately') === 'true';

    if (!user || !tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const subscription = await stripeService.cancelSubscription(tenantId, immediately);

    return c.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null
      }
    });
  } catch (error) {
    console.error('[Stripe Routes] Error canceling subscription:', error);
    if (error.message === 'Stripe not configured') {
      return c.json({ error: 'Payment processing not configured' }, 503);
    }
    if (error.message === 'No active subscription found') {
      return c.json({ error: 'No active subscription to cancel' }, 404);
    }
    return c.json({ error: 'Failed to cancel subscription', message: error.message }, 500);
  }
});

// ===== PAYMENTS =====

/**
 * Create a PaymentIntent for one-time payment
 * POST /v1/stripe/payment-intent
 *
 * Body: { amount: number, description?: string, invoice_id?: number }
 */
stripe.post('/payment-intent', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);
    const body = await c.req.json();

    if (!user || !tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!body.amount || body.amount <= 0) {
      return c.json({ error: 'Valid amount is required' }, 400);
    }

    const result = await stripeService.createPaymentIntent(tenantId, body.amount, 'usd', {
      description: body.description,
      invoice_id: body.invoice_id
    });

    return c.json(result);
  } catch (error) {
    console.error('[Stripe Routes] Error creating payment intent:', error);
    if (error.message === 'Stripe not configured') {
      return c.json({ error: 'Payment processing not configured' }, 503);
    }
    return c.json({ error: 'Failed to create payment intent', message: error.message }, 500);
  }
});

/**
 * Charge customer using default payment method
 * POST /v1/stripe/charge
 *
 * Body: { amount: number, description?: string, invoice_id?: number }
 */
stripe.post('/charge', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);
    const body = await c.req.json();

    if (!user || !tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!body.amount || body.amount <= 0) {
      return c.json({ error: 'Valid amount is required' }, 400);
    }

    const paymentIntent = await stripeService.chargeCustomer(tenantId, body.amount, 'usd', {
      description: body.description,
      invoice_id: body.invoice_id
    });

    return c.json({
      payment: {
        id: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        status: paymentIntent.status
      }
    });
  } catch (error) {
    console.error('[Stripe Routes] Error charging customer:', error);
    if (error.message === 'Stripe not configured') {
      return c.json({ error: 'Payment processing not configured' }, 503);
    }
    if (error.message === 'No default payment method') {
      return c.json({ error: 'No default payment method. Please add a card first.' }, 400);
    }
    if (error.message.includes('requires authentication')) {
      return c.json({ error: 'Payment requires 3D Secure verification', requires_action: true }, 402);
    }
    if (error.message.includes('declined')) {
      return c.json({ error: 'Payment was declined. Please try another card.' }, 402);
    }
    return c.json({ error: 'Payment failed', message: error.message }, 500);
  }
});

/**
 * Get payment history
 * GET /v1/stripe/payments
 *
 * Query params:
 * - limit: number (default: 10)
 */
stripe.get('/payments', async (c) => {
  try {
    const authUser = getAuthenticatedUser(c);
    const tenantId = getTenantId(c);
    const limit = parseInt(c.req.query('limit') || '10');

    if (!authUser) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // For admin without tenant context, return empty payments
    if (!tenantId) {
      return c.json({ payments: [], message: 'No tenant context' });
    }

    const payments = await stripeService.getPaymentHistory(tenantId, limit);

    return c.json({ payments });
  } catch (error) {
    console.error('[Stripe Routes] Error getting payments:', error);
    if (error.message === 'Stripe not configured') {
      return c.json({ error: 'Payment processing not configured' }, 503);
    }
    return c.json({ error: 'Failed to get payments', message: error.message }, 500);
  }
});

// ===== INVOICES =====

/**
 * Create Stripe invoice from our invoice
 * POST /v1/stripe/invoices/:invoiceId/sync
 */
stripe.post('/invoices/:invoiceId/sync', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);
    const invoiceId = c.req.param('invoiceId');

    if (!user || !tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const stripeInvoice = await stripeService.createStripeInvoice(invoiceId, tenantId);

    return c.json({
      invoice: {
        id: stripeInvoice.id,
        number: stripeInvoice.number,
        amount_due: stripeInvoice.amount_due / 100,
        status: stripeInvoice.status,
        hosted_invoice_url: stripeInvoice.hosted_invoice_url,
        invoice_pdf: stripeInvoice.invoice_pdf
      }
    });
  } catch (error) {
    console.error('[Stripe Routes] Error syncing invoice:', error);
    if (error.message === 'Stripe not configured') {
      return c.json({ error: 'Payment processing not configured' }, 503);
    }
    if (error.message === 'Invoice not found') {
      return c.json({ error: 'Invoice not found' }, 404);
    }
    return c.json({ error: 'Failed to sync invoice', message: error.message }, 500);
  }
});

/**
 * Pay a Stripe invoice
 * POST /v1/stripe/invoices/:stripeInvoiceId/pay
 */
stripe.post('/invoices/:stripeInvoiceId/pay', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);
    const stripeInvoiceId = c.req.param('stripeInvoiceId');

    if (!user || !tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const paidInvoice = await stripeService.payInvoice(stripeInvoiceId);

    return c.json({
      invoice: {
        id: paidInvoice.id,
        status: paidInvoice.status,
        amount_paid: paidInvoice.amount_paid / 100
      }
    });
  } catch (error) {
    console.error('[Stripe Routes] Error paying invoice:', error);
    if (error.message === 'Stripe not configured') {
      return c.json({ error: 'Payment processing not configured' }, 503);
    }
    return c.json({ error: 'Failed to pay invoice', message: error.message }, 500);
  }
});

// ===== BILLING PORTAL =====

/**
 * Create billing portal session
 * POST /v1/stripe/billing-portal
 *
 * Body: { return_url: string }
 */
stripe.post('/billing-portal', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);
    const body = await c.req.json();

    if (!user || !tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!body.return_url) {
      return c.json({ error: 'return_url is required' }, 400);
    }

    const result = await stripeService.createBillingPortalSession(tenantId, body.return_url);

    return c.json(result);
  } catch (error) {
    console.error('[Stripe Routes] Error creating billing portal:', error);
    if (error.message === 'Stripe not configured') {
      return c.json({ error: 'Payment processing not configured' }, 503);
    }
    return c.json({ error: 'Failed to create billing portal session', message: error.message }, 500);
  }
});

// ===== WEBHOOK =====

/**
 * Stripe webhook endpoint
 * POST /v1/stripe/webhook
 *
 * This endpoint receives events from Stripe
 */
stripe.post('/webhook', async (c) => {
  try {
    const signature = c.req.header('stripe-signature');
    const rawBody = await c.req.text();

    let event;
    try {
      event = stripeService.verifyWebhookSignature(rawBody, signature);
    } catch (error) {
      console.error('[Stripe Routes] Webhook signature verification failed:', error);
      return c.json({ error: 'Invalid signature' }, 400);
    }

    await stripeService.handleWebhookEvent(event);

    return c.json({ received: true });
  } catch (error) {
    console.error('[Stripe Routes] Webhook error:', error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

// ===== CUSTOMER MANAGEMENT =====

/**
 * Update customer billing details
 * PUT /v1/stripe/customer
 *
 * Body: { email?: string, name?: string, phone?: string, address?: object }
 */
stripe.put('/customer', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);
    const body = await c.req.json();

    if (!user || !tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const customer = await stripeService.updateCustomer(tenantId, body);

    return c.json({
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone
      }
    });
  } catch (error) {
    console.error('[Stripe Routes] Error updating customer:', error);
    if (error.message === 'Stripe not configured') {
      return c.json({ error: 'Payment processing not configured' }, 503);
    }
    return c.json({ error: 'Failed to update customer', message: error.message }, 500);
  }
});

export default stripe;

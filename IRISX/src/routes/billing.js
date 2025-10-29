import { Hono } from 'hono';
import billingService from '../services/billing.js';

const billing = new Hono();

// ==== RATE TABLES ====

// Create rate
billing.post('/rates', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const rateData = await c.req.json();

    // Validate required fields
    if (!rateData.prefix || !rateData.destination_name || !rateData.cost_per_minute) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const rate = await billingService.createRate(rateData);
    return c.json({ rate }, 201);
  } catch (error) {
    console.error('Error creating rate:', error);
    return c.json({ error: 'Failed to create rate', message: error.message }, 500);
  }
});

// List rates
billing.get('/rates', async (c) => {
  try {
    const { prefix, carrier_name, is_active, limit } = c.req.query();

    const rates = await billingService.listRates({
      prefix,
      carrier_name,
      is_active: is_active !== undefined ? is_active === 'true' : undefined,
      limit: limit ? parseInt(limit) : 100
    });

    return c.json({ rates, count: rates.length });
  } catch (error) {
    console.error('Error listing rates:', error);
    return c.json({ error: 'Failed to list rates' }, 500);
  }
});

// Get rate by ID
billing.get('/rates/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const rate = await billingService.getRate(id);

    if (!rate) {
      return c.json({ error: 'Rate not found' }, 404);
    }

    return c.json({ rate });
  } catch (error) {
    console.error('Error getting rate:', error);
    return c.json({ error: 'Failed to get rate' }, 500);
  }
});

// Update rate
billing.put('/rates/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const updates = await c.req.json();

    const rate = await billingService.updateRate(id, updates);

    if (!rate) {
      return c.json({ error: 'Rate not found' }, 404);
    }

    return c.json({ rate });
  } catch (error) {
    console.error('Error updating rate:', error);
    return c.json({ error: 'Failed to update rate', message: error.message }, 500);
  }
});

// Delete rate (soft delete)
billing.delete('/rates/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const rate = await billingService.deleteRate(id);

    if (!rate) {
      return c.json({ error: 'Rate not found' }, 404);
    }

    return c.json({ message: 'Rate deleted successfully', rate });
  } catch (error) {
    console.error('Error deleting rate:', error);
    return c.json({ error: 'Failed to delete rate' }, 500);
  }
});

// Find rate for destination (LCR lookup)
billing.post('/rates/lookup', async (c) => {
  try {
    const { destination_number } = await c.req.json();

    if (!destination_number) {
      return c.json({ error: 'destination_number is required' }, 400);
    }

    const rate = await billingService.findRateForDestination(destination_number);

    if (!rate) {
      return c.json({ error: 'No rate found for destination' }, 404);
    }

    return c.json({ rate });
  } catch (error) {
    console.error('Error finding rate:', error);
    return c.json({ error: 'Failed to find rate' }, 500);
  }
});

// ==== USAGE TRACKING ====

// Get usage tracking for date range
billing.get('/usage', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const { start_date, end_date } = c.req.query();

    const startDate = start_date || new Date(new Date().setDate(1)).toISOString().split('T')[0];
    const endDate = end_date || new Date().toISOString().split('T')[0];

    const usage = await billingService.getUsageTracking(tenant_id, startDate, endDate);

    return c.json({ usage, count: usage.length });
  } catch (error) {
    console.error('Error getting usage:', error);
    return c.json({ error: 'Failed to get usage' }, 500);
  }
});

// Get current month usage summary
billing.get('/usage/current-month', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const usage = await billingService.getCurrentMonthUsage(tenant_id);

    return c.json({ usage });
  } catch (error) {
    console.error('Error getting current month usage:', error);
    return c.json({ error: 'Failed to get current month usage' }, 500);
  }
});

// Get today's usage
billing.get('/usage/today', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const usage = await billingService.getTodayUsage(tenant_id);

    return c.json({ usage });
  } catch (error) {
    console.error('Error getting today usage:', error);
    return c.json({ error: 'Failed to get today usage' }, 500);
  }
});

// ==== SPEND LIMITS ====

// Create or update spend limit
billing.post('/spend-limit', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const limitData = await c.req.json();

    const limit = await billingService.createSpendLimit(tenant_id, limitData);

    return c.json({ limit });
  } catch (error) {
    console.error('Error creating spend limit:', error);
    return c.json({ error: 'Failed to create spend limit' }, 500);
  }
});

// Get spend limit
billing.get('/spend-limit', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const limit = await billingService.getSpendLimit(tenant_id);

    if (!limit) {
      return c.json({ error: 'No spend limit configured' }, 404);
    }

    return c.json({ limit });
  } catch (error) {
    console.error('Error getting spend limit:', error);
    return c.json({ error: 'Failed to get spend limit' }, 500);
  }
});

// Check if spend limit is exceeded
billing.get('/spend-limit/check', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const check = await billingService.checkSpendLimit(tenant_id);

    return c.json(check);
  } catch (error) {
    console.error('Error checking spend limit:', error);
    return c.json({ error: 'Failed to check spend limit' }, 500);
  }
});

// ==== INVOICES ====

// Create invoice
billing.post('/invoices', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const invoiceData = await c.req.json();

    invoiceData.tenant_id = tenant_id;

    const invoice = await billingService.createInvoice(invoiceData);

    return c.json({ invoice }, 201);
  } catch (error) {
    console.error('Error creating invoice:', error);
    return c.json({ error: 'Failed to create invoice' }, 500);
  }
});

// Generate monthly invoice for previous month
billing.post('/invoices/generate', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const { year, month } = await c.req.json();

    if (!year || !month) {
      return c.json({ error: 'year and month are required' }, 400);
    }

    const invoice = await billingService.generateMonthlyInvoice(tenant_id, year, month);

    return c.json({ invoice }, 201);
  } catch (error) {
    console.error('Error generating invoice:', error);
    return c.json({ error: 'Failed to generate invoice', message: error.message }, 500);
  }
});

// List invoices
billing.get('/invoices', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const { status, limit } = c.req.query();

    const invoices = await billingService.listInvoices(tenant_id, {
      status,
      limit: limit ? parseInt(limit) : 50
    });

    return c.json({ invoices, count: invoices.length });
  } catch (error) {
    console.error('Error listing invoices:', error);
    return c.json({ error: 'Failed to list invoices' }, 500);
  }
});

// Get invoice by ID
billing.get('/invoices/:id', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const { id } = c.req.param();

    const invoice = await billingService.getInvoice(id, tenant_id);

    if (!invoice) {
      return c.json({ error: 'Invoice not found' }, 404);
    }

    // Get line items
    const lineItems = await billingService.getInvoiceLineItems(id);

    return c.json({ invoice, line_items: lineItems });
  } catch (error) {
    console.error('Error getting invoice:', error);
    return c.json({ error: 'Failed to get invoice' }, 500);
  }
});

// Update invoice status
billing.patch('/invoices/:id/status', async (c) => {
  try {
    const { id } = c.req.param();
    const { status, ...updates } = await c.req.json();

    if (!status) {
      return c.json({ error: 'status is required' }, 400);
    }

    const invoice = await billingService.updateInvoiceStatus(id, status, updates);

    if (!invoice) {
      return c.json({ error: 'Invoice not found' }, 404);
    }

    return c.json({ invoice });
  } catch (error) {
    console.error('Error updating invoice status:', error);
    return c.json({ error: 'Failed to update invoice status' }, 500);
  }
});

// ==== PAYMENT METHODS ====

// Create payment method
billing.post('/payment-methods', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const methodData = await c.req.json();

    if (!methodData.provider || !methodData.provider_payment_method_id) {
      return c.json({ error: 'provider and provider_payment_method_id are required' }, 400);
    }

    const method = await billingService.createPaymentMethod(tenant_id, methodData);

    return c.json({ payment_method: method }, 201);
  } catch (error) {
    console.error('Error creating payment method:', error);
    return c.json({ error: 'Failed to create payment method' }, 500);
  }
});

// List payment methods
billing.get('/payment-methods', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const methods = await billingService.listPaymentMethods(tenant_id);

    return c.json({ payment_methods: methods, count: methods.length });
  } catch (error) {
    console.error('Error listing payment methods:', error);
    return c.json({ error: 'Failed to list payment methods' }, 500);
  }
});

// Get payment method
billing.get('/payment-methods/:id', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const { id } = c.req.param();

    const method = await billingService.getPaymentMethod(id, tenant_id);

    if (!method) {
      return c.json({ error: 'Payment method not found' }, 404);
    }

    return c.json({ payment_method: method });
  } catch (error) {
    console.error('Error getting payment method:', error);
    return c.json({ error: 'Failed to get payment method' }, 500);
  }
});

// Set default payment method
billing.patch('/payment-methods/:id/set-default', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const { id } = c.req.param();

    const method = await billingService.setDefaultPaymentMethod(id, tenant_id);

    if (!method) {
      return c.json({ error: 'Payment method not found' }, 404);
    }

    return c.json({ payment_method: method });
  } catch (error) {
    console.error('Error setting default payment method:', error);
    return c.json({ error: 'Failed to set default payment method' }, 500);
  }
});

// Delete payment method
billing.delete('/payment-methods/:id', async (c) => {
  try {
    const { tenant_id } = c.get('user');
    const { id } = c.req.param();

    const method = await billingService.deletePaymentMethod(id, tenant_id);

    if (!method) {
      return c.json({ error: 'Payment method not found' }, 404);
    }

    return c.json({ message: 'Payment method deleted successfully', payment_method: method });
  } catch (error) {
    console.error('Error deleting payment method:', error);
    return c.json({ error: 'Failed to delete payment method' }, 500);
  }
});

export default billing;

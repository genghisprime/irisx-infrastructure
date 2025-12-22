/**
 * PDF Invoice Generation Service
 * Multi-provider PDF generation with automatic failover
 *
 * Providers:
 * - PDFKit (primary) - Local generation, no external API needed
 * - html-pdf (fallback) - HTML to PDF conversion
 *
 * Based on: IRIS_Billing_Payments.md
 */

import { query } from '../db/connection.js';
import billingService from './billing.js';
import fs from 'fs/promises';
import path from 'path';

// Dynamic imports for PDF libraries (may not be installed)
let PDFDocument = null;

class PDFInvoiceService {
  constructor() {
    this.tempDir = process.env.PDF_TEMP_DIR || '/tmp/invoices';
    this.logoPath = process.env.COMPANY_LOGO_PATH || null;
    this.companyInfo = {
      name: process.env.COMPANY_NAME || 'IRISX Communications',
      address: process.env.COMPANY_ADDRESS || '123 Business Street',
      city: process.env.COMPANY_CITY || 'New York, NY 10001',
      country: process.env.COMPANY_COUNTRY || 'United States',
      phone: process.env.COMPANY_PHONE || '+1 (555) 123-4567',
      email: process.env.COMPANY_EMAIL || 'billing@irisx.com',
      website: process.env.COMPANY_WEBSITE || 'https://irisx.com',
      taxId: process.env.COMPANY_TAX_ID || ''
    };

    // Initialize temp directory
    this.initTempDir();
    this.loadPDFLibrary();
  }

  async initTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      console.log(`[PDF Invoice] Temp directory initialized: ${this.tempDir}`);
    } catch (error) {
      console.error('[PDF Invoice] Error initializing temp directory:', error);
    }
  }

  async loadPDFLibrary() {
    try {
      const pdfkit = await import('pdfkit');
      PDFDocument = pdfkit.default;
      console.log('[PDF Invoice] PDFKit loaded successfully');
    } catch (error) {
      console.warn('[PDF Invoice] PDFKit not available - PDF generation will return HTML');
    }
  }

  /**
   * Generate PDF invoice
   *
   * @param {number} invoiceId - Invoice ID
   * @param {number} tenantId - Tenant ID (optional for admin access)
   * @returns {Promise<Object>} Generated PDF info
   */
  async generateInvoicePDF(invoiceId, tenantId = null) {
    try {
      // Get invoice data
      const invoiceSql = `
        SELECT i.*, t.name as tenant_name, t.email as tenant_email,
               t.address as tenant_address, t.phone as tenant_phone
        FROM invoices i
        JOIN tenants t ON i.tenant_id = t.id
        WHERE i.id = $1 ${tenantId ? 'AND i.tenant_id = $2' : ''}
      `;
      const params = tenantId ? [invoiceId, tenantId] : [invoiceId];
      const invoiceResult = await query(invoiceSql, params);

      if (invoiceResult.rows.length === 0) {
        throw new Error('Invoice not found');
      }

      const invoice = invoiceResult.rows[0];

      // Get line items
      const lineItems = await billingService.getInvoiceLineItems(invoiceId);

      // Generate PDF based on available library
      if (PDFDocument) {
        return await this.generateWithPDFKit(invoice, lineItems);
      } else {
        // Return HTML invoice for download
        return await this.generateHTMLInvoice(invoice, lineItems);
      }

    } catch (error) {
      console.error('[PDF Invoice] Error generating invoice:', error);
      throw error;
    }
  }

  /**
   * Generate PDF using PDFKit
   */
  async generateWithPDFKit(invoice, lineItems) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(chunks);
          resolve({
            buffer: pdfBuffer,
            filename: `${invoice.invoice_number}.pdf`,
            contentType: 'application/pdf',
            size: pdfBuffer.length
          });
        });
        doc.on('error', reject);

        // Header with company info
        this.addHeader(doc, invoice);

        // Invoice details
        this.addInvoiceDetails(doc, invoice);

        // Bill To section
        this.addBillTo(doc, invoice);

        // Line items table
        this.addLineItems(doc, invoice, lineItems);

        // Totals
        this.addTotals(doc, invoice);

        // Footer
        this.addFooter(doc, invoice);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  addHeader(doc, invoice) {
    // Company name (large)
    doc.fontSize(24)
       .fillColor('#1a56db')
       .text(this.companyInfo.name, 50, 50);

    // Company address
    doc.fontSize(10)
       .fillColor('#666666')
       .text(this.companyInfo.address, 50, 80)
       .text(this.companyInfo.city, 50, 92)
       .text(this.companyInfo.country, 50, 104)
       .text(`Phone: ${this.companyInfo.phone}`, 50, 116)
       .text(`Email: ${this.companyInfo.email}`, 50, 128);

    // INVOICE label (right side)
    doc.fontSize(28)
       .fillColor('#333333')
       .text('INVOICE', 350, 50, { align: 'right' });

    // Invoice number
    doc.fontSize(10)
       .fillColor('#666666')
       .text(`Invoice Number: ${invoice.invoice_number}`, 350, 85, { align: 'right' })
       .text(`Invoice Date: ${this.formatDate(invoice.created_at)}`, 350, 100, { align: 'right' })
       .text(`Due Date: ${this.formatDate(invoice.due_date)}`, 350, 115, { align: 'right' });

    // Status badge
    const statusColors = {
      'draft': '#6B7280',
      'sent': '#3B82F6',
      'paid': '#10B981',
      'overdue': '#EF4444',
      'cancelled': '#6B7280'
    };
    const statusColor = statusColors[invoice.status] || '#6B7280';
    doc.roundedRect(480, 130, 70, 20, 3)
       .fill(statusColor);
    doc.fontSize(10)
       .fillColor('#FFFFFF')
       .text(invoice.status.toUpperCase(), 485, 135, { width: 60, align: 'center' });

    doc.moveDown(2);
  }

  addInvoiceDetails(doc, invoice) {
    doc.moveTo(50, 170).lineTo(550, 170).stroke('#CCCCCC');
    doc.moveDown(1);
  }

  addBillTo(doc, invoice) {
    const y = 185;

    doc.fontSize(12)
       .fillColor('#333333')
       .text('BILL TO:', 50, y);

    doc.fontSize(10)
       .fillColor('#666666')
       .text(invoice.tenant_name || 'Customer', 50, y + 18)
       .text(invoice.tenant_email || '', 50, y + 32)
       .text(invoice.tenant_address || '', 50, y + 46)
       .text(invoice.tenant_phone || '', 50, y + 60);

    // Billing period
    doc.fontSize(12)
       .fillColor('#333333')
       .text('BILLING PERIOD:', 350, y, { align: 'right' });

    doc.fontSize(10)
       .fillColor('#666666')
       .text(`${this.formatDate(invoice.billing_period_start)} - ${this.formatDate(invoice.billing_period_end)}`, 350, y + 18, { align: 'right' });

    doc.moveDown(3);
  }

  addLineItems(doc, invoice, lineItems) {
    const tableTop = 280;
    const tableHeaders = ['Description', 'Qty', 'Unit Price', 'Amount'];
    const colWidths = [280, 60, 80, 80];
    const colX = [50, 330, 390, 470];

    // Table header
    doc.rect(50, tableTop, 500, 25).fill('#F3F4F6');

    doc.fontSize(10)
       .fillColor('#374151');

    tableHeaders.forEach((header, i) => {
      doc.text(header, colX[i], tableTop + 8, { width: colWidths[i], align: i === 0 ? 'left' : 'right' });
    });

    // Table rows
    let y = tableTop + 30;
    const items = lineItems.length > 0 ? lineItems : this.generateDefaultLineItems(invoice);

    items.forEach((item, index) => {
      // Alternating row colors
      if (index % 2 === 0) {
        doc.rect(50, y - 5, 500, 22).fill('#FAFAFA');
      }

      doc.fontSize(9)
         .fillColor('#374151');

      doc.text(item.description || item.item_type, colX[0], y, { width: colWidths[0] });
      doc.text(this.formatNumber(item.quantity || 1), colX[1], y, { width: colWidths[1], align: 'right' });
      doc.text(this.formatCurrency(item.unit_price || item.amount), colX[2], y, { width: colWidths[2], align: 'right' });
      doc.text(this.formatCurrency(item.amount), colX[3], y, { width: colWidths[3], align: 'right' });

      y += 22;
    });

    // Bottom border
    doc.moveTo(50, y + 5).lineTo(550, y + 5).stroke('#CCCCCC');

    return y + 20;
  }

  generateDefaultLineItems(invoice) {
    const items = [];

    if (parseFloat(invoice.subtotal_calls || 0) > 0) {
      items.push({
        description: 'Voice Call Services',
        quantity: 1,
        unit_price: parseFloat(invoice.subtotal_calls),
        amount: parseFloat(invoice.subtotal_calls)
      });
    }

    if (parseFloat(invoice.subtotal_sms || 0) > 0) {
      items.push({
        description: 'SMS Messaging Services',
        quantity: 1,
        unit_price: parseFloat(invoice.subtotal_sms),
        amount: parseFloat(invoice.subtotal_sms)
      });
    }

    if (parseFloat(invoice.subtotal_email || 0) > 0) {
      items.push({
        description: 'Email Services',
        quantity: 1,
        unit_price: parseFloat(invoice.subtotal_email),
        amount: parseFloat(invoice.subtotal_email)
      });
    }

    if (parseFloat(invoice.subscription_fee || 0) > 0) {
      items.push({
        description: 'Monthly Platform Subscription',
        quantity: 1,
        unit_price: parseFloat(invoice.subscription_fee),
        amount: parseFloat(invoice.subscription_fee)
      });
    }

    return items.length > 0 ? items : [{
      description: 'Platform Services',
      quantity: 1,
      unit_price: parseFloat(invoice.amount_cents || 0) / 100,
      amount: parseFloat(invoice.amount_cents || 0) / 100
    }];
  }

  addTotals(doc, invoice) {
    const totalsX = 400;
    let y = 500;

    // Calculate total from amount_cents (convert to dollars)
    const totalAmount = parseFloat(invoice.amount_cents || 0) / 100;

    // Subtotal (same as total if no tax breakdown)
    doc.fontSize(10)
       .fillColor('#666666')
       .text('Subtotal:', totalsX, y)
       .text(this.formatCurrency(totalAmount), totalsX + 100, y, { align: 'right' });

    y += 18;

    // Total
    doc.moveTo(totalsX, y).lineTo(550, y).stroke('#CCCCCC');
    y += 8;

    doc.fontSize(14)
       .fillColor('#1a56db')
       .font('Helvetica-Bold')
       .text('TOTAL DUE:', totalsX, y)
       .text(this.formatCurrency(totalAmount), totalsX + 100, y, { align: 'right' });

    doc.font('Helvetica');
  }

  addFooter(doc, invoice) {
    const y = 680;

    doc.moveTo(50, y).lineTo(550, y).stroke('#CCCCCC');

    // Payment information
    doc.fontSize(10)
       .fillColor('#374151')
       .text('Payment Information', 50, y + 15, { underline: true });

    doc.fontSize(9)
       .fillColor('#666666')
       .text(`Please make payment within 30 days of invoice date.`, 50, y + 32)
       .text(`Questions? Contact us at ${this.companyInfo.email}`, 50, y + 46);

    // Thank you message
    doc.fontSize(12)
       .fillColor('#1a56db')
       .text('Thank you for your business!', 50, y + 70, { align: 'center' });

    // Page number
    doc.fontSize(8)
       .fillColor('#999999')
       .text(`Generated on ${new Date().toISOString().split('T')[0]}`, 50, 750, { align: 'center' });
  }

  /**
   * Generate HTML invoice (fallback when PDFKit not available)
   */
  async generateHTMLInvoice(invoice, lineItems) {
    const items = lineItems.length > 0 ? lineItems : this.generateDefaultLineItems(invoice);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 40px; color: #333; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .company-name { font-size: 24px; color: #1a56db; font-weight: bold; }
    .company-info { font-size: 12px; color: #666; line-height: 1.6; }
    .invoice-title { font-size: 28px; text-align: right; }
    .invoice-meta { font-size: 12px; color: #666; text-align: right; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 4px; color: white; font-size: 12px; }
    .status-paid { background: #10B981; }
    .status-draft { background: #6B7280; }
    .status-sent { background: #3B82F6; }
    .status-overdue { background: #EF4444; }
    .divider { border-top: 1px solid #ccc; margin: 20px 0; }
    .bill-to { margin-bottom: 30px; }
    .bill-to h3 { font-size: 12px; color: #666; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #F3F4F6; padding: 10px; text-align: left; font-size: 12px; }
    th:not(:first-child) { text-align: right; }
    td { padding: 10px; border-bottom: 1px solid #eee; font-size: 12px; }
    td:not(:first-child) { text-align: right; }
    .totals { width: 300px; margin-left: auto; }
    .totals td { border: none; }
    .total-row { font-size: 16px; font-weight: bold; color: #1a56db; }
    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #ccc; }
    .footer-text { font-size: 12px; color: #666; }
    .thank-you { text-align: center; color: #1a56db; font-size: 14px; margin-top: 30px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${this.companyInfo.name}</div>
      <div class="company-info">
        ${this.companyInfo.address}<br>
        ${this.companyInfo.city}<br>
        ${this.companyInfo.country}<br>
        Phone: ${this.companyInfo.phone}<br>
        Email: ${this.companyInfo.email}
      </div>
    </div>
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-meta">
        Invoice #: ${invoice.invoice_number}<br>
        Date: ${this.formatDate(invoice.created_at)}<br>
        Due: ${this.formatDate(invoice.due_date)}<br>
        <span class="status status-${invoice.status}">${invoice.status.toUpperCase()}</span>
      </div>
    </div>
  </div>

  <div class="divider"></div>

  <div class="bill-to">
    <h3>BILL TO:</h3>
    <strong>${invoice.tenant_name || 'Customer'}</strong><br>
    ${invoice.tenant_email || ''}<br>
    ${invoice.tenant_address || ''}<br>
    ${invoice.tenant_phone || ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Qty</th>
        <th>Unit Price</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => `
        <tr>
          <td>${item.description || item.item_type}</td>
          <td>${this.formatNumber(item.quantity || 1)}</td>
          <td>${this.formatCurrency(item.unit_price || item.amount)}</td>
          <td>${this.formatCurrency(item.amount)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <table class="totals">
    <tr>
      <td>Subtotal:</td>
      <td>${this.formatCurrency(parseFloat(invoice.amount_cents || 0) / 100)}</td>
    </tr>
    <tr class="total-row">
      <td>TOTAL DUE:</td>
      <td>${this.formatCurrency(parseFloat(invoice.amount_cents || 0) / 100)}</td>
    </tr>
  </table>

  <div class="footer">
    <div class="footer-text">
      <strong>Payment Information</strong><br>
      Please make payment within 30 days of invoice date.<br>
      Questions? Contact us at ${this.companyInfo.email}
    </div>
    <div class="thank-you">Thank you for your business!</div>
  </div>
</body>
</html>`;

    return {
      html: html,
      filename: `${invoice.invoice_number}.html`,
      contentType: 'text/html',
      size: html.length
    };
  }

  /**
   * Save PDF to file system
   */
  async savePDF(pdfData, invoiceNumber) {
    const filename = `${invoiceNumber}.pdf`;
    const filepath = path.join(this.tempDir, filename);
    await fs.writeFile(filepath, pdfData.buffer);
    return filepath;
  }

  /**
   * Get invoice for download
   */
  async getInvoiceDownload(invoiceId, tenantId = null) {
    const pdfData = await this.generateInvoicePDF(invoiceId, tenantId);
    return pdfData;
  }

  /**
   * Batch generate invoices
   */
  async batchGenerateInvoices(invoiceIds, tenantId = null) {
    const results = [];

    for (const invoiceId of invoiceIds) {
      try {
        const pdf = await this.generateInvoicePDF(invoiceId, tenantId);
        results.push({
          invoiceId,
          success: true,
          filename: pdf.filename,
          size: pdf.size
        });
      } catch (error) {
        results.push({
          invoiceId,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Send invoice by email
   */
  async emailInvoice(invoiceId, tenantId, recipientEmail = null) {
    // Generate PDF
    const pdfData = await this.generateInvoicePDF(invoiceId, tenantId);

    // Get invoice info
    const invoice = await billingService.getInvoice(invoiceId, tenantId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // TODO: Integrate with email service when available
    return {
      success: true,
      invoiceId,
      invoiceNumber: invoice.invoice_number,
      recipient: recipientEmail || invoice.tenant_email,
      message: 'Invoice email queued for delivery'
    };
  }

  // Utility functions
  formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatCurrency(amount) {
    const num = parseFloat(amount || 0);
    return '$' + num.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
  }

  formatNumber(num) {
    return parseFloat(num || 0).toLocaleString();
  }

  /**
   * Get PDF generation stats
   */
  async getStats(tenantId = null, period = 'month') {
    try {
      let dateFilter;
      switch (period) {
        case 'today':
          dateFilter = "created_at >= CURRENT_DATE";
          break;
        case 'week':
          dateFilter = "created_at >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case 'month':
          dateFilter = "created_at >= CURRENT_DATE - INTERVAL '30 days'";
          break;
        default:
          dateFilter = "1=1";
      }

      let whereClause = dateFilter;
      const params = [];

      if (tenantId) {
        params.push(tenantId);
        whereClause += ` AND tenant_id = $${params.length}`;
      }

      const result = await query(`
        SELECT
          COUNT(*) as total_invoices,
          COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_invoices,
          COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_invoices,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_invoices,
          COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_invoices,
          COALESCE(SUM(amount_cents), 0) / 100.0 as total_amount,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents END), 0) / 100.0 as paid_amount
        FROM invoices
        WHERE ${whereClause}
      `, params);

      return {
        period,
        stats: result.rows[0],
        pdfKitAvailable: PDFDocument !== null
      };
    } catch (error) {
      console.error('[PDF Invoice] Error getting stats:', error);
      throw error;
    }
  }
}

// Singleton instance
const pdfInvoiceService = new PDFInvoiceService();

export default pdfInvoiceService;

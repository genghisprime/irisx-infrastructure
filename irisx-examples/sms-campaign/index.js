/**
 * IRISX SMS Marketing Campaign Example
 *
 * A complete SMS marketing campaign system with:
 * - Contact list management
 * - Message templates with variables
 * - Bulk SMS sending with rate limiting
 * - Campaign scheduling
 * - Delivery tracking and analytics
 * - Opt-out management
 *
 * Features:
 * - Express.js REST API
 * - Template engine with variable substitution
 * - Contact segmentation
 * - Campaign analytics dashboard
 * - Compliance features (opt-out, DNC)
 */

import express from 'express';
import dotenv from 'dotenv';
import campaignRoutes from './routes/campaign.js';
import contactRoutes from './routes/contacts.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// CORS (if needed for frontend)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'IRISX SMS Campaign Manager',
    timestamp: new Date().toISOString()
  });
});

// API documentation
app.get('/', (req, res) => {
  res.json({
    service: 'IRISX SMS Campaign Manager',
    version: '1.0.0',
    endpoints: {
      contacts: [
        'GET    /contacts',
        'POST   /contacts',
        'GET    /contacts/:id',
        'PUT    /contacts/:id',
        'DELETE /contacts/:id',
        'POST   /contacts/import',
        'GET    /contacts/export'
      ],
      campaigns: [
        'GET    /campaigns',
        'POST   /campaigns',
        'GET    /campaigns/:id',
        'PUT    /campaigns/:id',
        'DELETE /campaigns/:id',
        'POST   /campaigns/:id/send',
        'GET    /campaigns/:id/stats'
      ]
    }
  });
});

// Mount routes
app.use('/contacts', contactRoutes);
app.use('/campaigns', campaignRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('📱 IRISX SMS Campaign Manager');
  console.log('================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log('================================\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

export default app;

/**
 * IRISX IVR Menu System Example
 *
 * This example demonstrates a production-ready IVR (Interactive Voice Response)
 * system with multi-level menu navigation and DTMF input handling.
 *
 * Features:
 * - Express.js webhook server
 * - Multi-level IVR menus
 * - DTMF input handling (press 1, 2, 3, etc.)
 * - Text-to-Speech integration
 * - Call routing based on user input
 * - Error handling and invalid input management
 */

import express from 'express';
import dotenv from 'dotenv';
import ivrRoutes from './routes/ivr.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'IRISX IVR Menu System',
    timestamp: new Date().toISOString()
  });
});

// Mount IVR routes
app.use('/ivr', ivrRoutes);

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
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log('🎙️  IRISX IVR Menu System');
  console.log('================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`IVR webhook: http://localhost:${PORT}/ivr/webhook`);
  console.log('================================\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

export default app;

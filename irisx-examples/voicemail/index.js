/**
 * IRISX Voicemail System Example
 *
 * This example demonstrates a complete voicemail system with:
 * - Voicemail recording
 * - Voicemail retrieval and playback
 * - Transcription support
 * - Message management (mark as read, delete)
 * - Email notifications
 *
 * Features:
 * - Express.js webhook server
 * - AWS S3 storage integration
 * - Automatic transcription
 * - RESTful API for voicemail management
 */

import express from 'express';
import dotenv from 'dotenv';
import voicemailRoutes from './routes/voicemail.js';

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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'IRISX Voicemail System',
    timestamp: new Date().toISOString()
  });
});

// Mount voicemail routes
app.use('/voicemail', voicemailRoutes);

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
  console.log('📧 IRISX Voicemail System');
  console.log('================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Webhook: http://localhost:${PORT}/voicemail/webhook`);
  console.log(`API: http://localhost:${PORT}/voicemail/messages`);
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

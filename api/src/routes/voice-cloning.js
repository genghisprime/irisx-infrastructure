/**
 * Voice Cloning API Routes
 *
 * Endpoints for custom voice cloning and management
 */

import { Router } from 'express';
import voiceCloningService, { PROVIDERS, QUALITY_TIERS, SAMPLE_REQUIREMENTS } from '../services/voice-cloning.js';

const router = Router();

// ============================================
// Voice Management
// ============================================

/**
 * GET /v1/voices
 * Get all voices for tenant (including pre-built)
 */
router.get('/', async (req, res) => {
  try {
    const { status, provider, include_prebuilt = 'true' } = req.query;
    const tenantId = req.tenant?.id || req.body.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const voices = await voiceCloningService.getVoices(tenantId, {
      status,
      provider,
      includePrebuilt: include_prebuilt === 'true'
    });

    res.json({
      voices,
      providers: PROVIDERS,
      qualityTiers: QUALITY_TIERS
    });
  } catch (error) {
    console.error('Error getting voices:', error);
    res.status(500).json({ error: 'Failed to get voices' });
  }
});

/**
 * POST /v1/voices
 * Create a new cloned voice
 */
router.post('/', async (req, res) => {
  try {
    const {
      tenant_id,
      name,
      description,
      provider = 'elevenlabs',
      quality = 'standard',
      labels = {}
    } = req.body;

    const tenantId = req.tenant?.id || tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    // Check for uploaded samples
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'Voice samples required',
        requirements: SAMPLE_REQUIREMENTS[quality]
      });
    }

    // Process uploaded files
    const samples = req.files.map(file => ({
      filename: file.originalname,
      buffer: file.buffer,
      size: file.size
    }));

    const voice = await voiceCloningService.createVoice({
      tenantId,
      name,
      description,
      samples,
      provider,
      quality,
      labels,
      userId: req.user?.id
    });

    res.status(201).json(voice);
  } catch (error) {
    console.error('Error creating voice:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /v1/voices/requirements
 * Get sample requirements for each quality tier
 */
router.get('/requirements', (req, res) => {
  res.json({
    providers: Object.values(PROVIDERS),
    qualityTiers: Object.values(QUALITY_TIERS),
    requirements: SAMPLE_REQUIREMENTS
  });
});

/**
 * GET /v1/voices/prebuilt
 * Get pre-built voices from providers
 */
router.get('/prebuilt', async (req, res) => {
  try {
    const voices = await voiceCloningService.getPrebuiltVoices();
    res.json({ voices });
  } catch (error) {
    console.error('Error getting prebuilt voices:', error);
    res.status(500).json({ error: 'Failed to get prebuilt voices' });
  }
});

/**
 * GET /v1/voices/:id
 * Get a specific voice
 */
router.get('/:id', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const voice = await voiceCloningService.getVoice(req.params.id, tenantId);

    if (!voice) {
      return res.status(404).json({ error: 'Voice not found' });
    }

    res.json(voice);
  } catch (error) {
    console.error('Error getting voice:', error);
    res.status(500).json({ error: 'Failed to get voice' });
  }
});

/**
 * PATCH /v1/voices/:id
 * Update voice settings
 */
router.patch('/:id', async (req, res) => {
  try {
    const { name, description, labels, is_active } = req.body;
    const tenantId = req.tenant?.id || req.body.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const voice = await voiceCloningService.updateVoice(req.params.id, tenantId, {
      name,
      description,
      labels,
      isActive: is_active
    });

    res.json(voice);
  } catch (error) {
    console.error('Error updating voice:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /v1/voices/:id
 * Delete a voice
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const result = await voiceCloningService.deleteVoice(req.params.id, tenantId);
    res.json(result);
  } catch (error) {
    console.error('Error deleting voice:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// Sample Management
// ============================================

/**
 * POST /v1/voices/:id/samples
 * Add samples to existing voice
 */
router.post('/:id/samples', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.body.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Voice samples required' });
    }

    const samples = req.files.map(file => ({
      filename: file.originalname,
      buffer: file.buffer,
      size: file.size
    }));

    const result = await voiceCloningService.addSamples(req.params.id, tenantId, samples);
    res.json(result);
  } catch (error) {
    console.error('Error adding samples:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// Speech Generation
// ============================================

/**
 * POST /v1/voices/:id/generate
 * Generate speech using cloned voice
 */
router.post('/:id/generate', async (req, res) => {
  try {
    const {
      text,
      tenant_id,
      stability,
      similarity_boost,
      style,
      speaker_boost
    } = req.body;

    const tenantId = req.tenant?.id || tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    if (text.length > 5000) {
      return res.status(400).json({ error: 'Text exceeds maximum length of 5000 characters' });
    }

    const result = await voiceCloningService.generateSpeech(req.params.id, tenantId, text, {
      stability,
      similarityBoost: similarity_boost,
      style,
      speakerBoost: speaker_boost
    });

    res.json(result);
  } catch (error) {
    console.error('Error generating speech:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /v1/voices/:id/generate/stream
 * Stream speech generation using cloned voice
 */
router.post('/:id/generate/stream', async (req, res) => {
  try {
    const { text, tenant_id, stability, similarity_boost } = req.body;
    const tenantId = req.tenant?.id || tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    // Set streaming headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');

    // For now, generate full audio and send
    // In production, would use ElevenLabs streaming API
    const result = await voiceCloningService.generateSpeech(req.params.id, tenantId, text, {
      stability,
      similarityBoost: similarity_boost
    });

    // Read and stream the file
    const fs = await import('fs');
    const stream = fs.createReadStream(result.filepath);
    stream.pipe(res);
  } catch (error) {
    console.error('Error streaming speech:', error);
    if (!res.headersSent) {
      res.status(400).json({ error: error.message });
    }
  }
});

// ============================================
// Voice Analysis
// ============================================

/**
 * POST /v1/voices/analyze
 * Analyze voice characteristics from samples
 */
router.post('/analyze', async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Voice sample required' });
    }

    const samples = req.files.map(file => ({
      filename: file.originalname,
      buffer: file.buffer,
      size: file.size
    }));

    const analysis = await voiceCloningService.analyzeVoice(samples);
    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing voice:', error);
    res.status(500).json({ error: 'Failed to analyze voice' });
  }
});

/**
 * POST /v1/voices/:id/similarity
 * Check similarity between voice and sample
 */
router.post('/:id/similarity', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.body.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Voice sample required' });
    }

    const similarity = await voiceCloningService.getVoiceSimilarity(
      req.params.id,
      tenantId,
      req.files[0].buffer
    );

    res.json(similarity);
  } catch (error) {
    console.error('Error checking similarity:', error);
    res.status(500).json({ error: 'Failed to check similarity' });
  }
});

export default router;

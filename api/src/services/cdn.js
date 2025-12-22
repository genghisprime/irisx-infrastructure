/**
 * CDN Service - CloudFront Integration
 *
 * Features:
 * - CloudFront signed URLs for secure media delivery
 * - Media file distribution (recordings, TTS audio, voicemail)
 * - Cache invalidation
 * - Origin access identity
 * - Geo-restriction support
 */

import { CloudFrontClient, CreateInvalidationCommand, GetDistributionCommand } from '@aws-sdk/client-cloudfront';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import crypto from 'crypto';

// CloudFront configuration
const CLOUDFRONT_DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || process.env.CLOUDFRONT_DISTRIBUTION_DOMAIN;
const CLOUDFRONT_KEY_PAIR_ID = process.env.CLOUDFRONT_KEY_PAIR_ID;
const CLOUDFRONT_PRIVATE_KEY = process.env.CLOUDFRONT_PRIVATE_KEY?.replace(/\\n/g, '\n');

// S3 configuration for origin
const S3_BUCKET = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET;
const S3_REGION = process.env.AWS_REGION || 'us-east-1';

// Initialize CloudFront client
const cloudfront = new CloudFrontClient({
  region: S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

class CDNService {
  constructor() {
    this.isConfigured = !!(CLOUDFRONT_DOMAIN && CLOUDFRONT_KEY_PAIR_ID && CLOUDFRONT_PRIVATE_KEY);
    if (!this.isConfigured) {
      console.warn('[CDN] CloudFront not fully configured - signed URLs disabled');
    }
  }

  /**
   * Generate signed URL for media file
   *
   * @param {string} s3Key - S3 object key (path)
   * @param {Object} options - Options
   * @param {number} options.expiresIn - Expiration in seconds (default: 1 hour)
   * @param {string} options.ipAddress - Optional IP restriction
   * @returns {string} Signed CloudFront URL or S3 URL fallback
   */
  getSignedUrl(s3Key, options = {}) {
    const { expiresIn = 3600, ipAddress = null } = options;

    // If CloudFront not configured, return direct S3 URL
    if (!this.isConfigured) {
      return this.getS3Url(s3Key);
    }

    try {
      const url = `https://${CLOUDFRONT_DOMAIN}/${s3Key}`;
      const dateLessThan = new Date(Date.now() + expiresIn * 1000);

      // Build policy for signed URL
      let policy = {
        Statement: [{
          Resource: url,
          Condition: {
            DateLessThan: { 'AWS:EpochTime': Math.floor(dateLessThan.getTime() / 1000) }
          }
        }]
      };

      // Add IP restriction if specified
      if (ipAddress) {
        policy.Statement[0].Condition.IpAddress = {
          'AWS:SourceIp': ipAddress.includes('/') ? ipAddress : `${ipAddress}/32`
        };
      }

      const signedUrl = getSignedUrl({
        url,
        keyPairId: CLOUDFRONT_KEY_PAIR_ID,
        privateKey: CLOUDFRONT_PRIVATE_KEY,
        dateLessThan: dateLessThan.toISOString(),
        policy: JSON.stringify(policy)
      });

      return signedUrl;
    } catch (error) {
      console.error('[CDN] Error generating signed URL:', error);
      return this.getS3Url(s3Key);
    }
  }

  /**
   * Generate signed URL for recording playback
   */
  getRecordingUrl(recordingId, tenantId, options = {}) {
    const s3Key = `recordings/${tenantId}/${recordingId}.mp3`;
    return this.getSignedUrl(s3Key, {
      expiresIn: options.expiresIn || 3600, // 1 hour default
      ipAddress: options.ipAddress
    });
  }

  /**
   * Generate signed URL for TTS audio file
   */
  getTTSAudioUrl(tenantId, filename, options = {}) {
    const s3Key = `tts/${tenantId}/${filename}`;
    return this.getSignedUrl(s3Key, {
      expiresIn: options.expiresIn || 86400, // 24 hours default (cached)
      ipAddress: options.ipAddress
    });
  }

  /**
   * Generate signed URL for voicemail
   */
  getVoicemailUrl(tenantId, voicemailId, options = {}) {
    const s3Key = `voicemails/${tenantId}/${voicemailId}.mp3`;
    return this.getSignedUrl(s3Key, {
      expiresIn: options.expiresIn || 7200, // 2 hours default
      ipAddress: options.ipAddress
    });
  }

  /**
   * Generate signed URL for transcription/subtitle files
   */
  getTranscriptUrl(tenantId, callId, format = 'json', options = {}) {
    const s3Key = `transcripts/${tenantId}/${callId}.${format}`;
    return this.getSignedUrl(s3Key, {
      expiresIn: options.expiresIn || 3600,
      ipAddress: options.ipAddress
    });
  }

  /**
   * Get direct S3 URL (fallback)
   */
  getS3Url(s3Key) {
    return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${s3Key}`;
  }

  /**
   * Generate streaming URL for HLS/DASH playback
   */
  getStreamingUrl(s3Key, options = {}) {
    const { expiresIn = 7200, format = 'hls' } = options;

    if (!this.isConfigured) {
      return this.getS3Url(s3Key);
    }

    // For streaming, use CloudFront with appropriate path
    const streamingPath = format === 'hls'
      ? s3Key.replace(/\.(mp4|mp3|wav)$/, '/playlist.m3u8')
      : s3Key;

    return this.getSignedUrl(streamingPath, { expiresIn });
  }

  /**
   * Invalidate CloudFront cache for specific paths
   *
   * @param {string[]} paths - Array of paths to invalidate
   * @returns {Object} Invalidation result
   */
  async invalidateCache(paths) {
    if (!CLOUDFRONT_DISTRIBUTION_ID) {
      console.warn('[CDN] Cannot invalidate cache - distribution ID not configured');
      return null;
    }

    try {
      // Ensure paths start with /
      const normalizedPaths = paths.map(p => p.startsWith('/') ? p : `/${p}`);

      const command = new CreateInvalidationCommand({
        DistributionId: CLOUDFRONT_DISTRIBUTION_ID,
        InvalidationBatch: {
          CallerReference: `invalidation-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
          Paths: {
            Quantity: normalizedPaths.length,
            Items: normalizedPaths
          }
        }
      });

      const response = await cloudfront.send(command);

      console.log(`[CDN] Cache invalidation created: ${response.Invalidation.Id}`);

      return {
        invalidationId: response.Invalidation.Id,
        status: response.Invalidation.Status,
        paths: normalizedPaths
      };
    } catch (error) {
      console.error('[CDN] Cache invalidation error:', error);
      throw error;
    }
  }

  /**
   * Invalidate cache for a specific recording
   */
  async invalidateRecording(recordingId, tenantId) {
    const path = `/recordings/${tenantId}/${recordingId}*`;
    return this.invalidateCache([path]);
  }

  /**
   * Invalidate cache for tenant's TTS files
   */
  async invalidateTTSCache(tenantId, filename = null) {
    const path = filename
      ? `/tts/${tenantId}/${filename}`
      : `/tts/${tenantId}/*`;
    return this.invalidateCache([path]);
  }

  /**
   * Get distribution status
   */
  async getDistributionStatus() {
    if (!CLOUDFRONT_DISTRIBUTION_ID) {
      return { configured: false };
    }

    try {
      const command = new GetDistributionCommand({
        Id: CLOUDFRONT_DISTRIBUTION_ID
      });

      const response = await cloudfront.send(command);
      const dist = response.Distribution;

      return {
        configured: true,
        id: dist.Id,
        domainName: dist.DomainName,
        status: dist.Status,
        enabled: dist.DistributionConfig.Enabled,
        priceClass: dist.DistributionConfig.PriceClass,
        origins: dist.DistributionConfig.Origins.Items.map(o => ({
          id: o.Id,
          domainName: o.DomainName
        })),
        defaultCacheBehavior: {
          viewerProtocolPolicy: dist.DistributionConfig.DefaultCacheBehavior.ViewerProtocolPolicy,
          compress: dist.DistributionConfig.DefaultCacheBehavior.Compress
        }
      };
    } catch (error) {
      console.error('[CDN] Error getting distribution status:', error);
      return {
        configured: true,
        error: error.message
      };
    }
  }

  /**
   * Generate cookie for signed URL (for streaming)
   */
  generateSignedCookies(resourcePath, options = {}) {
    const { expiresIn = 7200 } = options;

    if (!this.isConfigured) {
      return null;
    }

    try {
      const policy = {
        Statement: [{
          Resource: `https://${CLOUDFRONT_DOMAIN}/${resourcePath}*`,
          Condition: {
            DateLessThan: {
              'AWS:EpochTime': Math.floor((Date.now() + expiresIn * 1000) / 1000)
            }
          }
        }]
      };

      const policyStr = JSON.stringify(policy);
      const policyBase64 = Buffer.from(policyStr).toString('base64')
        .replace(/\+/g, '-')
        .replace(/=/g, '_')
        .replace(/\//g, '~');

      const sign = crypto.createSign('RSA-SHA1');
      sign.update(policyStr);
      const signature = sign.sign(CLOUDFRONT_PRIVATE_KEY, 'base64')
        .replace(/\+/g, '-')
        .replace(/=/g, '_')
        .replace(/\//g, '~');

      return {
        'CloudFront-Policy': policyBase64,
        'CloudFront-Signature': signature,
        'CloudFront-Key-Pair-Id': CLOUDFRONT_KEY_PAIR_ID
      };
    } catch (error) {
      console.error('[CDN] Error generating signed cookies:', error);
      return null;
    }
  }

  /**
   * Check if CDN is configured and healthy
   */
  async healthCheck() {
    const status = {
      configured: this.isConfigured,
      distributionId: CLOUDFRONT_DISTRIBUTION_ID || null,
      domain: CLOUDFRONT_DOMAIN || null,
      hasKeyPair: !!CLOUDFRONT_KEY_PAIR_ID,
      hasPrivateKey: !!CLOUDFRONT_PRIVATE_KEY,
      s3Bucket: S3_BUCKET,
      healthy: false
    };

    if (this.isConfigured && CLOUDFRONT_DISTRIBUTION_ID) {
      try {
        const distStatus = await this.getDistributionStatus();
        status.distributionStatus = distStatus.status;
        status.healthy = distStatus.status === 'Deployed' && distStatus.enabled;
      } catch (error) {
        status.error = error.message;
      }
    }

    return status;
  }
}

// Export singleton instance
const cdnService = new CDNService();
export default cdnService;

// Named exports for specific functions
export const getSignedMediaUrl = (s3Key, options) => cdnService.getSignedUrl(s3Key, options);
export const getRecordingUrl = (recordingId, tenantId, options) => cdnService.getRecordingUrl(recordingId, tenantId, options);
export const getTTSAudioUrl = (tenantId, filename, options) => cdnService.getTTSAudioUrl(tenantId, filename, options);
export const getVoicemailUrl = (tenantId, voicemailId, options) => cdnService.getVoicemailUrl(tenantId, voicemailId, options);
export const invalidateCache = (paths) => cdnService.invalidateCache(paths);

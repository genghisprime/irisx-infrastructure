import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

/**
 * S3 Service for managing call recordings and media files
 */
export class S3Service {
  constructor(config = {}) {
    this.config = {
      region: config.region || process.env.AWS_REGION || 'us-east-1',
      bucket: config.bucket || process.env.S3_RECORDINGS_BUCKET || 'irisx-recordings',
      ...config
    };

    // Initialize S3 client
    this.client = new S3Client({
      region: this.config.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
  }

  /**
   * Upload a file to S3
   */
  async uploadFile(localPath, s3Key, metadata = {}) {
    try {
      // Read file from local filesystem
      const fileContent = fs.readFileSync(localPath);
      
      // Detect content type
      const contentType = this.getContentType(localPath);

      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: s3Key,
        Body: fileContent,
        ContentType: contentType,
        Metadata: metadata,
        ServerSideEncryption: 'AES256' // Encrypt at rest
      });

      const result = await this.client.send(command);
      
      const s3Url = `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${s3Key}`;
      
      console.log(`✅ Uploaded file to S3: ${s3Url}`);
      
      return {
        success: true,
        url: s3Url,
        key: s3Key,
        bucket: this.config.bucket,
        etag: result.ETag
      };
    } catch (error) {
      console.error(`❌ S3 upload failed:`, error);
      throw error;
    }
  }

  /**
   * Upload call recording
   */
  async uploadRecording(localPath, callUUID, tenantId, metadata = {}) {
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = path.basename(localPath);
    const s3Key = `recordings/${tenantId}/${timestamp}/${callUUID}/${fileName}`;
    
    return await this.uploadFile(localPath, s3Key, {
      tenant_id: tenantId.toString(),
      call_uuid: callUUID,
      upload_timestamp: new Date().toISOString(),
      ...metadata
    });
  }

  /**
   * Generate a pre-signed URL for temporary access
   */
  async getSignedUrl(s3Key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: s3Key
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      
      console.log(`🔗 Generated signed URL for ${s3Key} (expires in ${expiresIn}s)`);
      
      return url;
    } catch (error) {
      console.error(`❌ Failed to generate signed URL:`, error);
      throw error;
    }
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(s3Key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: s3Key
      });

      await this.client.send(command);
      
      console.log(`🗑️ Deleted file from S3: ${s3Key}`);
      
      return { success: true };
    } catch (error) {
      console.error(`❌ S3 delete failed:`, error);
      throw error;
    }
  }

  /**
   * Get content type based on file extension
   */
  getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.flac': 'audio/flac',
      '.m4a': 'audio/mp4',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json'
    };
    return contentTypes[ext] || 'application/octet-stream';
  }

  /**
   * Check if S3 is configured and accessible
   */
  async healthCheck() {
    try {
      // Try to list objects (with limit) to verify access
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      const command = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        MaxKeys: 1
      });
      
      await this.client.send(command);
      return { status: 'connected', bucket: this.config.bucket };
    } catch (error) {
      console.error('S3 health check failed:', error);
      return { status: 'error', error: error.message };
    }
  }
}

export default S3Service;

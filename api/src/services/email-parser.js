/**
 * Email Parser Service
 * Week 13-14, Phase 1
 *
 * Handles parsing of inbound MIME emails
 * Extracts headers, body content, attachments, and metadata
 */

import { simpleParser } from 'mailparser';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'irisx-recordings';

/**
 * Parse raw MIME email
 * @param {string|Buffer} rawEmail - Raw MIME email content
 * @returns {Promise<Object>} Parsed email data
 */
export async function parseEmail(rawEmail) {
  try {
    // Parse the MIME email
    const parsed = await simpleParser(rawEmail);

    // Extract all headers
    const headers = {};
    for (const [key, value] of parsed.headers) {
      headers[key] = value;
    }

    // Extract email addresses
    const from = extractEmailAddress(parsed.from);
    const to = extractEmailAddresses(parsed.to);
    const cc = extractEmailAddresses(parsed.cc);
    const bcc = extractEmailAddresses(parsed.bcc);
    const replyTo = extractEmailAddress(parsed.replyTo);

    // Extract threading information
    const messageId = parsed.messageId || generateMessageId();
    const inReplyTo = parsed.inReplyTo || headers['in-reply-to'] || null;
    const references = parsed.references || headers['references'] || null;

    // Extract body content
    const htmlBody = parsed.html || null;
    const textBody = parsed.text || null;

    // If no text body but HTML exists, strip HTML tags for plain text
    const plainText = textBody || (htmlBody ? stripHtml(htmlBody) : '');

    // Extract attachments
    const attachments = parsed.attachments
      ? parsed.attachments.map((att) => ({
          filename: att.filename || 'attachment',
          contentType: att.contentType || 'application/octet-stream',
          size: att.size || 0,
          content: att.content, // Buffer
          contentId: att.contentId || null,
          contentDisposition: att.contentDisposition || 'attachment',
        }))
      : [];

    // Calculate spam score (basic heuristics)
    const spamScore = calculateSpamScore({
      from,
      subject: parsed.subject,
      textBody: plainText,
      headers,
    });

    return {
      // Headers
      messageId,
      inReplyTo,
      references,
      headers,

      // Addresses
      from,
      to,
      cc,
      bcc,
      replyTo,

      // Content
      subject: parsed.subject || '(no subject)',
      htmlBody,
      textBody: plainText,
      priority: parsed.priority || 'normal',

      // Attachments
      attachments,
      attachmentCount: attachments.length,

      // Metadata
      date: parsed.date || new Date(),
      spamScore,
      isSpam: spamScore > 50,

      // Raw data
      rawHeaders: headers,
    };
  } catch (error) {
    console.error('[EmailParser] Parse error:', error);
    throw new Error(`Failed to parse email: ${error.message}`);
  }
}

/**
 * Upload raw email to S3
 * @param {string|Buffer} rawEmail - Raw MIME email
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<string>} S3 key
 */
export async function uploadRawEmailToS3(rawEmail, tenantId) {
  try {
    const key = `emails/raw/${tenantId}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.eml`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: Buffer.isBuffer(rawEmail) ? rawEmail : Buffer.from(rawEmail),
        ContentType: 'message/rfc822',
        ServerSideEncryption: 'AES256',
      })
    );

    return key;
  } catch (error) {
    console.error('[EmailParser] S3 upload error:', error);
    throw new Error(`Failed to upload raw email to S3: ${error.message}`);
  }
}

/**
 * Upload email attachment to S3
 * @param {Object} attachment - Attachment object with content buffer
 * @param {string} tenantId - Tenant ID
 * @param {string} emailId - Email UUID
 * @returns {Promise<Object>} S3 key and metadata
 */
export async function uploadAttachmentToS3(attachment, tenantId, emailId) {
  try {
    const ext = getFileExtension(attachment.filename);
    const key = `emails/attachments/${tenantId}/${emailId}/${Date.now()}-${crypto
      .randomBytes(8)
      .toString('hex')}${ext}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: attachment.content,
        ContentType: attachment.contentType,
        ContentDisposition: `attachment; filename="${attachment.filename}"`,
        ServerSideEncryption: 'AES256',
        Metadata: {
          originalFilename: attachment.filename,
          contentId: attachment.contentId || '',
        },
      })
    );

    return {
      s3Key: key,
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      contentId: attachment.contentId,
    };
  } catch (error) {
    console.error('[EmailParser] Attachment upload error:', error);
    throw new Error(`Failed to upload attachment to S3: ${error.message}`);
  }
}

/**
 * Extract single email address from parsed address object
 * @param {Object} addressObj - Parsed address object from mailparser
 * @returns {string|null} Email address
 */
function extractEmailAddress(addressObj) {
  if (!addressObj) return null;
  if (typeof addressObj === 'string') return addressObj;
  if (addressObj.value && addressObj.value[0]) {
    return addressObj.value[0].address || null;
  }
  return null;
}

/**
 * Extract multiple email addresses from parsed address object
 * @param {Object} addressObj - Parsed address object from mailparser
 * @returns {Array<string>} Array of email addresses
 */
function extractEmailAddresses(addressObj) {
  if (!addressObj) return [];
  if (typeof addressObj === 'string') return [addressObj];
  if (addressObj.value && Array.isArray(addressObj.value)) {
    return addressObj.value.map((addr) => addr.address).filter(Boolean);
  }
  return [];
}

/**
 * Strip HTML tags to create plain text version
 * @param {string} html - HTML content
 * @returns {string} Plain text
 */
function stripHtml(html) {
  if (!html) return '';

  return (
    html
      // Remove script and style tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      // Remove HTML tags
      .replace(/<[^>]+>/g, '')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Calculate basic spam score
 * @param {Object} data - Email data (from, subject, textBody, headers)
 * @returns {number} Spam score (0-100)
 */
function calculateSpamScore(data) {
  let score = 0;

  // Check sender
  if (!data.from || !data.from.includes('@')) {
    score += 20;
  }

  // Check subject
  const spamSubjectWords = [
    'viagra',
    'cialis',
    'lottery',
    'winner',
    'claim',
    'free',
    'urgent',
    'act now',
    'limited time',
    'congratulations',
  ];
  const subject = (data.subject || '').toLowerCase();
  spamSubjectWords.forEach((word) => {
    if (subject.includes(word)) score += 5;
  });

  // Excessive uppercase in subject
  if (subject === subject.toUpperCase() && subject.length > 10) {
    score += 10;
  }

  // Excessive exclamation marks
  const exclamationCount = (subject.match(/!/g) || []).length;
  if (exclamationCount > 2) {
    score += exclamationCount * 3;
  }

  // Check body
  const body = (data.textBody || '').toLowerCase();

  // Body spam words
  const bodySpamWords = ['click here', 'buy now', 'order now', 'limited offer', 'act fast'];
  bodySpamWords.forEach((phrase) => {
    if (body.includes(phrase)) score += 3;
  });

  // Excessive links
  const linkCount = (body.match(/https?:\/\//g) || []).length;
  if (linkCount > 10) {
    score += Math.min(linkCount * 2, 20);
  }

  // Missing headers
  if (!data.headers['received']) {
    score += 15;
  }

  // Cap at 100
  return Math.min(score, 100);
}

/**
 * Generate message ID if missing
 * @returns {string} Message ID
 */
function generateMessageId() {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `<${timestamp}.${random}@irisx.io>`;
}

/**
 * Get file extension from filename
 * @param {string} filename - Filename
 * @returns {string} Extension with dot (e.g., '.pdf')
 */
function getFileExtension(filename) {
  if (!filename) return '';
  const parts = filename.split('.');
  if (parts.length > 1) {
    return '.' + parts[parts.length - 1];
  }
  return '';
}

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean} Is valid
 */
export function isValidEmail(email) {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Extract domain from email address
 * @param {string} email - Email address
 * @returns {string|null} Domain
 */
export function extractDomain(email) {
  if (!email || !email.includes('@')) return null;
  return email.split('@')[1].toLowerCase();
}

/**
 * Check if email is from a disposable email provider
 * @param {string} email - Email address
 * @returns {boolean} Is disposable
 */
export function isDisposableEmail(email) {
  const domain = extractDomain(email);
  if (!domain) return false;

  const disposableDomains = [
    'tempmail.com',
    '10minutemail.com',
    'guerrillamail.com',
    'mailinator.com',
    'throwaway.email',
    'temp-mail.org',
    'fakeinbox.com',
  ];

  return disposableDomains.includes(domain);
}

export default {
  parseEmail,
  uploadRawEmailToS3,
  uploadAttachmentToS3,
  isValidEmail,
  extractDomain,
  isDisposableEmail,
};

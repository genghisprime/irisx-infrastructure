/**
 * Translation Middleware
 *
 * Provides helper functions for integrating translation into channel handlers.
 * This middleware can be used by SMS, Chat, Email, WhatsApp, and Social services
 * to automatically translate messages based on tenant settings.
 */

import translationService from './translation.js';
import { query } from '../db/connection.js';

class TranslationMiddleware {
  /**
   * Check if translation is enabled for a tenant/channel
   */
  async isEnabled(tenantId, channel) {
    try {
      const settings = await translationService.getTenantSettings(tenantId);

      if (!settings?.translation_enabled) {
        return { enabled: false };
      }

      const channelSettings = settings.channel_settings?.[channel];
      if (!channelSettings?.enabled) {
        return { enabled: false };
      }

      return {
        enabled: true,
        settings: channelSettings,
        defaultLanguage: settings.default_language || 'en',
        autoDetect: settings.auto_detect
      };
    } catch (error) {
      console.error('[TranslationMiddleware] isEnabled error:', error);
      return { enabled: false };
    }
  }

  /**
   * Translate inbound message (customer → agent)
   * Detects customer language and translates to agent's language
   */
  async translateInbound(params) {
    const {
      tenantId,
      channel,
      text,
      customerLanguage = null, // null = auto-detect
      agentLanguage = 'en',
      conversationId = null,
      messageId = null,
      contactId = null
    } = params;

    const config = await this.isEnabled(tenantId, channel);

    if (!config.enabled || !config.settings.auto_translate_inbound) {
      return {
        success: true,
        translated: false,
        originalText: text,
        translatedText: text,
        reason: config.enabled ? 'inbound_disabled' : 'translation_disabled'
      };
    }

    try {
      // Detect language if not provided
      let sourceLanguage = customerLanguage;
      if (!sourceLanguage && config.autoDetect) {
        const detection = await translationService.detectLanguage({
          tenantId,
          text
        });
        if (detection.success) {
          sourceLanguage = detection.language;

          // Store detected language for contact if we have contactId
          if (contactId) {
            await this.updateContactLanguage(contactId, sourceLanguage);
          }
        }
      }

      // Don't translate if same language
      if (sourceLanguage === agentLanguage) {
        return {
          success: true,
          translated: false,
          originalText: text,
          translatedText: text,
          detectedLanguage: sourceLanguage,
          reason: 'same_language'
        };
      }

      // Translate
      const result = await translationService.translate({
        tenantId,
        text,
        sourceLanguage,
        targetLanguage: agentLanguage,
        channel,
        direction: 'inbound',
        conversationId,
        messageId
      });

      return {
        success: result.success,
        translated: result.success,
        originalText: text,
        translatedText: result.translatedText || text,
        detectedLanguage: result.detectedLanguage || sourceLanguage,
        provider: result.provider,
        cached: result.cached
      };
    } catch (error) {
      console.error('[TranslationMiddleware] translateInbound error:', error);
      return {
        success: false,
        translated: false,
        originalText: text,
        translatedText: text,
        error: error.message
      };
    }
  }

  /**
   * Translate outbound message (agent → customer)
   * Translates from agent's language to customer's preferred language
   */
  async translateOutbound(params) {
    const {
      tenantId,
      channel,
      text,
      customerLanguage,
      agentLanguage = 'en',
      conversationId = null,
      messageId = null
    } = params;

    const config = await this.isEnabled(tenantId, channel);

    if (!config.enabled || !config.settings.auto_translate_outbound) {
      return {
        success: true,
        translated: false,
        originalText: text,
        translatedText: text,
        reason: config.enabled ? 'outbound_disabled' : 'translation_disabled'
      };
    }

    // Need customer language for outbound translation
    if (!customerLanguage) {
      return {
        success: true,
        translated: false,
        originalText: text,
        translatedText: text,
        reason: 'no_customer_language'
      };
    }

    // Don't translate if same language
    if (customerLanguage === agentLanguage) {
      return {
        success: true,
        translated: false,
        originalText: text,
        translatedText: text,
        reason: 'same_language'
      };
    }

    try {
      const result = await translationService.translate({
        tenantId,
        text,
        sourceLanguage: agentLanguage,
        targetLanguage: customerLanguage,
        channel,
        direction: 'outbound',
        conversationId,
        messageId
      });

      return {
        success: result.success,
        translated: result.success,
        originalText: text,
        translatedText: result.translatedText || text,
        targetLanguage: customerLanguage,
        provider: result.provider,
        cached: result.cached
      };
    } catch (error) {
      console.error('[TranslationMiddleware] translateOutbound error:', error);
      return {
        success: false,
        translated: false,
        originalText: text,
        translatedText: text,
        error: error.message
      };
    }
  }

  /**
   * Translate email (subject + body)
   */
  async translateEmail(params) {
    const {
      tenantId,
      subject,
      body,
      customerLanguage,
      agentLanguage = 'en',
      direction = 'inbound'
    } = params;

    const config = await this.isEnabled(tenantId, 'email');

    const shouldTranslate = direction === 'inbound'
      ? config.settings?.auto_translate_inbound
      : config.settings?.auto_translate_outbound;

    if (!config.enabled || !shouldTranslate) {
      return {
        success: true,
        translated: false,
        originalSubject: subject,
        originalBody: body,
        translatedSubject: subject,
        translatedBody: body,
        reason: config.enabled ? `${direction}_disabled` : 'translation_disabled'
      };
    }

    try {
      const sourceLanguage = direction === 'inbound' ? customerLanguage : agentLanguage;
      const targetLanguage = direction === 'inbound' ? agentLanguage : customerLanguage;

      // Don't translate if same language or missing customer language
      if (!sourceLanguage || !targetLanguage || sourceLanguage === targetLanguage) {
        return {
          success: true,
          translated: false,
          originalSubject: subject,
          originalBody: body,
          translatedSubject: subject,
          translatedBody: body,
          reason: 'same_language_or_missing'
        };
      }

      const result = await translationService.translateEmail({
        tenantId,
        subject,
        body,
        customerLanguage,
        agentLanguage,
        direction
      });

      return {
        success: result.success,
        translated: result.success && !result.skipped,
        originalSubject: subject,
        originalBody: body,
        translatedSubject: result.translatedSubject || subject,
        translatedBody: result.translatedBody || body,
        detectedLanguage: result.detectedLanguage
      };
    } catch (error) {
      console.error('[TranslationMiddleware] translateEmail error:', error);
      return {
        success: false,
        translated: false,
        originalSubject: subject,
        originalBody: body,
        translatedSubject: subject,
        translatedBody: body,
        error: error.message
      };
    }
  }

  /**
   * Update contact's preferred language
   */
  async updateContactLanguage(contactId, language) {
    try {
      await query(`
        UPDATE contacts
        SET preferred_language = $1, updated_at = NOW()
        WHERE id = $2 AND preferred_language IS NULL
      `, [language, contactId]);
    } catch (error) {
      console.error('[TranslationMiddleware] updateContactLanguage error:', error);
    }
  }

  /**
   * Get contact's preferred language
   */
  async getContactLanguage(contactId) {
    try {
      const result = await query(`
        SELECT preferred_language FROM contacts WHERE id = $1
      `, [contactId]);

      return result.rows[0]?.preferred_language || null;
    } catch (error) {
      console.error('[TranslationMiddleware] getContactLanguage error:', error);
      return null;
    }
  }

  /**
   * Get conversation language (from first message detection or contact)
   */
  async getConversationLanguage(conversationId) {
    try {
      // Check if we have detected language stored
      const result = await query(`
        SELECT metadata->>'detected_language' as detected_language
        FROM conversations
        WHERE id = $1
      `, [conversationId]);

      return result.rows[0]?.detected_language || null;
    } catch (error) {
      console.error('[TranslationMiddleware] getConversationLanguage error:', error);
      return null;
    }
  }

  /**
   * Store detected language for conversation
   */
  async setConversationLanguage(conversationId, language) {
    try {
      await query(`
        UPDATE conversations
        SET metadata = COALESCE(metadata, '{}')::jsonb || $1::jsonb
        WHERE id = $2
      `, [JSON.stringify({ detected_language: language }), conversationId]);
    } catch (error) {
      console.error('[TranslationMiddleware] setConversationLanguage error:', error);
    }
  }

  /**
   * Process incoming message with automatic translation
   * Returns message with both original and translated text
   */
  async processIncomingMessage(params) {
    const {
      tenantId,
      channel,
      text,
      conversationId,
      contactId,
      agentLanguage = 'en'
    } = params;

    // Get customer's known language if available
    const customerLanguage = contactId
      ? await this.getContactLanguage(contactId)
      : await this.getConversationLanguage(conversationId);

    const result = await this.translateInbound({
      tenantId,
      channel,
      text,
      customerLanguage,
      agentLanguage,
      conversationId,
      contactId
    });

    // Store detected language for future use
    if (result.detectedLanguage && conversationId) {
      await this.setConversationLanguage(conversationId, result.detectedLanguage);
    }

    return {
      originalText: text,
      displayText: result.translatedText, // What agent sees
      translated: result.translated,
      detectedLanguage: result.detectedLanguage,
      customerLanguage: result.detectedLanguage || customerLanguage
    };
  }

  /**
   * Process outgoing message with automatic translation
   * Returns translated text for customer
   */
  async processOutgoingMessage(params) {
    const {
      tenantId,
      channel,
      text,
      conversationId,
      contactId,
      agentLanguage = 'en'
    } = params;

    // Get customer's language
    const customerLanguage = contactId
      ? await this.getContactLanguage(contactId)
      : await this.getConversationLanguage(conversationId);

    const result = await this.translateOutbound({
      tenantId,
      channel,
      text,
      customerLanguage,
      agentLanguage,
      conversationId
    });

    return {
      originalText: text, // What agent typed
      sendText: result.translatedText, // What customer receives
      translated: result.translated,
      targetLanguage: customerLanguage
    };
  }
}

// Export singleton instance
const translationMiddleware = new TranslationMiddleware();
export default translationMiddleware;
export { TranslationMiddleware };

import { query } from '../db/connection.js';
import path from 'path';
import TTSService from './tts.js';

/**
 * IVR (Interactive Voice Response) Service
 * Handles DTMF input processing and menu navigation with TTS support
 */
export class IVRService {
  constructor(freeswitchService) {
    this.freeswitch = freeswitchService;
    this.ttsService = TTSService;
    this.activeSessions = new Map(); // callUUID -> IVRSession
  }

  /**
   * Start an IVR session for a call
   */
  async startSession(callUUID, menuId, tenantId) {
    // Load menu configuration from database
    const menuResult = await query(
      'SELECT * FROM ivr_menus WHERE id = $1 AND tenant_id = $2 AND status = $3',
      [menuId, tenantId, 'active']
    );

    if (menuResult.rows.length === 0) {
      throw new Error(`IVR menu ${menuId} not found or inactive`);
    }

    const menu = menuResult.rows[0];

    // Create session
    const session = {
      callUUID,
      tenantId,
      currentMenuId: menuId,
      currentMenu: menu,
      menuHistory: [menuId],
      inputBuffer: '',
      maxDigits: menu.max_digits || 1,
      digitTimeout: menu.digit_timeout_ms || 3000,
      invalidAttempts: 0,
      maxInvalidAttempts: 3,
      startedAt: new Date()
    };

    this.activeSessions.set(callUUID, session);

    // Play greeting
    await this.playMenuPrompt(session);

    console.log(`📞 IVR session started for call ${callUUID}, menu ${menuId}`);
    return session;
  }

  /**
   * Handle DTMF digit input
   */
  async handleDTMF(callUUID, digit) {
    const session = this.activeSessions.get(callUUID);
    if (!session) {
      console.warn(`⚠️ No IVR session found for call ${callUUID}`);
      return;
    }

    console.log(`🔢 DTMF received for call ${callUUID}: ${digit}`);

    // Clear any pending digit timeout
    if (session.digitTimer) {
      clearTimeout(session.digitTimer);
    }

    // Add digit to buffer
    session.inputBuffer += digit;

    // Check if we have enough digits
    if (session.inputBuffer.length >= session.maxDigits) {
      await this.processInput(session);
    } else {
      // Set timeout for next digit
      session.digitTimer = setTimeout(async () => {
        await this.processInput(session);
      }, session.digitTimeout);
    }
  }

  /**
   * Process accumulated DTMF input
   */
  async processInput(session) {
    const input = session.inputBuffer;
    session.inputBuffer = ''; // Clear buffer

    console.log(`🎯 Processing IVR input "${input}" for call ${session.callUUID}`);

    // Look up menu action for this input
    const actionResult = await query(
      'SELECT * FROM ivr_menu_options WHERE menu_id = $1 AND digit_pattern = $2',
      [session.currentMenuId, input]
    );

    if (actionResult.rows.length === 0) {
      // Invalid input
      session.invalidAttempts++;
      
      if (session.invalidAttempts >= session.maxInvalidAttempts) {
        // Max attempts reached
        await this.playAudio(session.callUUID, session.currentMenu.max_attempts_audio);
        await this.endSession(session.callUUID);
      } else {
        // Play invalid input message and retry
        await this.playAudio(session.callUUID, session.currentMenu.invalid_audio);
        await this.playMenuPrompt(session);
      }
      return;
    }

    const action = actionResult.rows[0];
    session.invalidAttempts = 0; // Reset invalid counter

    // Execute action
    await this.executeAction(session, action);
  }

  /**
   * Execute menu action
   */
  async executeAction(session, action) {
    console.log(`▶️ Executing action: ${action.action_type} for call ${session.callUUID}`);

    switch (action.action_type) {
      case 'submenu':
        // Navigate to sub-menu
        await this.navigateToMenu(session, action.action_value);
        break;

      case 'transfer':
        // Transfer call to number/extension
        await this.transferCall(session, action.action_value);
        break;

      case 'hangup':
        // End call
        await this.endSession(session.callUUID);
        await this.freeswitch.hangup(session.callUUID, 'NORMAL_CLEARING');
        break;

      case 'repeat':
        // Replay current menu
        await this.playMenuPrompt(session);
        break;

      case 'return':
        // Go back to previous menu
        if (session.menuHistory.length > 1) {
          session.menuHistory.pop(); // Remove current
          const previousMenuId = session.menuHistory[session.menuHistory.length - 1];
          await this.navigateToMenu(session, previousMenuId);
        } else {
          await this.playMenuPrompt(session);
        }
        break;

      case 'webhook':
        // Call external webhook
        await this.callWebhook(session, action.action_value);
        break;

      case 'voicemail':
        // Start voicemail recording
        await this.startVoicemail(session, action.action_value);
        break;

      default:
        console.warn(`⚠️ Unknown action type: ${action.action_type}`);
        await this.playMenuPrompt(session);
    }
  }

  /**
   * Navigate to a different menu
   */
  async navigateToMenu(session, menuId) {
    const menuResult = await query(
      'SELECT * FROM ivr_menus WHERE id = $1 AND tenant_id = $2 AND status = $3',
      [menuId, session.tenantId, 'active']
    );

    if (menuResult.rows.length === 0) {
      console.error(`❌ Menu ${menuId} not found`);
      await this.endSession(session.callUUID);
      return;
    }

    session.currentMenuId = menuId;
    session.currentMenu = menuResult.rows[0];
    session.menuHistory.push(menuId);
    session.maxDigits = session.currentMenu.max_digits || 1;

    await this.playMenuPrompt(session);
  }

  /**
   * Play menu prompt audio
   */
  async playMenuPrompt(session) {
    await this.playAudio(session.callUUID, session.currentMenu.greeting_audio);
  }

  /**
   * Play audio to call - supports both static files and dynamic TTS
   * @param {string} callUUID - Call UUID
   * @param {string|object} audioSource - Audio file path or TTS config {text, voice, provider}
   */
  async playAudio(callUUID, audioSource) {
    if (!audioSource) return;

    try {
      let audioPath;

      // Check if this is a TTS request (object) or static file (string)
      if (typeof audioSource === 'object' && audioSource.text) {
        // Dynamic TTS generation
        console.log(`🗣️ Generating TTS for call ${callUUID}: "${audioSource.text}"`);

        const ttsResult = await this.ttsService.generateSpeech({
          text: audioSource.text,
          voice: audioSource.voice || 'alloy',
          provider: audioSource.provider || 'openai',
          tenantId: audioSource.tenantId || 1,
          cache: true  // Enable caching for cost savings
        });

        audioPath = ttsResult.audioPath;
        console.log(`🔊 TTS generated: ${audioPath} (${ttsResult.provider}, $${(ttsResult.costCents / 100).toFixed(4)})`);
      } else if (typeof audioSource === 'string') {
        // Check if string starts with 'tts:' prefix for inline TTS
        if (audioSource.startsWith('tts:')) {
          const ttsText = audioSource.substring(4);  // Remove 'tts:' prefix
          const ttsResult = await this.ttsService.generateSpeech({
            text: ttsText,
            voice: 'alloy',
            provider: 'openai',
            tenantId: 1,
            cache: true
          });
          audioPath = ttsResult.audioPath;
        } else {
          // Static audio file
          audioPath = audioSource;
        }
      } else {
        throw new Error('Invalid audio source format');
      }

      // Play audio via FreeSWITCH
      const cmd = `uuid_broadcast ${callUUID} ${audioPath}`;
      await this.freeswitch.api(cmd);
      console.log(`🔊 Playing audio: ${audioPath} to call ${callUUID}`);
    } catch (error) {
      console.error(`❌ Failed to play audio:`, error);
      throw error;
    }
  }

  /**
   * Transfer call to destination
   */
  async transferCall(session, destination) {
    try {
      console.log(`📞 Transferring call ${session.callUUID} to ${destination}`);
      const cmd = `uuid_transfer ${session.callUUID} ${destination}`;
      await this.freeswitch.api(cmd);
      await this.endSession(session.callUUID);
    } catch (error) {
      console.error(`❌ Transfer failed:`, error);
    }
  }

  /**
   * Call external webhook
   */
  async callWebhook(session, webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_uuid: session.callUUID,
          tenant_id: session.tenantId,
          menu_id: session.currentMenuId,
          input_buffer: session.inputBuffer
        })
      });

      const result = await response.json();
      console.log(`🌐 Webhook response:`, result);

      // Process webhook response actions
      if (result.action) {
        await this.executeAction(session, {
          action_type: result.action,
          action_value: result.value
        });
      }
    } catch (error) {
      console.error(`❌ Webhook call failed:`, error);
    }
  }

  /**
   * Start voicemail recording
   */
  async startVoicemail(session, mailboxId) {
    const recordingPath = `/usr/local/freeswitch/recordings/${session.callUUID}_vm.wav`;
    
    try {
      console.log(`🎙️ Starting voicemail recording for call ${session.callUUID}`);
      
      // Play beep
      await this.playAudio(session.callUUID, 'tone_stream://%(500,0,800)');
      
      // Start recording
      const cmd = `uuid_record ${session.callUUID} start ${recordingPath}`;
      await this.freeswitch.api(cmd);
      
      // TODO: Upload to S3 when call ends
    } catch (error) {
      console.error(`❌ Voicemail recording failed:`, error);
    }
  }

  /**
   * End IVR session
   */
  async endSession(callUUID) {
    const session = this.activeSessions.get(callUUID);
    if (session) {
      if (session.digitTimer) {
        clearTimeout(session.digitTimer);
      }
      this.activeSessions.delete(callUUID);
      console.log(`📞 IVR session ended for call ${callUUID}`);
    }
  }

  /**
   * Get active session
   */
  getSession(callUUID) {
    return this.activeSessions.get(callUUID);
  }
}

export default IVRService;

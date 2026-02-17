/**
 * AI Voice Assistant Service
 * Multi-provider TTS/STT with conversational AI for IVR bots
 */

import { pool } from '../database.js';

// ============================================
// Provider Adapters
// ============================================
const ttsAdapters = {
    elevenlabs: {
        async synthesize(text, voiceId, options, credentials) {
            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                method: 'POST',
                headers: {
                    'xi-api-key': credentials.api_key,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text,
                    model_id: options.model || 'eleven_multilingual_v2',
                    voice_settings: {
                        stability: options.stability || 0.5,
                        similarity_boost: options.similarity || 0.75,
                        style: options.style || 0.0,
                        use_speaker_boost: true
                    }
                })
            });
            if (!response.ok) throw new Error(`ElevenLabs TTS error: ${response.status}`);
            return { audio: await response.arrayBuffer(), format: 'mp3' };
        }
    },
    google_tts: {
        async synthesize(text, voiceId, options, credentials) {
            const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${credentials.api_key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: { text },
                    voice: { languageCode: options.language || 'en-US', name: voiceId },
                    audioConfig: {
                        audioEncoding: 'MP3',
                        speakingRate: options.speakingRate || 1.0,
                        pitch: options.pitch || 0.0,
                        volumeGainDb: options.volumeGainDb || 0.0
                    }
                })
            });
            if (!response.ok) throw new Error(`Google TTS error: ${response.status}`);
            const data = await response.json();
            return { audio: Buffer.from(data.audioContent, 'base64'), format: 'mp3' };
        }
    },
    aws_polly: {
        async synthesize(text, voiceId, options, credentials) {
            // AWS SDK integration would go here
            // For now, return a placeholder
            throw new Error('AWS Polly requires AWS SDK integration');
        }
    },
    azure_tts: {
        async synthesize(text, voiceId, options, credentials) {
            const response = await fetch(`https://${credentials.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': credentials.subscription_key,
                    'Content-Type': 'application/ssml+xml',
                    'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
                },
                body: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${options.language || 'en-US'}">
                    <voice name="${voiceId}">${text}</voice>
                </speak>`
            });
            if (!response.ok) throw new Error(`Azure TTS error: ${response.status}`);
            return { audio: await response.arrayBuffer(), format: 'mp3' };
        }
    },
    openai_tts: {
        async synthesize(text, voiceId, options, credentials) {
            const response = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${credentials.api_key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: options.model || 'tts-1',
                    input: text,
                    voice: voiceId || 'alloy',
                    response_format: 'mp3',
                    speed: options.speakingRate || 1.0
                })
            });
            if (!response.ok) throw new Error(`OpenAI TTS error: ${response.status}`);
            return { audio: await response.arrayBuffer(), format: 'mp3' };
        }
    }
};

const sttAdapters = {
    google_stt: {
        async transcribe(audio, options, credentials) {
            const audioContent = Buffer.from(audio).toString('base64');
            const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${credentials.api_key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    config: {
                        encoding: options.encoding || 'LINEAR16',
                        sampleRateHertz: options.sampleRate || 16000,
                        languageCode: options.language || 'en-US',
                        enableAutomaticPunctuation: true
                    },
                    audio: { content: audioContent }
                })
            });
            if (!response.ok) throw new Error(`Google STT error: ${response.status}`);
            const data = await response.json();
            const result = data.results?.[0]?.alternatives?.[0];
            return { transcript: result?.transcript || '', confidence: result?.confidence || 0 };
        }
    },
    deepgram: {
        async transcribe(audio, options, credentials) {
            const response = await fetch(`https://api.deepgram.com/v1/listen?model=nova-2&language=${options.language || 'en'}&punctuate=true`, {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${credentials.api_key}`,
                    'Content-Type': 'audio/wav'
                },
                body: audio
            });
            if (!response.ok) throw new Error(`Deepgram error: ${response.status}`);
            const data = await response.json();
            const result = data.results?.channels?.[0]?.alternatives?.[0];
            return { transcript: result?.transcript || '', confidence: result?.confidence || 0 };
        }
    },
    assemblyai: {
        async transcribe(audio, options, credentials) {
            // AssemblyAI requires upload + polling, simplified version
            const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
                method: 'POST',
                headers: { 'Authorization': credentials.api_key },
                body: audio
            });
            const { upload_url } = await uploadResponse.json();

            const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
                method: 'POST',
                headers: {
                    'Authorization': credentials.api_key,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ audio_url: upload_url, language_code: options.language || 'en' })
            });
            const { id } = await transcriptResponse.json();

            // Poll for result
            let result;
            for (let i = 0; i < 60; i++) {
                await new Promise(r => setTimeout(r, 1000));
                const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
                    headers: { 'Authorization': credentials.api_key }
                });
                result = await pollResponse.json();
                if (result.status === 'completed') break;
                if (result.status === 'error') throw new Error(result.error);
            }
            return { transcript: result.text || '', confidence: result.confidence || 0 };
        }
    },
    openai_whisper: {
        async transcribe(audio, options, credentials) {
            const formData = new FormData();
            formData.append('file', new Blob([audio], { type: 'audio/wav' }), 'audio.wav');
            formData.append('model', 'whisper-1');
            formData.append('language', options.language?.substring(0, 2) || 'en');

            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${credentials.api_key}` },
                body: formData
            });
            if (!response.ok) throw new Error(`OpenAI Whisper error: ${response.status}`);
            const data = await response.json();
            return { transcript: data.text || '', confidence: 0.95 };
        }
    },
    azure_tts: {
        async transcribe(audio, options, credentials) {
            const response = await fetch(`https://${credentials.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${options.language || 'en-US'}`, {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': credentials.subscription_key,
                    'Content-Type': 'audio/wav'
                },
                body: audio
            });
            if (!response.ok) throw new Error(`Azure STT error: ${response.status}`);
            const data = await response.json();
            return { transcript: data.DisplayText || '', confidence: data.NBest?.[0]?.Confidence || 0 };
        }
    }
};

class AIVoiceService {
    // ============================================
    // Provider Management
    // ============================================
    async listProviders() {
        const result = await pool.query(`
            SELECT * FROM ai_voice_providers WHERE is_active = true ORDER BY display_name
        `);
        return result.rows;
    }

    async getProviderCredentials(providerId, tenantId = null) {
        // Try tenant credentials first (BYOK)
        if (tenantId) {
            const tenantCreds = await pool.query(`
                SELECT credentials FROM ai_voice_tenant_credentials
                WHERE provider_id = $1 AND tenant_id = $2 AND is_active = true
            `, [providerId, tenantId]);
            if (tenantCreds.rows.length > 0) return tenantCreds.rows[0].credentials;
        }

        // Fall back to platform credentials
        const platformCreds = await pool.query(`
            SELECT credential_key, credential_value FROM ai_voice_platform_credentials
            WHERE provider_id = $1 AND is_active = true AND environment = 'production'
        `, [providerId]);

        const credentials = {};
        for (const row of platformCreds.rows) {
            credentials[row.credential_key] = row.credential_value;
        }
        return credentials;
    }

    async saveTenantCredentials(tenantId, providerId, credentials) {
        await pool.query(`
            INSERT INTO ai_voice_tenant_credentials (tenant_id, provider_id, credentials)
            VALUES ($1, $2, $3)
            ON CONFLICT (tenant_id, provider_id) DO UPDATE SET
                credentials = $3, updated_at = NOW()
        `, [tenantId, providerId, credentials]);
    }

    // ============================================
    // Voice Assistant CRUD
    // ============================================
    async createAssistant(tenantId, data, userId) {
        const result = await pool.query(`
            INSERT INTO ai_voice_assistants (
                tenant_id, name, description, assistant_type,
                tts_provider_id, stt_provider_id, voice_id, voice_name, language,
                speaking_rate, pitch, volume_gain_db,
                ai_model_id, system_prompt, max_response_tokens, temperature,
                initial_greeting, fallback_message, goodbye_message, transfer_message,
                max_silence_seconds, max_conversation_minutes, max_no_input_retries, max_no_match_retries,
                intents_config, entities_config, ivr_flow_id, webhook_url, webhook_events,
                sentiment_analysis_enabled, call_recording_enabled, transcription_enabled, summarization_enabled,
                status, created_by
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35
            ) RETURNING *
        `, [
            tenantId, data.name, data.description, data.assistant_type || 'ivr_bot',
            data.tts_provider_id, data.stt_provider_id, data.voice_id, data.voice_name, data.language || 'en-US',
            data.speaking_rate || 1.0, data.pitch || 0.0, data.volume_gain_db || 0.0,
            data.ai_model_id, data.system_prompt, data.max_response_tokens || 500, data.temperature || 0.7,
            data.initial_greeting, data.fallback_message, data.goodbye_message, data.transfer_message,
            data.max_silence_seconds || 5, data.max_conversation_minutes || 10, data.max_no_input_retries || 3, data.max_no_match_retries || 3,
            JSON.stringify(data.intents_config || []), JSON.stringify(data.entities_config || []),
            data.ivr_flow_id, data.webhook_url, JSON.stringify(data.webhook_events || []),
            data.sentiment_analysis_enabled || false, data.call_recording_enabled !== false,
            data.transcription_enabled !== false, data.summarization_enabled || false,
            data.status || 'draft', userId
        ]);
        return result.rows[0];
    }

    async getAssistant(assistantId, tenantId = null) {
        let query = `
            SELECT a.*,
                   tp.display_name as tts_provider_name,
                   sp.display_name as stt_provider_name,
                   m.model_name as ai_model_name
            FROM ai_voice_assistants a
            LEFT JOIN ai_voice_providers tp ON a.tts_provider_id = tp.id
            LEFT JOIN ai_voice_providers sp ON a.stt_provider_id = sp.id
            LEFT JOIN ai_models m ON a.ai_model_id = m.id
            WHERE a.id = $1
        `;
        const params = [assistantId];
        if (tenantId) {
            query += ' AND a.tenant_id = $2';
            params.push(tenantId);
        }
        const result = await pool.query(query, params);
        return result.rows[0];
    }

    async listAssistants(tenantId, filters = {}) {
        let query = `
            SELECT a.*,
                   tp.display_name as tts_provider_name,
                   sp.display_name as stt_provider_name,
                   (SELECT COUNT(*) FROM ai_voice_conversations c WHERE c.assistant_id = a.id) as total_conversations
            FROM ai_voice_assistants a
            LEFT JOIN ai_voice_providers tp ON a.tts_provider_id = tp.id
            LEFT JOIN ai_voice_providers sp ON a.stt_provider_id = sp.id
            WHERE a.tenant_id = $1
        `;
        const params = [tenantId];

        if (filters.status) {
            params.push(filters.status);
            query += ` AND a.status = $${params.length}`;
        }
        if (filters.assistant_type) {
            params.push(filters.assistant_type);
            query += ` AND a.assistant_type = $${params.length}`;
        }

        query += ' ORDER BY a.created_at DESC';

        if (filters.limit) {
            params.push(filters.limit);
            query += ` LIMIT $${params.length}`;
        }
        if (filters.offset) {
            params.push(filters.offset);
            query += ` OFFSET $${params.length}`;
        }

        const result = await pool.query(query, params);
        return result.rows;
    }

    async updateAssistant(assistantId, tenantId, data) {
        const updates = [];
        const values = [assistantId, tenantId];
        let paramCount = 2;

        const allowedFields = [
            'name', 'description', 'assistant_type', 'tts_provider_id', 'stt_provider_id',
            'voice_id', 'voice_name', 'language', 'speaking_rate', 'pitch', 'volume_gain_db',
            'ai_model_id', 'system_prompt', 'max_response_tokens', 'temperature',
            'initial_greeting', 'fallback_message', 'goodbye_message', 'transfer_message',
            'max_silence_seconds', 'max_conversation_minutes', 'max_no_input_retries', 'max_no_match_retries',
            'intents_config', 'entities_config', 'ivr_flow_id', 'webhook_url', 'webhook_events',
            'sentiment_analysis_enabled', 'call_recording_enabled', 'transcription_enabled', 'summarization_enabled',
            'status'
        ];

        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                paramCount++;
                const value = typeof data[field] === 'object' ? JSON.stringify(data[field]) : data[field];
                updates.push(`${field} = $${paramCount}`);
                values.push(value);
            }
        }

        if (updates.length === 0) return this.getAssistant(assistantId, tenantId);

        updates.push('updated_at = NOW()');

        const result = await pool.query(`
            UPDATE ai_voice_assistants SET ${updates.join(', ')}
            WHERE id = $1 AND tenant_id = $2 RETURNING *
        `, values);

        return result.rows[0];
    }

    async deleteAssistant(assistantId, tenantId) {
        const result = await pool.query(`
            DELETE FROM ai_voice_assistants WHERE id = $1 AND tenant_id = $2 RETURNING id
        `, [assistantId, tenantId]);
        return result.rows[0];
    }

    async publishAssistant(assistantId, tenantId, userId, notes = '') {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get current assistant config
            const assistant = await client.query(`
                SELECT * FROM ai_voice_assistants WHERE id = $1 AND tenant_id = $2
            `, [assistantId, tenantId]);

            if (!assistant.rows[0]) throw new Error('Assistant not found');

            const currentVersion = assistant.rows[0].version;
            const newVersion = currentVersion + 1;

            // Save version snapshot
            await client.query(`
                INSERT INTO ai_voice_assistant_versions (assistant_id, version, config_snapshot, published_by, notes)
                VALUES ($1, $2, $3, $4, $5)
            `, [assistantId, newVersion, assistant.rows[0], userId, notes]);

            // Update assistant status and version
            await client.query(`
                UPDATE ai_voice_assistants SET status = 'active', version = $1, updated_at = NOW()
                WHERE id = $2
            `, [newVersion, assistantId]);

            await client.query('COMMIT');
            return { version: newVersion, status: 'active' };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // ============================================
    // Text-to-Speech
    // ============================================
    async synthesizeSpeech(tenantId, text, options = {}) {
        const providerId = options.provider_id;
        const voiceId = options.voice_id;

        const provider = await pool.query(`SELECT * FROM ai_voice_providers WHERE id = $1`, [providerId]);
        if (!provider.rows[0]) throw new Error('TTS provider not found');

        const credentials = await this.getProviderCredentials(providerId, tenantId);
        const adapter = ttsAdapters[provider.rows[0].provider_name];
        if (!adapter) throw new Error(`No TTS adapter for provider: ${provider.rows[0].provider_name}`);

        const startTime = Date.now();
        const result = await adapter.synthesize(text, voiceId, options, credentials);
        const latencyMs = Date.now() - startTime;

        // Track usage
        await pool.query(`
            INSERT INTO ai_voice_usage (tenant_id, usage_date, tts_provider_id, tts_characters)
            VALUES ($1, CURRENT_DATE, $2, $3)
            ON CONFLICT (tenant_id, usage_date) DO UPDATE SET
                tts_characters = ai_voice_usage.tts_characters + $3
        `, [tenantId, providerId, text.length]);

        return { ...result, latencyMs };
    }

    // ============================================
    // Speech-to-Text
    // ============================================
    async transcribeSpeech(tenantId, audio, options = {}) {
        const providerId = options.provider_id;

        const provider = await pool.query(`SELECT * FROM ai_voice_providers WHERE id = $1`, [providerId]);
        if (!provider.rows[0]) throw new Error('STT provider not found');

        const credentials = await this.getProviderCredentials(providerId, tenantId);
        const adapter = sttAdapters[provider.rows[0].provider_name];
        if (!adapter) throw new Error(`No STT adapter for provider: ${provider.rows[0].provider_name}`);

        const startTime = Date.now();
        const result = await adapter.transcribe(audio, options, credentials);
        const latencyMs = Date.now() - startTime;

        // Track usage (estimate seconds from audio size)
        const estimatedSeconds = Math.ceil(audio.length / 32000); // rough estimate
        await pool.query(`
            INSERT INTO ai_voice_usage (tenant_id, usage_date, stt_provider_id, stt_seconds)
            VALUES ($1, CURRENT_DATE, $2, $3)
            ON CONFLICT (tenant_id, usage_date) DO UPDATE SET
                stt_seconds = ai_voice_usage.stt_seconds + $3
        `, [tenantId, providerId, estimatedSeconds]);

        return { ...result, latencyMs };
    }

    // ============================================
    // Conversation Management
    // ============================================
    async startConversation(assistantId, tenantId, callDetails) {
        const result = await pool.query(`
            INSERT INTO ai_voice_conversations (
                assistant_id, tenant_id, call_id, caller_number, called_number, direction, status
            ) VALUES ($1, $2, $3, $4, $5, $6, 'active')
            RETURNING *
        `, [assistantId, tenantId, callDetails.call_id, callDetails.caller_number, callDetails.called_number, callDetails.direction || 'inbound']);

        return result.rows[0];
    }

    async addConversationTurn(conversationId, turnData) {
        // Get next turn number
        const turnNum = await pool.query(`
            SELECT COALESCE(MAX(turn_number), 0) + 1 as next_turn FROM ai_voice_conversation_turns WHERE conversation_id = $1
        `, [conversationId]);

        const result = await pool.query(`
            INSERT INTO ai_voice_conversation_turns (
                conversation_id, turn_number, user_audio_url, user_transcript, user_transcript_confidence,
                assistant_text, assistant_audio_url, detected_intent, intent_confidence, detected_entities,
                sentiment, stt_latency_ms, llm_latency_ms, tts_latency_ms, total_latency_ms, error_type, error_message
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *
        `, [
            conversationId, turnNum.rows[0].next_turn, turnData.user_audio_url, turnData.user_transcript,
            turnData.user_transcript_confidence, turnData.assistant_text, turnData.assistant_audio_url,
            turnData.detected_intent, turnData.intent_confidence, JSON.stringify(turnData.detected_entities || []),
            turnData.sentiment, turnData.stt_latency_ms, turnData.llm_latency_ms, turnData.tts_latency_ms,
            turnData.total_latency_ms, turnData.error_type, turnData.error_message
        ]);

        return result.rows[0];
    }

    async endConversation(conversationId, outcome, transferDetails = null) {
        const result = await pool.query(`
            UPDATE ai_voice_conversations SET
                status = $2,
                outcome = $3,
                transfer_target = $4,
                transfer_reason = $5,
                ended_at = NOW(),
                duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
            WHERE id = $1 RETURNING *
        `, [
            conversationId,
            transferDetails ? 'transferred' : 'completed',
            outcome,
            transferDetails?.target,
            transferDetails?.reason
        ]);

        // Update analytics
        if (result.rows[0]) {
            await this.updateDailyAnalytics(result.rows[0].tenant_id, result.rows[0].assistant_id);
        }

        return result.rows[0];
    }

    async getConversation(conversationId, tenantId) {
        const conversation = await pool.query(`
            SELECT c.*, a.name as assistant_name
            FROM ai_voice_conversations c
            LEFT JOIN ai_voice_assistants a ON c.assistant_id = a.id
            WHERE c.id = $1 AND c.tenant_id = $2
        `, [conversationId, tenantId]);

        if (!conversation.rows[0]) return null;

        const turns = await pool.query(`
            SELECT * FROM ai_voice_conversation_turns WHERE conversation_id = $1 ORDER BY turn_number
        `, [conversationId]);

        return { ...conversation.rows[0], turns: turns.rows };
    }

    async listConversations(tenantId, filters = {}) {
        let query = `
            SELECT c.*, a.name as assistant_name
            FROM ai_voice_conversations c
            LEFT JOIN ai_voice_assistants a ON c.assistant_id = a.id
            WHERE c.tenant_id = $1
        `;
        const params = [tenantId];

        if (filters.assistant_id) {
            params.push(filters.assistant_id);
            query += ` AND c.assistant_id = $${params.length}`;
        }
        if (filters.status) {
            params.push(filters.status);
            query += ` AND c.status = $${params.length}`;
        }
        if (filters.start_date) {
            params.push(filters.start_date);
            query += ` AND c.started_at >= $${params.length}`;
        }
        if (filters.end_date) {
            params.push(filters.end_date);
            query += ` AND c.started_at <= $${params.length}`;
        }

        query += ' ORDER BY c.started_at DESC';

        if (filters.limit) {
            params.push(filters.limit);
            query += ` LIMIT $${params.length}`;
        }
        if (filters.offset) {
            params.push(filters.offset);
            query += ` OFFSET $${params.length}`;
        }

        const result = await pool.query(query, params);
        return result.rows;
    }

    // ============================================
    // Intent & Entity Management
    // ============================================
    async createIntent(assistantId, tenantId, data) {
        const result = await pool.query(`
            INSERT INTO ai_voice_intents (
                tenant_id, assistant_id, intent_name, display_name, description,
                training_phrases, action_type, action_config, follow_up_intents, output_contexts,
                priority, is_fallback
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [
            tenantId, assistantId, data.intent_name, data.display_name, data.description,
            JSON.stringify(data.training_phrases || []), data.action_type, JSON.stringify(data.action_config || {}),
            JSON.stringify(data.follow_up_intents || []), JSON.stringify(data.output_contexts || []),
            data.priority || 0, data.is_fallback || false
        ]);
        return result.rows[0];
    }

    async listIntents(assistantId) {
        const result = await pool.query(`
            SELECT * FROM ai_voice_intents WHERE assistant_id = $1 AND is_active = true ORDER BY priority DESC, intent_name
        `, [assistantId]);
        return result.rows;
    }

    async createEntity(assistantId, tenantId, data) {
        const result = await pool.query(`
            INSERT INTO ai_voice_entities (
                tenant_id, assistant_id, entity_name, display_name, entity_type,
                values, regex_pattern, components, is_fuzzy_match, is_required
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [
            tenantId, assistantId, data.entity_name, data.display_name, data.entity_type || 'custom',
            JSON.stringify(data.values || []), data.regex_pattern, JSON.stringify(data.components || []),
            data.is_fuzzy_match !== false, data.is_required || false
        ]);
        return result.rows[0];
    }

    async listEntities(assistantId) {
        const result = await pool.query(`
            SELECT * FROM ai_voice_entities WHERE assistant_id = $1 ORDER BY entity_name
        `, [assistantId]);
        return result.rows;
    }

    // ============================================
    // Dialog Flow Nodes
    // ============================================
    async saveDialogNodes(assistantId, nodes) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Delete existing nodes
            await client.query(`DELETE FROM ai_voice_dialog_nodes WHERE assistant_id = $1`, [assistantId]);

            // Insert new nodes
            for (const node of nodes) {
                await client.query(`
                    INSERT INTO ai_voice_dialog_nodes (
                        assistant_id, node_id, node_type, node_name, position_x, position_y,
                        config, prompts, next_node_id, conditional_next, required_intents, required_entities
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                `, [
                    assistantId, node.node_id, node.node_type, node.node_name,
                    node.position_x || 0, node.position_y || 0,
                    JSON.stringify(node.config || {}), JSON.stringify(node.prompts || []),
                    node.next_node_id, JSON.stringify(node.conditional_next || []),
                    JSON.stringify(node.required_intents || []), JSON.stringify(node.required_entities || [])
                ]);
            }

            await client.query('COMMIT');
            return nodes;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async getDialogNodes(assistantId) {
        const result = await pool.query(`
            SELECT * FROM ai_voice_dialog_nodes WHERE assistant_id = $1 ORDER BY node_id
        `, [assistantId]);
        return result.rows;
    }

    // ============================================
    // Prompt Templates
    // ============================================
    async listPromptTemplates(tenantId, category = null) {
        let query = `
            SELECT * FROM ai_voice_prompt_templates
            WHERE (tenant_id = $1 OR is_system = true) AND is_active = true
        `;
        const params = [tenantId];

        if (category) {
            params.push(category);
            query += ` AND template_category = $${params.length}`;
        }

        query += ' ORDER BY is_system DESC, template_name';
        const result = await pool.query(query, params);
        return result.rows;
    }

    async createPromptTemplate(tenantId, data) {
        const result = await pool.query(`
            INSERT INTO ai_voice_prompt_templates (
                tenant_id, template_name, template_category, template_text, variables, language
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [tenantId, data.template_name, data.template_category, data.template_text, JSON.stringify(data.variables || []), data.language || 'en-US']);
        return result.rows[0];
    }

    // ============================================
    // Custom Voices
    // ============================================
    async listCustomVoices(tenantId) {
        const result = await pool.query(`
            SELECT v.*, p.display_name as provider_name
            FROM ai_voice_custom_voices v
            LEFT JOIN ai_voice_providers p ON v.provider_id = p.id
            WHERE v.tenant_id = $1 ORDER BY v.voice_name
        `, [tenantId]);
        return result.rows;
    }

    async createCustomVoice(tenantId, data, userId) {
        const result = await pool.query(`
            INSERT INTO ai_voice_custom_voices (
                tenant_id, voice_name, description, provider_id, training_audio_urls, training_text,
                gender, age_range, accent, style, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [
            tenantId, data.voice_name, data.description, data.provider_id,
            JSON.stringify(data.training_audio_urls || []), data.training_text,
            data.gender, data.age_range, data.accent, data.style, userId
        ]);
        return result.rows[0];
    }

    // ============================================
    // Outbound Campaigns
    // ============================================
    async createOutboundCampaign(tenantId, data, userId) {
        const result = await pool.query(`
            INSERT INTO ai_voice_outbound_campaigns (
                tenant_id, assistant_id, campaign_name, campaign_type, contact_list_id,
                start_date, end_date, calling_hours_start, calling_hours_end, timezone, days_of_week,
                max_concurrent_calls, calls_per_minute, max_attempts, retry_interval_minutes,
                status, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *
        `, [
            tenantId, data.assistant_id, data.campaign_name, data.campaign_type || 'custom',
            data.contact_list_id, data.start_date, data.end_date,
            data.calling_hours_start || '09:00', data.calling_hours_end || '18:00',
            data.timezone || 'UTC', JSON.stringify(data.days_of_week || ['mon', 'tue', 'wed', 'thu', 'fri']),
            data.max_concurrent_calls || 1, data.calls_per_minute || 1.0,
            data.max_attempts || 3, data.retry_interval_minutes || 60,
            data.status || 'draft', userId
        ]);
        return result.rows[0];
    }

    async listOutboundCampaigns(tenantId, filters = {}) {
        let query = `
            SELECT c.*, a.name as assistant_name, cl.name as contact_list_name
            FROM ai_voice_outbound_campaigns c
            LEFT JOIN ai_voice_assistants a ON c.assistant_id = a.id
            LEFT JOIN contact_lists cl ON c.contact_list_id = cl.id
            WHERE c.tenant_id = $1
        `;
        const params = [tenantId];

        if (filters.status) {
            params.push(filters.status);
            query += ` AND c.status = $${params.length}`;
        }

        query += ' ORDER BY c.created_at DESC';
        const result = await pool.query(query, params);
        return result.rows;
    }

    // ============================================
    // Analytics
    // ============================================
    async updateDailyAnalytics(tenantId, assistantId) {
        await pool.query(`
            INSERT INTO ai_voice_analytics_daily (tenant_id, assistant_id, analytics_date, total_conversations)
            SELECT
                $1, $2, CURRENT_DATE, COUNT(*)
            FROM ai_voice_conversations
            WHERE tenant_id = $1 AND assistant_id = $2 AND DATE(started_at) = CURRENT_DATE
            ON CONFLICT (tenant_id, assistant_id, analytics_date) DO UPDATE SET
                total_conversations = EXCLUDED.total_conversations,
                completed_conversations = (
                    SELECT COUNT(*) FROM ai_voice_conversations
                    WHERE tenant_id = $1 AND assistant_id = $2 AND DATE(started_at) = CURRENT_DATE AND status = 'completed'
                ),
                transferred_conversations = (
                    SELECT COUNT(*) FROM ai_voice_conversations
                    WHERE tenant_id = $1 AND assistant_id = $2 AND DATE(started_at) = CURRENT_DATE AND status = 'transferred'
                )
        `, [tenantId, assistantId]);
    }

    async getAnalytics(tenantId, assistantId, startDate, endDate) {
        const result = await pool.query(`
            SELECT * FROM ai_voice_analytics_daily
            WHERE tenant_id = $1 AND assistant_id = $2 AND analytics_date BETWEEN $3 AND $4
            ORDER BY analytics_date
        `, [tenantId, assistantId, startDate, endDate]);
        return result.rows;
    }

    async getUsageSummary(tenantId, startDate, endDate) {
        const result = await pool.query(`
            SELECT
                SUM(tts_characters) as total_tts_characters,
                SUM(stt_seconds) as total_stt_seconds,
                SUM(llm_tokens) as total_llm_tokens,
                SUM(total_calls) as total_calls,
                SUM(successful_calls) as successful_calls,
                SUM(total_cost) as total_cost
            FROM ai_voice_usage
            WHERE tenant_id = $1 AND usage_date BETWEEN $2 AND $3
        `, [tenantId, startDate, endDate]);
        return result.rows[0];
    }
}

export const aiVoiceService = new AIVoiceService();
export default aiVoiceService;

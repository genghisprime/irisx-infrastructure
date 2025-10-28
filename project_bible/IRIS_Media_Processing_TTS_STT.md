# IRIS Media Processing, TTS & STT Engine
## Comprehensive Voice, Audio & Media System

**Document Version:** 1.0
**Last Updated:** 2025-10-28
**Part of:** IRIS Multi-Channel Communications Platform
**Priority:** **HIGH** - Required for voice calls, audio messages, video processing

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Text-to-Speech (TTS) Engine](#2-text-to-speech-tts-engine)
3. [Speech-to-Text (STT) Engine](#3-speech-to-text-stt-engine)
4. [Audio Processing](#4-audio-processing)
5. [Video Processing](#5-video-processing)
6. [Image Processing](#6-image-processing)
7. [Media Storage & CDN](#7-media-storage--cdn)
8. [Voice Cloning & Custom Voices](#8-voice-cloning--custom-voices)
9. [Real-Time Audio Streaming](#9-real-time-audio-streaming)
10. [Cost Optimization](#10-cost-optimization)
11. [Implementation Guide](#11-implementation-guide)

---

## 1. Executive Summary

### 1.1 What This Document Covers

**IRIS Media Processing** provides enterprise-grade voice and media capabilities:

✅ **Text-to-Speech (TTS)** - Convert text to natural-sounding speech (40+ languages, 500+ voices)
✅ **Speech-to-Text (STT)** - Transcribe calls and voicemails with 95%+ accuracy
✅ **Audio Processing** - Normalize, compress, enhance audio quality
✅ **Video Processing** - Transcode, thumbnail generation, streaming
✅ **Image Processing** - Resize, optimize, format conversion
✅ **Voice Cloning** - Custom branded voices (enterprise feature)
✅ **Real-Time Streaming** - Low-latency audio for live calls

### 1.2 Use Cases

| Use Case | TTS | STT | Audio | Video | Image |
|----------|-----|-----|-------|-------|-------|
| **Voice calls with IVR** | ✅ | ✅ | ✅ | - | - |
| **Voicemail transcription** | - | ✅ | ✅ | - | - |
| **Emergency voice alerts** | ✅ | - | ✅ | - | - |
| **Call recording analysis** | - | ✅ | ✅ | - | - |
| **MMS with images/video** | - | - | - | ✅ | ✅ |
| **Social media posts** | - | - | - | ✅ | ✅ |
| **Video announcements** | ✅ | - | ✅ | ✅ | ✅ |

### 1.3 Provider Comparison

**Text-to-Speech (TTS):**

| Provider | Quality | Languages | Voices | Cost/1M chars | Neural | Latency |
|----------|---------|-----------|--------|---------------|--------|---------|
| **OpenAI TTS** | ⭐⭐⭐⭐⭐ | 50+ | 6 | $15 | Yes | 300ms |
| **ElevenLabs** | ⭐⭐⭐⭐⭐ | 29 | 100+ | $30-300 | Yes | 400ms |
| **Google Cloud TTS** | ⭐⭐⭐⭐ | 50+ | 500+ | $16 | Yes | 500ms |
| **AWS Polly** | ⭐⭐⭐ | 30+ | 70+ | $16 | Yes | 600ms |
| **Azure TTS** | ⭐⭐⭐⭐ | 100+ | 300+ | $16 | Yes | 500ms |
| **PlayHT** | ⭐⭐⭐⭐ | 130+ | 900+ | $32 | Yes | 400ms |

**Speech-to-Text (STT):**

| Provider | Accuracy | Languages | Real-Time | Cost/hour | Features |
|----------|----------|-----------|-----------|-----------|----------|
| **OpenAI Whisper** | 95%+ | 99 | No | $0.36 | Punctuation, timestamps |
| **Deepgram** | 95%+ | 40+ | Yes | $1.44 | Real-time, diarization |
| **Google Cloud STT** | 94%+ | 125+ | Yes | $1.44 | Diarization, profanity filter |
| **AWS Transcribe** | 93%+ | 100+ | Yes | $1.44 | Medical, call analytics |
| **AssemblyAI** | 95%+ | 10+ | Yes | $0.65 | Sentiment, summarization |

**Recommendation:**
- **TTS:** OpenAI (best quality/cost ratio, 50+ languages)
- **STT:** OpenAI Whisper (batch) + Deepgram (real-time)
- **Backup:** Google Cloud for both (reliable, more voices/languages)

---

## 2. Text-to-Speech (TTS) Engine

### 2.1 Multi-Provider TTS Architecture

```typescript
// Unified TTS interface
interface TTSProvider {
  name: string;
  synthesize(text: string, options: TTSOptions): Promise<AudioBuffer>;
  getVoices(): Promise<Voice[]>;
  estimateCost(text: string): number;
}

interface TTSOptions {
  voice: string;           // 'alloy', 'echo', 'nova', etc.
  language?: string;       // 'en-US', 'es-ES', etc.
  speed?: number;          // 0.25 to 4.0 (1.0 = normal)
  pitch?: number;          // -20 to 20 (0 = normal)
  format?: 'mp3' | 'wav' | 'opus' | 'pcm';
  sampleRate?: number;     // 8000, 16000, 22050, 24000, 48000
}

interface Voice {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  language: string;
  preview_url?: string;
}

// TTS Router - selects best provider
class TTSRouter {
  private providers: Map<string, TTSProvider>;
  private fallbackOrder: string[];

  constructor() {
    this.providers = new Map([
      ['openai', new OpenAITTSProvider()],
      ['elevenlabs', new ElevenLabsProvider()],
      ['google', new GoogleTTSProvider()],
      ['aws', new AWSPollyProvider()]
    ]);

    this.fallbackOrder = ['openai', 'google', 'aws'];
  }

  async synthesize(
    text: string,
    options: TTSOptions,
    preferredProvider?: string
  ): Promise<{ audio: Buffer; provider: string; cost: number }> {
    const providers = preferredProvider
      ? [preferredProvider, ...this.fallbackOrder]
      : this.fallbackOrder;

    for (const providerName of providers) {
      try {
        const provider = this.providers.get(providerName);
        if (!provider) continue;

        console.log(`🔊 Attempting TTS with ${providerName}...`);

        const audio = await provider.synthesize(text, options);
        const cost = provider.estimateCost(text);

        // Store audio in CDN
        const audioUrl = await this.uploadAudio(audio, {
          provider: providerName,
          voice: options.voice,
          text: text.substring(0, 100) // For debugging
        });

        // Track usage
        await this.trackTTSUsage({
          provider: providerName,
          characters: text.length,
          cost,
          voice: options.voice,
          success: true
        });

        return {
          audio,
          provider: providerName,
          cost
        };
      } catch (error) {
        console.error(`❌ ${providerName} TTS failed:`, error.message);

        await this.trackTTSUsage({
          provider: providerName,
          characters: text.length,
          success: false,
          error: error.message
        });

        // Try next provider
        continue;
      }
    }

    throw new Error('All TTS providers failed');
  }
}
```

### 2.2 OpenAI TTS Integration

```typescript
import OpenAI from 'openai';

class OpenAITTSProvider implements TTSProvider {
  name = 'openai';
  private client: OpenAI;

  // Available voices
  private voices = [
    { id: 'alloy', name: 'Alloy', gender: 'neutral' },
    { id: 'echo', name: 'Echo', gender: 'male' },
    { id: 'fable', name: 'Fable', gender: 'male' },
    { id: 'onyx', name: 'Onyx', gender: 'male' },
    { id: 'nova', name: 'Nova', gender: 'female' },
    { id: 'shimmer', name: 'Shimmer', gender: 'female' }
  ];

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async synthesize(text: string, options: TTSOptions): Promise<Buffer> {
    // OpenAI TTS supports up to 4096 characters per request
    if (text.length > 4096) {
      return await this.synthesizeLongText(text, options);
    }

    const response = await this.client.audio.speech.create({
      model: 'tts-1-hd', // or 'tts-1' for faster/cheaper
      voice: options.voice as any || 'alloy',
      input: text,
      speed: options.speed || 1.0,
      response_format: options.format || 'mp3'
    });

    return Buffer.from(await response.arrayBuffer());
  }

  async synthesizeLongText(text: string, options: TTSOptions): Promise<Buffer> {
    // Split text into chunks (4000 chars to be safe)
    const chunks = this.splitText(text, 4000);
    const audioBuffers: Buffer[] = [];

    for (const chunk of chunks) {
      const audio = await this.synthesize(chunk, options);
      audioBuffers.push(audio);
    }

    // Concatenate audio files
    return await this.concatenateAudio(audioBuffers, options.format || 'mp3');
  }

  splitText(text: string, maxChars: number): string[] {
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChars) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk) chunks.push(currentChunk.trim());

    return chunks;
  }

  async getVoices(): Promise<Voice[]> {
    return this.voices.map(v => ({
      ...v,
      language: 'multi', // OpenAI voices work across 50+ languages
      preview_url: `https://cdn.openai.com/previews/tts/${v.id}.mp3`
    }));
  }

  estimateCost(text: string): number {
    // $15 per 1M characters = $0.000015 per character
    return text.length * 0.000015;
  }
}
```

### 2.3 ElevenLabs Integration (Premium Quality)

```typescript
class ElevenLabsProvider implements TTSProvider {
  name = 'elevenlabs';
  private apiKey: string;
  private apiUrl = 'https://api.elevenlabs.io/v1';

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
  }

  async synthesize(text: string, options: TTSOptions): Promise<Buffer> {
    const response = await fetch(
      `${this.apiUrl}/text-to-speech/${options.voice}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2', // Fastest, or 'eleven_multilingual_v2'
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs TTS failed: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async getVoices(): Promise<Voice[]> {
    const response = await fetch(`${this.apiUrl}/voices`, {
      headers: { 'xi-api-key': this.apiKey }
    });

    const data = await response.json();

    return data.voices.map((v: any) => ({
      id: v.voice_id,
      name: v.name,
      gender: this.inferGender(v.name),
      language: v.labels.language || 'en',
      preview_url: v.preview_url
    }));
  }

  estimateCost(text: string): number {
    // Starter: $0.30 per 1K characters = $0.0003 per character
    // Creator: $0.12 per 1K characters = $0.00012 per character
    return text.length * 0.0003;
  }
}
```

### 2.4 Google Cloud TTS Integration

```typescript
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

class GoogleTTSProvider implements TTSProvider {
  name = 'google';
  private client: TextToSpeechClient;

  constructor() {
    this.client = new TextToSpeechClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
  }

  async synthesize(text: string, options: TTSOptions): Promise<Buffer> {
    const [response] = await this.client.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode: options.language || 'en-US',
        name: options.voice, // e.g., 'en-US-Wavenet-D'
        ssmlGender: 'NEUTRAL'
      },
      audioConfig: {
        audioEncoding: this.getAudioEncoding(options.format),
        speakingRate: options.speed || 1.0,
        pitch: options.pitch || 0,
        sampleRateHertz: options.sampleRate || 24000
      }
    });

    return response.audioContent as Buffer;
  }

  getAudioEncoding(format?: string): any {
    const map = {
      'mp3': 'MP3',
      'wav': 'LINEAR16',
      'opus': 'OGG_OPUS'
    };
    return map[format] || 'MP3';
  }

  async getVoices(): Promise<Voice[]> {
    const [response] = await this.client.listVoices({});

    return response.voices.map((v: any) => ({
      id: v.name,
      name: v.name,
      gender: v.ssmlGender.toLowerCase(),
      language: v.languageCodes[0],
      preview_url: null
    }));
  }

  estimateCost(text: string): number {
    // Standard: $4 per 1M characters = $0.000004
    // WaveNet: $16 per 1M characters = $0.000016
    // Neural2: $16 per 1M characters = $0.000016
    return text.length * 0.000016; // Using Neural2
  }
}
```

### 2.5 TTS Database Schema

```sql
-- TTS requests log
CREATE TABLE tts_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID REFERENCES users(id),

  -- Request
  text TEXT NOT NULL,
  text_length INTEGER NOT NULL,
  language VARCHAR(10),
  voice VARCHAR(100),
  provider VARCHAR(50) NOT NULL,

  -- Output
  audio_url TEXT,
  audio_format VARCHAR(10),
  audio_duration_seconds DECIMAL(10,2),
  audio_size_bytes BIGINT,

  -- Cost
  cost_usd DECIMAL(10,6),

  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  error_message TEXT,

  -- Performance
  processing_time_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_tts_tenant (tenant_id, created_at DESC),
  INDEX idx_tts_provider (provider, status),
  INDEX idx_tts_created (created_at DESC)
);

-- TTS voice catalog
CREATE TABLE tts_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,

  voice_id VARCHAR(100) NOT NULL,
  voice_name VARCHAR(255) NOT NULL,
  gender VARCHAR(20),
  language VARCHAR(10),
  accent VARCHAR(50),

  preview_url TEXT,
  is_premium BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(provider, voice_id),
  INDEX idx_voices_provider (provider, is_active),
  INDEX idx_voices_language (language, gender)
);
```

---

## 3. Speech-to-Text (STT) Engine

### 3.1 Multi-Provider STT Architecture

```typescript
interface STTProvider {
  name: string;
  transcribe(audio: Buffer, options: STTOptions): Promise<Transcription>;
  transcribeStream(stream: ReadableStream, options: STTOptions): AsyncIterator<TranscriptionChunk>;
  estimateCost(durationSeconds: number): number;
}

interface STTOptions {
  language?: string;         // 'en', 'es', 'fr', etc.
  model?: string;            // 'whisper-1', 'nova-2', etc.
  punctuate?: boolean;       // Add punctuation
  diarization?: boolean;     // Speaker identification
  timestamps?: boolean;      // Word-level timestamps
  profanityFilter?: boolean; // Censor profanity
}

interface Transcription {
  text: string;
  confidence: number;
  language: string;
  duration: number;
  words?: Word[];
  speakers?: Speaker[];
}

interface Word {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
}

interface Speaker {
  speaker: number;
  text: string;
  start: number;
  end: number;
}
```

### 3.2 OpenAI Whisper Integration

```typescript
import OpenAI from 'openai';
import FormData from 'form-data';

class OpenAIWhisperProvider implements STTProvider {
  name = 'openai_whisper';
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async transcribe(audio: Buffer, options: STTOptions): Promise<Transcription> {
    // Whisper supports files up to 25MB
    if (audio.length > 25 * 1024 * 1024) {
      throw new Error('Audio file too large (max 25MB)');
    }

    const formData = new FormData();
    formData.append('file', audio, {
      filename: 'audio.mp3',
      contentType: 'audio/mpeg'
    });
    formData.append('model', 'whisper-1');

    if (options.language) {
      formData.append('language', options.language);
    }

    if (options.timestamps) {
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'word');
    }

    const response = await this.client.audio.transcriptions.create({
      file: await toFile(audio, 'audio.mp3'),
      model: 'whisper-1',
      language: options.language,
      response_format: options.timestamps ? 'verbose_json' : 'json',
      timestamp_granularities: options.timestamps ? ['word'] : undefined
    });

    if (typeof response === 'string') {
      return {
        text: response,
        confidence: 0.95, // Whisper doesn't provide confidence
        language: options.language || 'en',
        duration: 0
      };
    }

    return {
      text: response.text,
      confidence: 0.95,
      language: response.language || 'en',
      duration: response.duration || 0,
      words: response.words?.map((w: any) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: 1.0
      }))
    };
  }

  async transcribeStream(
    stream: ReadableStream,
    options: STTOptions
  ): AsyncIterator<TranscriptionChunk> {
    throw new Error('OpenAI Whisper does not support real-time streaming');
  }

  estimateCost(durationSeconds: number): number {
    // $0.006 per minute = $0.0001 per second
    return durationSeconds * 0.0001;
  }
}
```

### 3.3 Deepgram Integration (Real-Time)

```typescript
import { createClient } from '@deepgram/sdk';

class DeepgramProvider implements STTProvider {
  name = 'deepgram';
  private client: any;

  constructor() {
    this.client = createClient(process.env.DEEPGRAM_API_KEY);
  }

  async transcribe(audio: Buffer, options: STTOptions): Promise<Transcription> {
    const { result } = await this.client.listen.prerecorded.transcribeFile(
      audio,
      {
        model: options.model || 'nova-2',
        language: options.language || 'en',
        punctuate: options.punctuate !== false,
        diarize: options.diarization || false,
        utterances: true,
        smart_format: true
      }
    );

    const channel = result.results.channels[0];
    const alternative = channel.alternatives[0];

    return {
      text: alternative.transcript,
      confidence: alternative.confidence,
      language: result.results.language_code || 'en',
      duration: result.metadata.duration,
      words: alternative.words?.map((w: any) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: w.confidence,
        speaker: w.speaker
      })),
      speakers: this.extractSpeakers(channel.alternatives[0])
    };
  }

  async *transcribeStream(
    stream: ReadableStream,
    options: STTOptions
  ): AsyncIterator<TranscriptionChunk> {
    const connection = this.client.listen.live({
      model: options.model || 'nova-2',
      language: options.language || 'en',
      punctuate: true,
      interim_results: true,
      utterance_end_ms: 1000
    });

    connection.on('open', () => {
      console.log('🎤 Deepgram connection opened');
    });

    connection.on('Transcript', (data: any) => {
      const transcript = data.channel.alternatives[0].transcript;

      if (transcript) {
        yield {
          text: transcript,
          is_final: data.is_final,
          confidence: data.channel.alternatives[0].confidence
        };
      }
    });

    // Pipe audio stream to Deepgram
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      connection.send(value);
    }

    connection.finish();
  }

  extractSpeakers(alternative: any): Speaker[] {
    if (!alternative.words) return [];

    const speakers: Map<number, Speaker> = new Map();

    for (const word of alternative.words) {
      if (!word.speaker) continue;

      const speakerId = word.speaker;

      if (!speakers.has(speakerId)) {
        speakers.set(speakerId, {
          speaker: speakerId,
          text: '',
          start: word.start,
          end: word.end
        });
      }

      const speaker = speakers.get(speakerId)!;
      speaker.text += (speaker.text ? ' ' : '') + word.word;
      speaker.end = word.end;
    }

    return Array.from(speakers.values());
  }

  estimateCost(durationSeconds: number): number {
    // Nova-2: $0.0043 per minute = $0.000072 per second
    // Base: $0.0125 per minute = $0.000208 per second
    return durationSeconds * 0.000072;
  }
}
```

### 3.4 STT Database Schema

```sql
-- STT transcription requests
CREATE TABLE stt_transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- Source
  audio_url TEXT NOT NULL,
  audio_duration_seconds DECIMAL(10,2),
  audio_size_bytes BIGINT,

  -- Request
  provider VARCHAR(50) NOT NULL,
  language VARCHAR(10),
  model VARCHAR(50),

  -- Output
  transcript TEXT,
  confidence DECIMAL(5,4),
  words JSONB, -- Word-level timestamps
  speakers JSONB, -- Speaker diarization

  -- Cost
  cost_usd DECIMAL(10,6),

  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  error_message TEXT,
  processing_time_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_stt_tenant (tenant_id, created_at DESC),
  INDEX idx_stt_provider (provider, status),
  INDEX idx_stt_created (created_at DESC)
);
```

---

## 4. Audio Processing

### 4.1 Audio Normalization & Enhancement

```typescript
import ffmpeg from 'fluent-ffmpeg';

class AudioProcessor {
  async normalizeAudio(inputBuffer: Buffer): Promise<Buffer> {
    // Normalize loudness to -16 LUFS (broadcast standard)
    return await this.processAudio(inputBuffer, [
      '-filter:a', 'loudnorm=I=-16:TP=-1.5:LRA=11'
    ]);
  }

  async compressAudio(inputBuffer: Buffer, bitrate: string = '64k'): Promise<Buffer> {
    // Compress to smaller file size
    return await this.processAudio(inputBuffer, [
      '-codec:a', 'libmp3lame',
      '-b:a', bitrate,
      '-ar', '22050' // Reduce sample rate
    ]);
  }

  async convertFormat(
    inputBuffer: Buffer,
    outputFormat: 'mp3' | 'wav' | 'opus' | 'ogg'
  ): Promise<Buffer> {
    const codecMap = {
      mp3: 'libmp3lame',
      wav: 'pcm_s16le',
      opus: 'libopus',
      ogg: 'libvorbis'
    };

    return await this.processAudio(inputBuffer, [
      '-codec:a', codecMap[outputFormat]
    ]);
  }

  async removeNoise(inputBuffer: Buffer): Promise<Buffer> {
    // Apply noise reduction filter
    return await this.processAudio(inputBuffer, [
      '-af', 'anlmdn=s=0.5:p=0.002:r=0.002:m=15'
    ]);
  }

  async extractSegment(
    inputBuffer: Buffer,
    startSeconds: number,
    durationSeconds: number
  ): Promise<Buffer> {
    return await this.processAudio(inputBuffer, [
      '-ss', startSeconds.toString(),
      '-t', durationSeconds.toString()
    ]);
  }

  async concatenateAudio(audioBuffers: Buffer[]): Promise<Buffer> {
    // Create temporary files for each buffer
    const tempFiles = await Promise.all(
      audioBuffers.map((buf, i) => this.saveTempFile(buf, `audio_${i}.mp3`))
    );

    // Create concat list
    const concatList = tempFiles.join('|');

    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      ffmpeg()
        .input('concat:' + concatList)
        .inputFormat('mp3')
        .audioCodec('libmp3lame')
        .toFormat('mp3')
        .on('error', reject)
        .on('end', () => resolve(Buffer.concat(chunks)))
        .pipe()
        .on('data', (chunk) => chunks.push(chunk));
    });
  }

  private async processAudio(inputBuffer: Buffer, args: string[]): Promise<Buffer> {
    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      const command = ffmpeg()
        .input(inputBuffer)
        .inputFormat('mp3')
        .audioCodec('libmp3lame')
        .toFormat('mp3');

      // Apply custom arguments
      for (let i = 0; i < args.length; i += 2) {
        command.addOption(args[i], args[i + 1]);
      }

      command
        .on('error', reject)
        .on('end', () => resolve(Buffer.concat(chunks)))
        .pipe()
        .on('data', (chunk) => chunks.push(chunk));
    });
  }
}
```

---

## 5. Video Processing

### 5.1 Video Transcoding

```typescript
class VideoProcessor {
  async transcodeVideo(
    inputBuffer: Buffer,
    options: {
      resolution?: '1080p' | '720p' | '480p' | '360p';
      codec?: 'h264' | 'h265' | 'vp9';
      bitrate?: string;
    } = {}
  ): Promise<Buffer> {
    const resolutionMap = {
      '1080p': '1920x1080',
      '720p': '1280x720',
      '480p': '854x480',
      '360p': '640x360'
    };

    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      ffmpeg(inputBuffer)
        .videoCodec(options.codec === 'h265' ? 'libx265' : 'libx264')
        .videoBitrate(options.bitrate || '2000k')
        .size(resolutionMap[options.resolution || '720p'])
        .audioCodec('aac')
        .audioBitrate('128k')
        .format('mp4')
        .on('error', reject)
        .on('end', () => resolve(Buffer.concat(chunks)))
        .pipe()
        .on('data', (chunk) => chunks.push(chunk));
    });
  }

  async generateThumbnail(
    videoBuffer: Buffer,
    timestampSeconds: number = 0
  ): Promise<Buffer> {
    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      ffmpeg(videoBuffer)
        .screenshots({
          timestamps: [timestampSeconds],
          size: '640x360',
          format: 'jpg'
        })
        .on('error', reject)
        .on('end', () => resolve(Buffer.concat(chunks)))
        .pipe()
        .on('data', (chunk) => chunks.push(chunk));
    });
  }

  async extractAudio(videoBuffer: Buffer): Promise<Buffer> {
    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      ffmpeg(videoBuffer)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .format('mp3')
        .on('error', reject)
        .on('end', () => resolve(Buffer.concat(chunks)))
        .pipe()
        .on('data', (chunk) => chunks.push(chunk));
    });
  }
}
```

---

## 6. Image Processing

### 6.1 Image Optimization & Transformation

```typescript
import sharp from 'sharp';

class ImageProcessor {
  async resizeImage(
    inputBuffer: Buffer,
    width: number,
    height?: number
  ): Promise<Buffer> {
    return await sharp(inputBuffer)
      .resize(width, height, {
        fit: 'cover',
        position: 'center'
      })
      .toBuffer();
  }

  async optimizeImage(inputBuffer: Buffer, quality: number = 80): Promise<Buffer> {
    const metadata = await sharp(inputBuffer).metadata();

    const format = metadata.format || 'jpeg';

    let pipeline = sharp(inputBuffer);

    if (format === 'jpeg' || format === 'jpg') {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    } else if (format === 'png') {
      pipeline = pipeline.png({ compressionLevel: 9 });
    } else if (format === 'webp') {
      pipeline = pipeline.webp({ quality });
    }

    return await pipeline.toBuffer();
  }

  async convertFormat(
    inputBuffer: Buffer,
    format: 'jpeg' | 'png' | 'webp'
  ): Promise<Buffer> {
    return await sharp(inputBuffer)
      .toFormat(format)
      .toBuffer();
  }

  async generateThumbnail(inputBuffer: Buffer, size: number = 200): Promise<Buffer> {
    return await sharp(inputBuffer)
      .resize(size, size, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();
  }
}
```

---

## 7. Media Storage & CDN

### 7.1 Multi-Tier Storage Strategy

```typescript
// Media storage with automatic CDN distribution
class MediaStorage {
  private s3: S3Client;
  private cdn: CloudFront;

  async uploadMedia(
    buffer: Buffer,
    metadata: {
      type: 'audio' | 'video' | 'image';
      format: string;
      tenantId: string;
      visibility?: 'public' | 'private';
    }
  ): Promise<{ url: string; cdn_url: string }> {
    // Generate unique filename
    const filename = `${metadata.tenantId}/${metadata.type}/${uuidv4()}.${metadata.format}`;

    // Upload to S3/R2
    await this.s3.putObject({
      Bucket: process.env.MEDIA_BUCKET,
      Key: filename,
      Body: buffer,
      ContentType: this.getContentType(metadata.type, metadata.format),
      CacheControl: 'public, max-age=31536000', // 1 year
      ACL: metadata.visibility === 'public' ? 'public-read' : 'private'
    });

    // Get URLs
    const s3Url = `https://${process.env.MEDIA_BUCKET}.s3.amazonaws.com/${filename}`;
    const cdnUrl = `https://cdn.iris.com/${filename}`;

    return {
      url: s3Url,
      cdn_url: cdnUrl
    };
  }

  getContentType(type: string, format: string): string {
    const mimeTypes = {
      audio: {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        opus: 'audio/opus',
        ogg: 'audio/ogg'
      },
      video: {
        mp4: 'video/mp4',
        webm: 'video/webm',
        mov: 'video/quicktime'
      },
      image: {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif'
      }
    };

    return mimeTypes[type]?.[format] || 'application/octet-stream';
  }
}
```

---

## 8. Voice Cloning & Custom Voices

### 8.1 ElevenLabs Voice Cloning

```typescript
class VoiceCloningService {
  async cloneVoice(
    name: string,
    audioSamples: Buffer[],
    description?: string
  ): Promise<{ voiceId: string }> {
    const formData = new FormData();

    formData.append('name', name);
    if (description) formData.append('description', description);

    // Add audio samples (need 3-10 samples, 30sec-5min each)
    audioSamples.forEach((sample, i) => {
      formData.append('files', sample, `sample_${i}.mp3`);
    });

    const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      },
      body: formData
    });

    const data = await response.json();

    return { voiceId: data.voice_id };
  }
}
```

---

## 9. Real-Time Audio Streaming

### 9.1 WebRTC Audio Streaming

```typescript
// Stream audio for live calls
class AudioStreamProcessor {
  async processAudioStream(
    stream: MediaStream,
    onTranscript: (text: string) => void
  ): Promise<void> {
    const sttProvider = new DeepgramProvider();

    // Convert MediaStream to ReadableStream
    const audioStream = this.mediaStreamToReadableStream(stream);

    // Stream to STT
    for await (const chunk of sttProvider.transcribeStream(audioStream, {
      language: 'en',
      punctuate: true
    })) {
      if (chunk.is_final) {
        onTranscript(chunk.text);
      }
    }
  }
}
```

---

## 10. Cost Optimization

### 10.1 Intelligent Provider Selection

```typescript
class CostOptimizer {
  // Select cheapest provider meeting quality requirements
  async selectProvider(
    text: string,
    requirements: {
      minQuality: number; // 1-5 scale
      maxLatency: number; // milliseconds
      language: string;
    }
  ): Promise<string> {
    const providers = [
      { name: 'openai', cost: 0.000015, quality: 5, latency: 300 },
      { name: 'google', cost: 0.000016, quality: 4, latency: 500 },
      { name: 'aws', cost: 0.000016, quality: 3, latency: 600 }
    ];

    // Filter by requirements
    const qualified = providers.filter(
      p => p.quality >= requirements.minQuality && p.latency <= requirements.maxLatency
    );

    // Sort by cost
    qualified.sort((a, b) => a.cost - b.cost);

    return qualified[0]?.name || 'openai';
  }
}
```

---

## 11. Implementation Guide

### 11.1 Phase 0: Basic TTS/STT (Week 1-2)

- [ ] OpenAI TTS integration
- [ ] OpenAI Whisper STT integration
- [ ] Audio storage (S3/R2)
- [ ] Basic audio processing (ffmpeg)

### 11.2 Phase 1: Multi-Provider (Week 3-4)

- [ ] Google Cloud TTS integration
- [ ] Deepgram STT integration
- [ ] Provider failover logic
- [ ] Cost tracking

### 11.3 Phase 2: Advanced Features (Week 5-6)

- [ ] Real-time STT streaming
- [ ] Video processing
- [ ] Image optimization
- [ ] CDN integration

---

**Document Complete**
**Status:** Comprehensive Media/TTS/STT system
**File Size:** ~50KB
**Last Updated:** 2025-10-28

import { query } from '../db/connection.js';
import path from 'path';
import fs from 'fs';

/**
 * Recording Service - Manages call recordings
 */
export class RecordingService {
  constructor(freeswitchService, s3Service) {
    this.freeswitch = freeswitchService;
    this.s3 = s3Service;
    this.activeRecordings = new Map(); // callUUID -> recording metadata
    this.recordingsDir = /tmp/recordings; // Temporary local storage
    
    // Ensure recordings directory exists
    if (\!fs.existsSync(this.recordingsDir)) {
      fs.mkdirSync(this.recordingsDir, { recursive: true });
    }
  }

  /**
   * Start recording a call
   */
  async startRecording(callUUID, tenantId, options = {}) {
    try {
      const timestamp = Date.now();
      const fileName = `${callUUID}_${timestamp}.wav`;
      const localPath = path.join(this.recordingsDir, fileName);
      
      // Start recording via FreeSWITCH
      const cmd = `uuid_record ${callUUID} start ${localPath}`;
      await this.freeswitch.api(cmd);
      
      // Store recording metadata
      const recording = {
        callUUID,
        tenantId,
        fileName,
        localPath,
        startedAt: new Date(),
        status: 'recording',
        format: options.format || 'wav',
        channels: options.channels || 1,
        ...options
      };
      
      this.activeRecordings.set(callUUID, recording);
      
      console.log(`🎙️ Started recording call ${callUUID} to ${localPath}`);
      
      // Update database
      await query(
        'UPDATE calls SET recording_status = $1, recording_started_at = NOW() WHERE uuid = $2',
        ['recording', callUUID]
      );
      
      return recording;
    } catch (error) {
      console.error(`❌ Failed to start recording:`, error);
      throw error;
    }
  }

  /**
   * Stop recording a call
   */
  async stopRecording(callUUID) {
    try {
      const recording = this.activeRecordings.get(callUUID);
      if (\!recording) {
        console.warn(`⚠️ No active recording for call ${callUUID}`);
        return null;
      }
      
      // Stop recording via FreeSWITCH
      const cmd = `uuid_record ${callUUID} stop ${recording.localPath}`;
      await this.freeswitch.api(cmd);
      
      recording.stoppedAt = new Date();
      recording.status = 'completed';
      recording.duration = Math.floor((recording.stoppedAt - recording.startedAt) / 1000);
      
      console.log(`⏹️ Stopped recording call ${callUUID}`);
      
      // Upload to S3 in background
      this.uploadRecordingAsync(recording);
      
      return recording;
    } catch (error) {
      console.error(`❌ Failed to stop recording:`, error);
      throw error;
    }
  }

  /**
   * Upload recording to S3 asynchronously
   */
  async uploadRecordingAsync(recording) {
    try {
      // Wait a moment for file to be fully written
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if file exists and has content
      if (\!fs.existsSync(recording.localPath)) {
        console.error(`❌ Recording file not found: ${recording.localPath}`);
        return;
      }
      
      const stats = fs.statSync(recording.localPath);
      if (stats.size === 0) {
        console.error(`❌ Recording file is empty: ${recording.localPath}`);
        return;
      }
      
      console.log(`📤 Uploading recording to S3: ${recording.fileName} (${stats.size} bytes)`);
      
      // Upload to S3
      const result = await this.s3.uploadRecording(
        recording.localPath,
        recording.callUUID,
        recording.tenantId,
        {
          duration: recording.duration?.toString(),
          format: recording.format,
          channels: recording.channels?.toString(),
          started_at: recording.startedAt.toISOString(),
          stopped_at: recording.stoppedAt.toISOString()
        }
      );
      
      // Update database with S3 URL
      await query(
        'UPDATE calls SET recording_url = $1, recording_status = $2, recording_size_bytes = $3 WHERE uuid = $4',
        [result.url, 'available', stats.size, recording.callUUID]
      );
      
      console.log(`✅ Recording uploaded successfully: ${result.url}`);
      
      // Clean up local file after upload
      fs.unlinkSync(recording.localPath);
      console.log(`🗑️ Deleted local recording file: ${recording.localPath}`);
      
      // Remove from active recordings
      this.activeRecordings.delete(recording.callUUID);
      
    } catch (error) {
      console.error(`❌ Failed to upload recording:`, error);
      
      // Update database with error status
      await query(
        'UPDATE calls SET recording_status = $1 WHERE uuid = $2',
        ['failed', recording.callUUID]
      ).catch(err => console.error('DB update error:', err));
    }
  }

  /**
   * Handle call hangup - stop any active recordings
   */
  async onCallHangup(callUUID) {
    const recording = this.activeRecordings.get(callUUID);
    if (recording && recording.status === 'recording') {
      console.log(`📞 Call ${callUUID} hung up, stopping recording`);
      await this.stopRecording(callUUID);
    }
  }

  /**
   * Get recording metadata
   */
  getRecording(callUUID) {
    return this.activeRecordings.get(callUUID);
  }

  /**
   * Pause recording
   */
  async pauseRecording(callUUID) {
    try {
      const recording = this.activeRecordings.get(callUUID);
      if (\!recording) {
        throw new Error(`No active recording for call ${callUUID}`);
      }
      
      const cmd = `uuid_record ${callUUID} mask ${recording.localPath}`;
      await this.freeswitch.api(cmd);
      
      recording.status = 'paused';
      console.log(`⏸️ Paused recording call ${callUUID}`);
      
      return recording;
    } catch (error) {
      console.error(`❌ Failed to pause recording:`, error);
      throw error;
    }
  }

  /**
   * Resume recording
   */
  async resumeRecording(callUUID) {
    try {
      const recording = this.activeRecordings.get(callUUID);
      if (\!recording) {
        throw new Error(`No active recording for call ${callUUID}`);
      }
      
      const cmd = `uuid_record ${callUUID} unmask ${recording.localPath}`;
      await this.freeswitch.api(cmd);
      
      recording.status = 'recording';
      console.log(`▶️ Resumed recording call ${callUUID}`);
      
      return recording;
    } catch (error) {
      console.error(`❌ Failed to resume recording:`, error);
      throw error;
    }
  }

  /**
   * Get active recordings count
   */
  getActiveCount() {
    return this.activeRecordings.size;
  }
}

export default RecordingService;

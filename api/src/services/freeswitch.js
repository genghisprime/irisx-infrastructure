import pkg from 'modesl';
const { Connection } = pkg;
import { EventEmitter } from 'events';

class FreeSWITCHService extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      host: config.host || '10.0.1.213', // FreeSWITCH private IP
      port: config.port || 8021,
      password: config.password || 'ClueCon',
      ...config
    };
    this.connection = null;
    this.reconnectInterval = 5000;
    this.shouldReconnect = true;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      console.log(`[FreeSWITCH] Connecting to ${this.config.host}:${this.config.port}...`);
      
      this.connection = new Connection(
        this.config.host,
        this.config.port,
        this.config.password
      );

      this.connection.on('error', (error) => {
        console.error('[FreeSWITCH] Connection error:', error);
        this.emit('error', error);
        if (this.shouldReconnect) {
          setTimeout(() => this.connect(), this.reconnectInterval);
        }
      });

      this.connection.on('esl::end', () => {
        console.log('[FreeSWITCH] Connection ended');
        this.emit('disconnect');
        if (this.shouldReconnect) {
          setTimeout(() => this.connect(), this.reconnectInterval);
        }
      });

      this.connection.on('esl::ready', () => {
        console.log('[FreeSWITCH] Connected and authenticated');
        
        // Subscribe to all events
        this.connection.subscribe([
          'CHANNEL_CREATE',
          'CHANNEL_ANSWER',
          'CHANNEL_HANGUP',
          'CHANNEL_STATE',
          'DTMF'
        ]);

        this.emit('ready');
        resolve();
      });

      // Handle incoming events
      this.connection.on('esl::event::**', (event) => {
        this.handleEvent(event);
      });
    });
  }

  handleEvent(event) {
    const eventName = event.getHeader('Event-Name');
    const uuid = event.getHeader('Unique-ID');
    
    console.log(`[FreeSWITCH] Event: ${eventName} - UUID: ${uuid}`);

    switch (eventName) {
      case 'CHANNEL_CREATE':
        this.emit('call:created', {
          uuid,
          direction: event.getHeader('Call-Direction'),
          from: event.getHeader('Caller-Caller-ID-Number'),
          to: event.getHeader('Caller-Destination-Number'),
        });
        break;

      case 'CHANNEL_ANSWER':
        this.emit('call:answered', {
          uuid,
          from: event.getHeader('Caller-Caller-ID-Number'),
          to: event.getHeader('Caller-Destination-Number'),
        });
        break;

      case 'CHANNEL_HANGUP':
        this.emit('call:hungup', {
          uuid,
          cause: event.getHeader('Hangup-Cause'),
          duration: event.getHeader('variable_duration'),
        });
        break;

      case 'DTMF':
        this.emit('call:dtmf', {
          uuid,
          digit: event.getHeader('DTMF-Digit'),
        });
        break;
    }
  }

  // Execute API command
  async api(command) {
    return new Promise((resolve, reject) => {
      if (!this.connection) {
        return reject(new Error('Not connected to FreeSWITCH'));
      }

      this.connection.api(command, (response) => {
        const body = response.getBody();
        resolve(body);
      });
    });
  }

  // Originate an outbound call
  async originate(options) {
    const {
      from,
      to,
      endpoint = 'sofia/internal', // or sofia/external for Twilio
      timeout = 60,
    } = options;

    const command = `originate {${endpoint}/${to} &park()`;
    return await this.api(command);
  }

  // Hangup a call
  async hangup(uuid, cause = 'NORMAL_CLEARING') {
    return await this.api(`uuid_kill ${uuid} ${cause}`);
  }

  // Play audio to a call
  async playback(uuid, file) {
    return await this.api(`uuid_broadcast ${uuid} ${file}`);
  }

  // Disconnect from FreeSWITCH
  disconnect() {
    this.shouldReconnect = false;
    if (this.connection) {
      this.connection.disconnect();
    }
  }
}

export default FreeSWITCHService;

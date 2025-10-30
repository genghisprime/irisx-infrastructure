/**
 * IRISX Node.js SDK
 * Official SDK for IRISX Communications Platform
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// Types
export interface IRISXConfig {
  apiKey?: string;
  token?: string;
  baseURL?: string;
  timeout?: number;
  retry?: {
    enabled: boolean;
    max_retries: number;
    base_delay: number;
    max_delay: number;
  };
  logger?: any;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

export interface Call {
  uuid: string;
  tenant_id: number;
  to: string;
  from: string;
  status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer' | 'canceled';
  direction: 'inbound' | 'outbound';
  duration?: number;
  start_time?: string;
  end_time?: string;
  cost?: number;
  recording_url?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CreateCallRequest {
  to: string;
  from: string;
  webhook_url?: string;
  record?: boolean;
  timeout?: number;
  metadata?: Record<string, any>;
}

export interface SMS {
  id: number;
  tenant_id: number;
  to: string;
  from: string;
  body: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  direction: 'inbound' | 'outbound';
  cost?: number;
  segments: number;
  media_urls?: string[];
  created_at: string;
  updated_at: string;
}

export interface SendSMSRequest {
  to: string;
  from: string;
  body: string;
  media_urls?: string[];
  webhook_url?: string;
}

export interface Email {
  id: number;
  tenant_id: number;
  to: string;
  from: string;
  subject: string;
  body_text?: string;
  body_html?: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'failed';
  opened_at?: string;
  clicked_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Webhook {
  id: number;
  tenant_id: number;
  url: string;
  events: string[];
  enabled: boolean;
  secret: string;
  created_at: string;
  updated_at: string;
}

export interface PhoneNumber {
  id: number;
  tenant_id: number;
  number: string;
  friendly_name?: string;
  country: string;
  type: 'local' | 'toll-free' | 'mobile';
  status: 'active' | 'suspended' | 'released';
  monthly_cost: number;
  webhook_url?: string;
  created_at: string;
}

// Error Classes
export class IRISXError extends Error {
  code: string;
  status?: number;
  details?: any;

  constructor(message: string, code: string, status?: number, details?: any) {
    super(message);
    this.name = 'IRISXError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class RateLimitError extends IRISXError {
  retry_after: number;

  constructor(message: string, retry_after: number) {
    super(message, 'RATE_LIMITED', 429);
    this.name = 'RateLimitError';
    this.retry_after = retry_after;
  }
}

export class ValidationError extends IRISXError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

// Main SDK Class
export default class IRISX {
  private client: AxiosInstance;
  private config: IRISXConfig;

  public calls: CallsResource;
  public sms: SMSResource;
  public email: EmailResource;
  public webhooks: WebhooksResource;
  public phoneNumbers: PhoneNumbersResource;
  public analytics: AnalyticsResource;

  constructor(config: IRISXConfig) {
    this.config = {
      baseURL: config.baseURL || 'https://api.useiris.com',
      timeout: config.timeout || 30000,
      retry: config.retry || {
        enabled: true,
        max_retries: 3,
        base_delay: 1000,
        max_delay: 30000
      },
      ...config
    };

    // Create axios instance
    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: this.getHeaders()
    });

    // Setup interceptors
    this.setupInterceptors();

    // Initialize resources
    this.calls = new CallsResource(this.client);
    this.sms = new SMSResource(this.client);
    this.email = new EmailResource(this.client);
    this.webhooks = new WebhooksResource(this.client);
    this.phoneNumbers = new PhoneNumbersResource(this.client);
    this.analytics = new AnalyticsResource(this.client);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'irisx-sdk-nodejs/1.0.0'
    };

    if (this.config.apiKey) {
      headers['X-API-Key'] = this.config.apiKey;
    } else if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }

    return headers;
  }

  private setupInterceptors() {
    // Response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      async error => {
        if (error.response) {
          const { status, data } = error.response;

          if (status === 429) {
            const retryAfter = parseInt(error.response.headers['x-ratelimit-reset']) || 60;
            throw new RateLimitError(data.message || 'Rate limit exceeded', retryAfter);
          } else if (status === 400) {
            throw new ValidationError(data.message || 'Validation error', data.details);
          } else {
            throw new IRISXError(
              data.message || 'API error',
              data.error || 'UNKNOWN_ERROR',
              status,
              data.details
            );
          }
        }

        throw new IRISXError(error.message, 'NETWORK_ERROR');
      }
    );
  }
}

// Resource Classes
class CallsResource {
  constructor(private client: AxiosInstance) {}

  async create(data: CreateCallRequest): Promise<Call> {
    const response = await this.client.post('/v1/calls', data);
    return response.data.call;
  }

  async get(uuid: string): Promise<Call> {
    const response = await this.client.get(`/v1/calls/${uuid}`);
    return response.data.call;
  }

  async list(params?: any): Promise<{ data: Call[]; pagination: any }> {
    const response = await this.client.get('/v1/calls', { params });
    return {
      data: response.data.calls,
      pagination: response.data.pagination
    };
  }

  async update(uuid: string, data: any): Promise<Call> {
    const response = await this.client.patch(`/v1/calls/${uuid}`, data);
    return response.data.call;
  }
}

class SMSResource {
  constructor(private client: AxiosInstance) {}

  async send(data: SendSMSRequest): Promise<SMS> {
    const response = await this.client.post('/v1/sms/send', data);
    return response.data.message;
  }

  async sendBulk(data: any): Promise<any> {
    const response = await this.client.post('/v1/sms/send-bulk', data);
    return response.data;
  }

  async list(params?: any): Promise<{ data: SMS[]; pagination: any }> {
    const response = await this.client.get('/v1/sms', { params });
    return {
      data: response.data.messages,
      pagination: response.data.pagination
    };
  }

  async get(id: number): Promise<SMS> {
    const response = await this.client.get(`/v1/sms/${id}`);
    return response.data.message;
  }

  async createTemplate(data: any): Promise<any> {
    const response = await this.client.post('/v1/sms/templates', data);
    return response.data.template;
  }

  async sendTemplate(data: any): Promise<SMS> {
    const response = await this.client.post('/v1/sms/send-template', data);
    return response.data.message;
  }
}

class EmailResource {
  constructor(private client: AxiosInstance) {}

  async send(data: any): Promise<Email> {
    const response = await this.client.post('/v1/email/send', data);
    return response.data.email;
  }

  async list(params?: any): Promise<{ data: Email[]; pagination: any }> {
    const response = await this.client.get('/v1/email', { params });
    return {
      data: response.data.emails,
      pagination: response.data.pagination
    };
  }

  async get(id: number): Promise<Email> {
    const response = await this.client.get(`/v1/email/${id}`);
    return response.data.email;
  }
}

class WebhooksResource {
  constructor(private client: AxiosInstance) {}

  async create(data: any): Promise<Webhook> {
    const response = await this.client.post('/v1/webhooks/endpoints', data);
    return response.data.webhook;
  }

  async list(): Promise<Webhook[]> {
    const response = await this.client.get('/v1/webhooks/endpoints');
    return response.data.webhooks;
  }

  async get(id: number): Promise<Webhook> {
    const response = await this.client.get(`/v1/webhooks/endpoints/${id}`);
    return response.data.webhook;
  }

  async delete(id: number): Promise<void> {
    await this.client.delete(`/v1/webhooks/endpoints/${id}`);
  }

  async test(id: number): Promise<any> {
    const response = await this.client.post(`/v1/webhooks/endpoints/${id}/test`);
    return response.data;
  }
}

class PhoneNumbersResource {
  constructor(private client: AxiosInstance) {}

  async search(params: any): Promise<PhoneNumber[]> {
    const response = await this.client.get('/v1/phone-numbers/search', { params });
    return response.data.numbers;
  }

  async purchase(data: any): Promise<PhoneNumber> {
    const response = await this.client.post('/v1/phone-numbers/purchase', data);
    return response.data.number;
  }

  async list(params?: any): Promise<PhoneNumber[]> {
    const response = await this.client.get('/v1/phone-numbers', { params });
    return response.data.numbers;
  }

  async get(id: number): Promise<PhoneNumber> {
    const response = await this.client.get(`/v1/phone-numbers/${id}`);
    return response.data.number;
  }

  async update(id: number, data: any): Promise<PhoneNumber> {
    const response = await this.client.put(`/v1/phone-numbers/${id}`, data);
    return response.data.number;
  }

  async release(id: number): Promise<void> {
    await this.client.delete(`/v1/phone-numbers/${id}`);
  }
}

class AnalyticsResource {
  constructor(private client: AxiosInstance) {}

  async dashboard(params?: any): Promise<any> {
    const response = await this.client.get('/v1/analytics/dashboard', { params });
    return response.data;
  }

  async calls(params?: any): Promise<any> {
    const response = await this.client.get('/v1/analytics/calls', { params });
    return response.data;
  }

  async sms(params?: any): Promise<any> {
    const response = await this.client.get('/v1/analytics/sms', { params });
    return response.data;
  }
}

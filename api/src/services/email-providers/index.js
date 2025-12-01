/**
 * Email Provider Factory
 * Dynamically instantiates the correct email provider based on configuration
 */

import { ElasticEmailProvider } from './elastic-email.js';
import { SendGridProvider } from './sendgrid.js';
import { CustomSMTPProvider } from './custom-smtp.js';
import { AmazonSESProvider } from './amazon-ses.js';

/**
 * Create an email provider instance based on provider name
 */
export function createEmailProvider(providerName, credentials) {
  const providers = {
    'elastic-email': ElasticEmailProvider,
    'elasticemail': ElasticEmailProvider,
    'sendgrid': SendGridProvider,
    'twilio-sendgrid': SendGridProvider,
    'custom-smtp': CustomSMTPProvider,
    'smtp': CustomSMTPProvider,
    'amazon-ses': AmazonSESProvider,
    'aws-ses': AmazonSESProvider,
    'ses': AmazonSESProvider
  };

  const ProviderClass = providers[providerName.toLowerCase()];

  if (!ProviderClass) {
    throw new Error(`Unknown email provider: ${providerName}`);
  }

  return new ProviderClass(credentials);
}

export {
  ElasticEmailProvider,
  SendGridProvider,
  CustomSMTPProvider,
  AmazonSESProvider
};

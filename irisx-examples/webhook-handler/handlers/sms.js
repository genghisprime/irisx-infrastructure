/**
 * SMS Event Handlers
 *
 * Processes all SMS-related webhook events from IRISX.
 */

/**
 * Handle sms.sent event
 * Called when an SMS is sent from your system
 */
export async function handleSmsSent(data, req) {
  try {
    const { message_id, from_number, to_number, message, segments, tenant_id } = data;

    console.log(`📤 SMS sent: ${message_id}`);
    console.log(`   From: ${from_number}`);
    console.log(`   To: ${to_number}`);
    console.log(`   Segments: ${segments}`);

    // Your business logic here:
    // - Update message status in database
    // - Update analytics
    // - Log for billing
    // - Send notification to user

    // Example: Update database
    // await db.sms.create({
    //   message_id,
    //   from_number,
    //   to_number,
    //   message,
    //   segments,
    //   tenant_id,
    //   status: 'sent',
    //   sent_at: new Date()
    // });

    // Example: Update analytics
    // await db.analytics.incrementSmsCount(tenant_id, {
    //   status: 'sent',
    //   segments
    // });

  } catch (error) {
    console.error('❌ Error handling sms.sent:', error);
  }
}

/**
 * Handle sms.delivered event
 * Called when an SMS is delivered to the recipient
 */
export async function handleSmsDelivered(data, req) {
  try {
    const { message_id, from_number, to_number, delivered_at } = data;

    console.log(`✅ SMS delivered: ${message_id}`);
    console.log(`   To: ${to_number}`);

    // Your business logic here:
    // - Update delivery status
    // - Calculate delivery time
    // - Update success metrics
    // - Trigger follow-up actions

    // Example: Update message status
    // await db.sms.update(message_id, {
    //   status: 'delivered',
    //   delivered_at: new Date(delivered_at)
    // });

    // Example: Update campaign metrics
    // const message = await db.sms.findById(message_id);
    // if (message.campaign_id) {
    //   await db.campaigns.incrementDelivered(message.campaign_id);
    // }

    // Example: Trigger follow-up
    // if (message.trigger_on_delivery) {
    //   await triggerFollowUpAction(message);
    // }

  } catch (error) {
    console.error('❌ Error handling sms.delivered:', error);
  }
}

/**
 * Handle sms.failed event
 * Called when an SMS fails to deliver
 */
export async function handleSmsFailed(data, req) {
  try {
    const { message_id, from_number, to_number, error_code, error_message } = data;

    console.error(`❌ SMS failed: ${message_id}`);
    console.error(`   To: ${to_number}`);
    console.error(`   Error: ${error_code} - ${error_message}`);

    // Your business logic here:
    // - Update failure status
    // - Log error details
    // - Check if retry needed
    // - Send alerts
    // - Update contact status (invalid number?)

    // Example: Update message status
    // await db.sms.update(message_id, {
    //   status: 'failed',
    //   failed_at: new Date(),
    //   error_code,
    //   error_message
    // });

    // Example: Handle invalid numbers
    // if (error_code === 'INVALID_NUMBER') {
    //   await db.contacts.markInvalid(to_number, {
    //     reason: error_message
    //   });
    // }

    // Example: Retry logic
    // if (shouldRetrySms(error_code)) {
    //   await retrySms(message_id, {
    //     delay_minutes: 5,
    //     use_fallback_provider: true
    //   });
    // }

    // Example: Send alert for high failure rate
    // const recentFailures = await db.sms.countRecentFailures(1); // last hour
    // if (recentFailures > 100) {
    //   await sendAlert({
    //     severity: 'high',
    //     message: `High SMS failure rate: ${recentFailures} in last hour`
    //   });
    // }

  } catch (error) {
    console.error('❌ Error handling sms.failed:', error);
  }
}

/**
 * Handle sms.received event
 * Called when an incoming SMS is received
 */
export async function handleSmsReceived(data, req) {
  try {
    const { message_id, from_number, to_number, message, media_urls = [] } = data;

    console.log(`📥 SMS received: ${message_id}`);
    console.log(`   From: ${from_number}`);
    console.log(`   To: ${to_number}`);
    console.log(`   Message: ${message}`);

    // Your business logic here:
    // - Store incoming message
    // - Process keywords (STOP, HELP, etc.)
    // - Auto-reply if configured
    // - Create support ticket
    // - Notify relevant users
    // - Process commands

    // Example: Store message
    // await db.sms.create({
    //   message_id,
    //   from_number,
    //   to_number,
    //   message,
    //   media_urls,
    //   direction: 'inbound',
    //   received_at: new Date()
    // });

    // Example: Process STOP keyword
    // if (message.toUpperCase().trim() === 'STOP') {
    //   await db.contacts.optOut(from_number, {
    //     method: 'sms',
    //     opted_out_at: new Date()
    //   });
    //
    //   await sendAutoReply(to_number, from_number,
    //     'You have been unsubscribed. Reply START to re-subscribe.'
    //   );
    //   return;
    // }

    // Example: Process HELP keyword
    // if (message.toUpperCase().trim() === 'HELP') {
    //   await sendAutoReply(to_number, from_number,
    //     'For help, contact support@example.com or call 1-800-555-0100'
    //   );
    //   return;
    // }

    // Example: Auto-reply based on business hours
    // const isBusinessHours = checkBusinessHours();
    // if (!isBusinessHours) {
    //   await sendAutoReply(to_number, from_number,
    //     'Thanks for your message. Our team will respond during business hours (9AM-5PM EST).'
    //   );
    // }

    // Example: Create support ticket
    // await createSupportTicket({
    //   from: from_number,
    //   message,
    //   channel: 'sms',
    //   priority: detectPriority(message)
    // });

    // Example: Notify relevant users
    // const department = getDepartmentByNumber(to_number);
    // await notifyDepartment(department, {
    //   type: 'new_sms',
    //   from: from_number,
    //   message
    // });

  } catch (error) {
    console.error('❌ Error handling sms.received:', error);
  }
}

/**
 * Helper: Determine if SMS should be retried
 */
function shouldRetrySms(errorCode) {
  const retryableErrors = [
    'CARRIER_TIMEOUT',
    'TEMPORARY_FAILURE',
    'NETWORK_ERROR'
  ];

  return retryableErrors.includes(errorCode);
}

/**
 * Helper: Detect message priority
 */
function detectPriority(message) {
  const urgentKeywords = ['urgent', 'emergency', 'asap', 'critical', 'immediately'];
  const lowercaseMessage = message.toLowerCase();

  const isUrgent = urgentKeywords.some(keyword => lowercaseMessage.includes(keyword));

  return isUrgent ? 'high' : 'normal';
}

/**
 * Helper: Check if current time is within business hours
 */
function checkBusinessHours() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday

  // Business hours: Monday-Friday, 9AM-5PM
  const isWeekday = day >= 1 && day <= 5;
  const isBusinessHour = hour >= 9 && hour < 17;

  return isWeekday && isBusinessHour;
}

export default {
  handleSmsSent,
  handleSmsDelivered,
  handleSmsFailed,
  handleSmsReceived
};

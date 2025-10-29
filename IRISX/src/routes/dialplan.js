import { Hono } from 'hono';
import CallsService from '../services/calls.js';
import { query } from '../db/connection.js';

const app = new Hono();

/**
 * FreeSWITCH Dialplan Routes
 * These endpoints are called by FreeSWITCH to handle inbound/outbound calls
 * and retrieve dynamic routing information
 */

/**
 * POST /v1/dialplan/inbound
 * Handle inbound call routing from FreeSWITCH
 *
 * Called when an inbound call arrives from a carrier
 * Returns XML dialplan instructions to FreeSWITCH
 */
app.post('/inbound', async (c) => {
  try {
    const {
      uuid,
      from_number,
      to_number,
      gateway,
      sip_network_ip,
    } = await c.req.json();

    console.log(`[Dialplan] Inbound call: ${from_number} → ${to_number} (UUID: ${uuid})`);

    // Look up DID assignment in database
    const didResult = await query(`
      SELECT
        pn.id as phone_number_id,
        pn.tenant_id,
        pn.phone_number,
        pn.forward_to_number,
        pn.ivr_menu_id,
        pn.queue_id,
        t.name as tenant_name
      FROM phone_numbers pn
      JOIN tenants t ON t.id = pn.tenant_id
      WHERE pn.phone_number = $1
        AND pn.status = 'active'
    `, [to_number]);

    if (didResult.rows.length === 0) {
      console.log(`[Dialplan] No DID found for ${to_number}`);
      return c.xml(`<?xml version="1.0" encoding="UTF-8"?>
<document type="freeswitch/xml">
  <section name="dialplan">
    <context name="public">
      <extension name="no_did_found">
        <condition field="destination_number" expression="${to_number}">
          <action application="answer"/>
          <action application="playback" data="ivr/ivr-number_not_in_service.wav"/>
          <action application="hangup" data="NO_ROUTE_DESTINATION"/>
        </condition>
      </extension>
    </context>
  </section>
</document>`);
    }

    const did = didResult.rows[0];

    // Create call record
    await query(`
      INSERT INTO calls (
        uuid, tenant_id, direction, from_number, to_number,
        status, phone_number_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      uuid,
      did.tenant_id,
      'inbound',
      from_number,
      to_number,
      'ringing',
      did.phone_number_id,
    ]);

    // Build routing action
    let routingAction = '';

    if (did.ivr_menu_id) {
      // Route to IVR menu
      routingAction = `<action application="lua" data="ivr_handler.lua ${did.ivr_menu_id}"/>`;
    } else if (did.queue_id) {
      // Route to queue
      routingAction = `<action application="fifo" data="${did.queue_id}@default in"/>`;
    } else if (did.forward_to_number) {
      // Forward to number
      routingAction = `<action application="bridge" data="sofia/gateway/twilio/${did.forward_to_number}"/>`;
    } else {
      // Default: voicemail
      routingAction = `<action application="voicemail" data="default $\{domain} ${did.phone_number}"/>`;
    }

    // Return XML dialplan
    return c.xml(`<?xml version="1.0" encoding="UTF-8"?>
<document type="freeswitch/xml">
  <section name="dialplan">
    <context name="public">
      <extension name="inbound_${did.tenant_id}">
        <condition field="destination_number" expression="^${to_number}$">
          <action application="set" data="tenant_id=${did.tenant_id}"/>
          <action application="set" data="tenant_name=${did.tenant_name}"/>
          <action application="set" data="phone_number_id=${did.phone_number_id}"/>
          <action application="set" data="hangup_after_bridge=true"/>
          <action application="set" data="continue_on_fail=true"/>
          <action application="answer"/>
          ${routingAction}
          <action application="hangup"/>
        </condition>
      </extension>
    </context>
  </section>
</document>`);
  } catch (error) {
    console.error('[Dialplan] Inbound error:', error);
    return c.xml(`<?xml version="1.0" encoding="UTF-8"?>
<document type="freeswitch/xml">
  <section name="dialplan">
    <context name="public">
      <extension name="error">
        <condition>
          <action application="answer"/>
          <action application="playback" data="ivr/ivr-call_cannot_be_completed.wav"/>
          <action application="hangup" data="NORMAL_TEMPORARY_FAILURE"/>
        </condition>
      </extension>
    </context>
  </section>
</document>`);
  }
});

/**
 * POST /v1/dialplan/outbound
 * Handle outbound call routing from FreeSWITCH
 *
 * Called when an outbound call is being placed
 * Returns carrier gateway to use for the call
 */
app.post('/outbound', async (c) => {
  try {
    const {
      uuid,
      from_number,
      to_number,
      tenant_id,
    } = await c.req.json();

    console.log(`[Dialplan] Outbound call: ${from_number} → ${to_number} (UUID: ${uuid}, Tenant: ${tenant_id})`);

    // Get call from database to find carrier
    const callResult = await query(`
      SELECT
        c.*,
        car.name as carrier_name,
        car.type as carrier_type,
        car.sip_domain,
        car.sip_proxy
      FROM calls c
      LEFT JOIN carriers car ON car.id = c.carrier_id
      WHERE c.uuid = $1
    `, [uuid]);

    if (callResult.rows.length === 0) {
      console.log(`[Dialplan] Call ${uuid} not found in database`);
      return c.json({
        success: false,
        error: 'Call not found',
      }, 404);
    }

    const call = callResult.rows[0];

    // Build gateway string
    let gateway;
    if (call.carrier_type === 'twilio') {
      gateway = 'twilio';
    } else if (call.carrier_type === 'telnyx') {
      gateway = 'telnyx';
    } else if (call.carrier_type === 'bandwidth') {
      gateway = 'bandwidth';
    } else {
      gateway = call.carrier_name.toLowerCase();
    }

    // Return routing information
    return c.json({
      success: true,
      data: {
        uuid,
        gateway,
        destination: to_number,
        caller_id: from_number,
        carrier: {
          id: call.carrier_id,
          name: call.carrier_name,
          type: call.carrier_type,
          rate: call.carrier_rate,
        },
        dialstring: `sofia/gateway/${gateway}/${to_number}`,
      },
    });
  } catch (error) {
    console.error('[Dialplan] Outbound error:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to route outbound call',
    }, 500);
  }
});

/**
 * POST /v1/dialplan/event
 * Handle FreeSWITCH call events (CDRs)
 *
 * Called by FreeSWITCH when call events occur
 * Updates call records in database
 */
app.post('/event', async (c) => {
  try {
    const {
      event_type,
      uuid,
      direction,
      from_number,
      to_number,
      answered_at,
      ended_at,
      duration_seconds,
      billsec,
      hangup_cause,
      carrier_id,
    } = await c.req.json();

    console.log(`[Dialplan] Event: ${event_type} for call ${uuid}`);

    if (event_type === 'CHANNEL_ANSWER') {
      // Call was answered
      await CallsService.updateCallStatus(uuid, 'in-progress', {
        answered_at: new Date(),
      });
    } else if (event_type === 'CHANNEL_HANGUP' || event_type === 'CHANNEL_HANGUP_COMPLETE') {
      // Call ended
      if (billsec > 0) {
        // Call was answered, complete it
        await CallsService.completeCall(uuid, billsec, hangup_cause);
      } else {
        // Call was never answered
        const status = hangup_cause === 'NO_ANSWER' ? 'no-answer' :
                       hangup_cause === 'USER_BUSY' ? 'busy' : 'failed';

        await CallsService.updateCallStatus(uuid, status, {
          ended_at: new Date(),
          hangup_cause,
        });

        // Update carrier health (failure if not answered)
        if (carrier_id) {
          const carrierRouting = await import('../services/carrierRouting.js');
          await carrierRouting.default.updateCarrierHealth(carrier_id, false);
        }
      }
    } else if (event_type === 'CHANNEL_PROGRESS') {
      // Call is ringing
      await CallsService.updateCallStatus(uuid, 'ringing');
    }

    return c.json({
      success: true,
      message: 'Event processed',
    });
  } catch (error) {
    console.error('[Dialplan] Event processing error:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to process event',
    }, 500);
  }
});

/**
 * GET /v1/dialplan/lookup/:number
 * Lookup phone number routing information
 *
 * Used for testing and debugging DID routing
 */
app.get('/lookup/:number', async (c) => {
  try {
    const number = c.req.param('number');

    const result = await query(`
      SELECT
        pn.id,
        pn.tenant_id,
        pn.phone_number,
        pn.forward_to_number,
        pn.ivr_menu_id,
        pn.queue_id,
        pn.status,
        t.name as tenant_name,
        im.name as ivr_menu_name,
        q.name as queue_name
      FROM phone_numbers pn
      JOIN tenants t ON t.id = pn.tenant_id
      LEFT JOIN ivr_menus im ON im.id = pn.ivr_menu_id
      LEFT JOIN queues q ON q.id = pn.queue_id
      WHERE pn.phone_number = $1
    `, [number]);

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Phone number not found',
      }, 404);
    }

    const did = result.rows[0];

    let routing_type = 'unknown';
    if (did.ivr_menu_id) routing_type = 'ivr';
    else if (did.queue_id) routing_type = 'queue';
    else if (did.forward_to_number) routing_type = 'forward';

    return c.json({
      success: true,
      data: {
        ...did,
        routing_type,
      },
    });
  } catch (error) {
    console.error('[Dialplan] Lookup error:', error);
    return c.json({
      success: false,
      error: 'Failed to lookup phone number',
    }, 500);
  }
});

export default app;

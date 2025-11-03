import { Hono } from 'hono';

const dialplan = new Hono();

/**
 * Dynamic Dialplan Endpoint
 * FreeSWITCH calls this to get instructions for how to handle a call
 */
dialplan.post('/', async (c) => {
  try {
    // Parse FreeSWITCH request
    const body = await c.req.text();
    const params = new URLSearchParams(body);
    
    // Extract call details
    const callData = {
      uuid: params.get('Unique-ID'),
      direction: params.get('Call-Direction'),
      from: params.get('Caller-Caller-ID-Number'),
      to: params.get('Caller-Destination-Number'),
      network: params.get('variable_network_addr'),
      sipProfile: params.get('variable_sofia_profile_name')
    };

    console.log('📞 Dialplan request:', callData);

    // Generate dynamic dialplan XML based on destination number
    const dialplanXml = generateDialplan(callData);

    return c.text(dialplanXml, 200, {
      'Content-Type': 'text/xml'
    });
  } catch (error) {
    console.error('Dialplan error:', error);
    
    // Return error dialplan (play error message and hangup)
    return c.text(`<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<document type="freeswitch/xml">
  <section name="dialplan" description="Dynamic Dialplan">
    <context name="public">
      <extension name="error">
        <condition>
          <action application="answer"/>
          <action application="playback" data="ivr/ivr-call_cannot_be_completed_as_dialed.wav"/>
          <action application="hangup"/>
        </condition>
      </extension>
    </context>
  </section>
</document>`, 200, {
      'Content-Type': 'text/xml'
    });
  }
});

/**
 * Generate dialplan XML based on call data
 */
function generateDialplan(callData) {
  const { to, from, uuid } = callData;
  
  // Route based on destination number
  // Example: Different handling for different numbers
  
  let actions = [];
  
  // Check if this is a call to our main number
  if (to === '+18326378414') {
    // Main IVR
    actions = [
      '<action application="answer"/>',
      '<action application="sleep" data="500"/>',
      '<action application="playback" data="ivr/ivr-welcome.wav"/>',
      '<action application="sleep" data="500"/>',
      '<action application="playback" data="ivr/ivr-this_is_the_telephone_company.wav"/>',
      '<action application="sleep" data="500"/>',
      '<action application="playback" data="ivr/ivr-thank_you_for_calling.wav"/>',
      '<action application="hangup"/>'
    ];
  } else {
    // Default: Simple greeting
    actions = [
      '<action application="answer"/>',
      '<action application="sleep" data="500"/>',
      '<action application="playback" data="ivr/ivr-welcome_to_freeswitch.wav"/>',
      '<action application="hangup"/>'
    ];
  }
  
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<document type="freeswitch/xml">
  <section name="dialplan" description="Dynamic Dialplan from API">
    <context name="public">
      <extension name="api_dialplan">
        <condition field="destination_number" expression="^(.*)$">
          ${actions.join('\n          ')}
        </condition>
      </extension>
    </context>
  </section>
</document>`;
}

/**
 * Health check for dialplan service
 */
dialplan.get('/health', (c) => {
  return c.json({
    service: 'dialplan',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

export default dialplan;

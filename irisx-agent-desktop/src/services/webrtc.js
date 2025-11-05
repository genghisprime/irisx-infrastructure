/**
 * WebRTC Service - SIP.js Integration for Agent Desktop
 * Handles browser-based SIP calling via FreeSWITCH WebSocket
 */

import { UserAgent, Registerer, Inviter, SessionState } from 'sip.js'

class WebRTCService {
  constructor() {
    this.userAgent = null
    this.registerer = null
    this.currentSession = null
    this.isRegistered = false
    this.isTransportConnected = false
    this.remoteAudio = null
    this.autoConfig = null

    // Event callbacks
    this.onRegistered = null
    this.onUnregistered = null
    this.onIncomingCall = null
    this.onCallStateChange = null
    this.onCallEnded = null
    this.onTransportConnected = null

    // AUTO-LOAD SIP credentials from localStorage (set by auth store)
    this.loadAutoConfig()
  }

  /**
   * Load SIP config from localStorage if available
   * This is set by auth.js when user logs in
   */
  loadAutoConfig() {
    try {
      const saved = localStorage.getItem('sip_config')
      if (saved) {
        this.autoConfig = JSON.parse(saved)
        console.log('✅ SIP config loaded from localStorage:', this.autoConfig.extension)
      }
    } catch (err) {
      console.warn('⚠️ Failed to load SIP config:', err)
      this.autoConfig = null
    }
  }

  /**
   * Check if auto-config is available
   */
  hasAutoConfig() {
    return !!this.autoConfig
  }

  /**
   * Get auto-config for display (without password)
   */
  getAutoConfigInfo() {
    if (!this.autoConfig) return null
    return {
      extension: this.autoConfig.extension,
      server: this.autoConfig.server
    }
  }

  /**
   * Initialize and connect to FreeSWITCH via WebSocket
   * @param {Object} config - SIP configuration (optional if autoConfig loaded)
   * @param {string} config.sipUsername - SIP username (e.g., "1000")
   * @param {string} config.sipPassword - SIP password
   * @param {string} config.sipServer - FreeSWITCH server (e.g., "54.160.220.243")
   * @param {string} config.displayName - Agent display name
   */
  async connect(config = null) {
    try {
      // Use auto-config if no config provided
      if (!config && this.autoConfig) {
        console.log('📱 Using auto-config from localStorage')
        // Extract server hostname from websocket URL (wss://server:port -> server)
        const serverMatch = this.autoConfig.server.match(/\/\/([^:]+)/)
        const sipServer = serverMatch ? serverMatch[1] : this.autoConfig.server

        config = {
          sipUsername: this.autoConfig.extension,
          sipPassword: this.autoConfig.password,
          sipServer: sipServer,
          displayName: `Extension ${this.autoConfig.extension}`
        }
      }

      if (!config) {
        throw new Error('No SIP configuration provided and no auto-config available')
      }

      const { sipUsername, sipPassword, sipServer, displayName } = config

      // Create remote audio element for incoming audio
      if (!this.remoteAudio) {
        this.remoteAudio = document.createElement('audio')
        this.remoteAudio.autoplay = true
        this.remoteAudio.style.display = 'none'
        document.body.appendChild(this.remoteAudio)
      }

      // SIP URI configuration
      const uri = UserAgent.makeURI(`sip:${sipUsername}@${sipServer}`)
      if (!uri) {
        throw new Error('Failed to create SIP URI')
      }

      // Use WSS/WS depending on page protocol
      // When HTTPS, use api.tazzi.com/ws which proxies to FreeSWITCH
      // When HTTP (dev), connect directly to FreeSWITCH server
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsServer = window.location.protocol === 'https:'
        ? 'api.tazzi.com/ws'
        : `${sipServer}:8066`

      const transportOptions = {
        server: `${protocol}//${wsServer}`,
        // Nginx proxies to FreeSWITCH port 5066 internally
      }

      console.log('🔌 Connecting to WebSocket:', transportOptions.server)

      // UserAgent configuration
      const userAgentOptions = {
        uri,
        transportOptions,
        authorizationUsername: sipUsername,
        authorizationPassword: sipPassword,
        displayName: displayName || `Agent ${sipUsername}`,
        sessionDescriptionHandlerFactoryOptions: {
          constraints: {
            audio: true,
            video: false
          },
          peerConnectionConfiguration: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' }
            ]
          }
        },
        delegate: {
          onConnect: () => {
            console.log('🔌 Transport connected')
            this.isTransportConnected = true
            this.onTransportConnected?.()
          },
          onDisconnect: (error) => {
            console.log('⚠️ Transport disconnected:', error)
            this.isTransportConnected = false
          },
          onInvite: (invitation) => {
            console.log('📞 Incoming call from:', invitation.remoteIdentity.uri.user)
            this.handleIncomingCall(invitation)
          }
        }
      }

      // Create UserAgent
      this.userAgent = new UserAgent(userAgentOptions)

      // Create Registerer
      this.registerer = new Registerer(this.userAgent)

      // Set up registration state change handler
      this.registerer.stateChange.addListener((newState) => {
        console.log('Registration state:', newState)
        if (newState === 'Registered') {
          this.isRegistered = true
          this.onRegistered?.()
        } else if (newState === 'Unregistered') {
          this.isRegistered = false
          this.onUnregistered?.()
        }
      })

      // Start UserAgent
      await this.userAgent.start()
      console.log('✅ SIP UserAgent started')

      // Register with FreeSWITCH
      await this.registerer.register()
      console.log('✅ Registering with FreeSWITCH...')

      return { success: true }
    } catch (error) {
      console.error('❌ WebRTC connection error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Make an outbound call
   * @param {string} phoneNumber - Phone number to call (E.164 format)
   */
  async makeCall(phoneNumber) {
    if (!this.userAgent) {
      throw new Error('UserAgent not initialized')
    }

    // Check if transport is connected using UserAgent.isConnected property
    if (!this.userAgent.isConnected()) {
      throw new Error('Transport not connected - please wait and try again')
    }

    if (!this.isRegistered) {
      throw new Error('Not registered with SIP server')
    }

    try {
      const target = UserAgent.makeURI(`sip:${phoneNumber}@${this.userAgent.configuration.uri.normal.host}`)
      if (!target) {
        throw new Error('Failed to create target URI')
      }

      console.log('📞 Transport connected, making call to:', phoneNumber)

      const inviterOptions = {
        sessionDescriptionHandlerOptions: {
          constraints: {
            audio: true,
            video: false
          }
        },
        // Increase INVITE timeout to 60 seconds (default is 32 seconds)
        requestDelegate: {
          onReject: (response) => {
            console.error('❌ Call rejected:', response.message.statusCode, response.message.reasonPhrase)
          }
        }
      }

      const inviter = new Inviter(this.userAgent, target, inviterOptions)
      this.currentSession = inviter

      // Set up session state change handler
      inviter.stateChange.addListener((newState) => {
        console.log('Call state:', newState)
        this.onCallStateChange?.(newState)

        if (newState === SessionState.Established) {
          this.setupRemoteAudio(inviter)
        } else if (newState === SessionState.Terminated) {
          this.onCallEnded?.()
          this.currentSession = null
        }
      })

      // Send INVITE
      await inviter.invite()
      console.log('📞 Calling:', phoneNumber)

      return { success: true, session: inviter }
    } catch (error) {
      console.error('❌ Call error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Answer an incoming call
   */
  async answerCall() {
    if (!this.currentSession) {
      throw new Error('No incoming call to answer')
    }

    try {
      const options = {
        sessionDescriptionHandlerOptions: {
          constraints: {
            audio: true,
            video: false
          }
        }
      }

      await this.currentSession.accept(options)
      this.setupRemoteAudio(this.currentSession)
      console.log('✅ Call answered')

      return { success: true }
    } catch (error) {
      console.error('❌ Answer error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Hang up current call
   */
  async hangup() {
    if (!this.currentSession) {
      return { success: true }
    }

    try {
      switch (this.currentSession.state) {
        case SessionState.Initial:
        case SessionState.Establishing:
          if (this.currentSession instanceof Inviter) {
            await this.currentSession.cancel()
          } else {
            await this.currentSession.reject()
          }
          break
        case SessionState.Established:
          await this.currentSession.bye()
          break
      }

      this.currentSession = null
      console.log('✅ Call hung up')

      return { success: true }
    } catch (error) {
      console.error('❌ Hangup error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Mute/unmute microphone
   */
  async toggleMute() {
    if (!this.currentSession) {
      return { success: false, error: 'No active call' }
    }

    try {
      const sessionDescriptionHandler = this.currentSession.sessionDescriptionHandler
      const senderTracks = sessionDescriptionHandler.peerConnection
        .getSenders()
        .filter(sender => sender.track && sender.track.kind === 'audio')

      senderTracks.forEach(sender => {
        sender.track.enabled = !sender.track.enabled
      })

      const isMuted = !senderTracks[0]?.track?.enabled
      console.log(isMuted ? '🔇 Muted' : '🔊 Unmuted')

      return { success: true, muted: isMuted }
    } catch (error) {
      console.error('❌ Mute error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Hold/unhold call
   */
  async toggleHold() {
    if (!this.currentSession) {
      return { success: false, error: 'No active call' }
    }

    try {
      const sessionDescriptionHandler = this.currentSession.sessionDescriptionHandler

      if (this.currentSession.isOnHold) {
        await sessionDescriptionHandler.unhold()
        console.log('▶️ Call resumed')
      } else {
        await sessionDescriptionHandler.hold()
        console.log('⏸️ Call on hold')
      }

      return { success: true, onHold: this.currentSession.isOnHold }
    } catch (error) {
      console.error('❌ Hold error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Transfer call to another number
   * @param {string} targetNumber - Number to transfer to
   */
  async transfer(targetNumber) {
    if (!this.currentSession) {
      return { success: false, error: 'No active call' }
    }

    try {
      const target = UserAgent.makeURI(`sip:${targetNumber}@${this.userAgent.configuration.uri.normal.host}`)
      if (!target) {
        throw new Error('Failed to create target URI')
      }
      await this.currentSession.refer(target)
      console.log('📞 Transferring to:', targetNumber)

      return { success: true }
    } catch (error) {
      console.error('❌ Transfer error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Send DTMF tone
   * @param {string} tone - DTMF tone (0-9, *, #, A-D)
   */
  async sendDTMF(tone) {
    if (!this.currentSession || this.currentSession.state !== SessionState.Established) {
      return { success: false, error: 'No active call' }
    }

    try {
      await this.currentSession.sessionDescriptionHandler.sendDtmf(tone)
      console.log('📞 DTMF:', tone)

      return { success: true }
    } catch (error) {
      console.error('❌ DTMF error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Handle incoming call invitation
   */
  handleIncomingCall(invitation) {
    this.currentSession = invitation

    // Set up session state change handler
    invitation.stateChange.addListener((newState) => {
      console.log('Incoming call state:', newState)
      this.onCallStateChange?.(newState)

      if (newState === SessionState.Established) {
        this.setupRemoteAudio(invitation)
      } else if (newState === SessionState.Terminated) {
        this.onCallEnded?.()
        this.currentSession = null
      }
    })

    // Notify application of incoming call
    this.onIncomingCall?.({
      from: invitation.remoteIdentity.uri.user,
      displayName: invitation.remoteIdentity.displayName,
      session: invitation
    })
  }

  /**
   * Set up remote audio stream
   */
  setupRemoteAudio(session) {
    const sessionDescriptionHandler = session.sessionDescriptionHandler
    const remoteStream = new MediaStream()

    sessionDescriptionHandler.peerConnection.getReceivers().forEach((receiver) => {
      if (receiver.track) {
        remoteStream.addTrack(receiver.track)
      }
    })

    this.remoteAudio.srcObject = remoteStream
    this.remoteAudio.play().catch(e => console.error('Audio play error:', e))
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect() {
    try {
      if (this.currentSession) {
        await this.hangup()
      }

      if (this.registerer) {
        await this.registerer.unregister()
      }

      if (this.userAgent) {
        await this.userAgent.stop()
      }

      if (this.remoteAudio) {
        this.remoteAudio.srcObject = null
        this.remoteAudio.remove()
        this.remoteAudio = null
      }

      console.log('✅ WebRTC disconnected')

      return { success: true }
    } catch (error) {
      console.error('❌ Disconnect error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Get registration status
   */
  getRegistrationStatus() {
    return {
      isRegistered: this.isRegistered,
      hasActiveCall: !!this.currentSession,
      callState: this.currentSession?.state || null
    }
  }
}

// Export the class (not singleton) so each component can have its own instance
export default WebRTCService

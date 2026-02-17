<template>
  <div style="display: flex; min-height: 100vh; background-color: #f3f4f6;">
    <!-- Sidebar -->
    <aside style="position: fixed; top: 0; left: 0; bottom: 0; width: 256px; background-color: white; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1); display: flex; flex-direction: column; z-index: 40;">
      <!-- Logo -->
      <div style="display: flex; align-items: center; justify-content: center; height: 64px; padding: 0 16px; background-color: #4f46e5;">
        <h1 style="font-size: 24px; font-weight: bold; color: white;">Tazzi</h1>
      </div>

      <!-- Navigation -->
      <nav style="flex: 1; overflow-y: auto; padding: 20px 8px 80px 8px;">
        <!-- Dashboard -->
        <router-link
          to="/dashboard"
          style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;"
          :style="isActive('/dashboard') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'"
        >
          <HomeIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
          Dashboard
        </router-link>

        <!-- Communications Section -->
        <div style="padding-top: 16px;">
          <h3 style="padding: 0 8px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Communications</h3>

          <router-link to="/dashboard/conversations" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/conversations') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <ChatBubbleLeftRightIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/conversations') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Conversations
          </router-link>

          <router-link to="/dashboard/call-logs" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/call-logs') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <PhoneIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/call-logs') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Call Logs
          </router-link>

          <router-link to="/dashboard/messages" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/messages') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <ChatBubbleBottomCenterTextIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/messages') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            SMS Messages
          </router-link>

          <router-link to="/dashboard/whatsapp" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/whatsapp') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <DevicePhoneMobileIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/whatsapp') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            WhatsApp
          </router-link>

          <router-link to="/dashboard/social" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/social') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <GlobeAltIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/social') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Social Media
          </router-link>
        </div>

        <!-- Email Section -->
        <div style="padding-top: 16px;">
          <h3 style="padding: 0 8px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Email</h3>
          <router-link to="/dashboard/emails" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/emails') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <EnvelopeIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/emails') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Emails
          </router-link>
          <router-link to="/dashboard/email-templates" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/email-templates') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <DocumentTextIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/email-templates') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Email Templates
          </router-link>
          <router-link to="/dashboard/email-campaign-builder" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/email-campaign-builder') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <PencilSquareIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/email-campaign-builder') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Email Builder
          </router-link>
          <router-link to="/dashboard/email-analytics" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/email-analytics') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <ChartBarIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/email-analytics') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Email Analytics
          </router-link>
          <router-link to="/dashboard/email-automation" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/email-automation') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <BoltIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/email-automation') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Email Automation
          </router-link>
          <router-link to="/dashboard/email-deliverability" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/email-deliverability') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <CheckBadgeIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/email-deliverability') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Deliverability
          </router-link>
          <router-link to="/dashboard/email-template-library" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/email-template-library') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <DocumentTextIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/email-template-library') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Template Library
          </router-link>
        </div>

        <!-- Contacts & Campaigns -->
        <div style="padding-top: 16px;">
          <h3 style="padding: 0 8px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Contacts & Campaigns</h3>
          <router-link to="/dashboard/contacts" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/contacts') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <UsersIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/contacts') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Contacts
          </router-link>
          <router-link to="/dashboard/lists" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/lists') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <ListBulletIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/lists') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Lists
          </router-link>
          <router-link to="/dashboard/campaigns" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/campaigns') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <MegaphoneIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/campaigns') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Campaign Management
          </router-link>
        </div>

        <!-- Team & Operations -->
        <div style="padding-top: 16px;">
          <h3 style="padding: 0 8px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Team & Operations</h3>
          <router-link to="/dashboard/agents" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/agents') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <UserGroupIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/agents') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Agent Management
          </router-link>
          <router-link to="/dashboard/agent-performance" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/agent-performance') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <TrophyIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/agent-performance') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Agent Performance
          </router-link>
          <router-link to="/dashboard/queues" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/queues') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <QueueListIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/queues') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Queue Management
          </router-link>
        </div>

        <!-- Analytics -->
        <div style="padding-top: 16px;">
          <h3 style="padding: 0 8px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Analytics</h3>
          <router-link to="/dashboard/analytics" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/analytics') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <ChartPieIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/analytics') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Advanced Analytics
          </router-link>
          <router-link to="/dashboard/unified-analytics" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/unified-analytics') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <CircleStackIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/unified-analytics') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Unified Analytics
          </router-link>
        </div>

        <!-- Chat & Support -->
        <div style="padding-top: 16px;">
          <h3 style="padding: 0 8px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Chat & Support</h3>
          <router-link to="/dashboard/chat-inbox" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/chat-inbox') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <InboxIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/chat-inbox') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Chat Inbox
          </router-link>
          <router-link to="/dashboard/chat-settings" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/chat-settings') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <AdjustmentsHorizontalIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/chat-settings') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Chat Settings
          </router-link>
        </div>

        <!-- Advanced Features -->
        <div style="padding-top: 16px;">
          <h3 style="padding: 0 8px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Advanced Features</h3>
          <router-link to="/business-messaging" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/business-messaging') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <DevicePhoneMobileIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/business-messaging') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Business Messaging
          </router-link>
          <router-link to="/video" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/video') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <VideoCameraIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/video') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Video Calling
          </router-link>
          <router-link to="/voice" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/voice') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <SpeakerWaveIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/voice') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Voice Assistants
          </router-link>
          <router-link to="/ivr" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/ivr') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <PhoneArrowUpRightIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/ivr') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            IVR Builder
          </router-link>
          <router-link to="/scripts" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/scripts') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <DocumentTextIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/scripts') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Agent Scripts
          </router-link>
          <router-link to="/amd" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/amd') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <ComputerDesktopIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/amd') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            AMD Settings
          </router-link>
          <router-link to="/translation" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/translation') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <LanguageIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/translation') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Translation
          </router-link>
        </div>

        <!-- Compliance & Security -->
        <div style="padding-top: 16px;">
          <h3 style="padding: 0 8px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Compliance & Security</h3>
          <router-link to="/stir-shaken" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/stir-shaken') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <ShieldCheckIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/stir-shaken') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            STIR/SHAKEN
          </router-link>
          <router-link to="/quality" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/quality') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <ClipboardDocumentCheckIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/quality') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Quality Management
          </router-link>
          <router-link to="/sso" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/sso') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <LockClosedIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/sso') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            SSO Settings
          </router-link>
        </div>

        <!-- Settings & API -->
        <div style="padding-top: 16px;">
          <h3 style="padding: 0 8px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Settings & API</h3>
          <router-link to="/dashboard/webhooks" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/webhooks') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <ArrowPathIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/webhooks') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Webhooks
          </router-link>
          <router-link to="/dashboard/webhook-config" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/webhook-config') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <WrenchScrewdriverIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/webhook-config') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Webhook Config
          </router-link>
          <router-link to="/dashboard/recordings" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/recordings') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <MicrophoneIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/recordings') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Call Recordings
          </router-link>
          <router-link to="/dashboard/usage" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/usage') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <ArrowTrendingUpIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/usage') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Usage
          </router-link>
          <router-link to="/dashboard/billing-history" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/billing-history') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <CreditCardIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/billing-history') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Billing History
          </router-link>
          <router-link to="/dashboard/data-import" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/data-import') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <ArrowUpTrayIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/data-import') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            Import Data
          </router-link>
          <router-link to="/dashboard/api-keys" style="display: flex; align-items: center; padding: 8px; font-size: 14px; font-weight: 500; border-radius: 6px; margin-bottom: 4px; text-decoration: none;" :style="isActive('/dashboard/api-keys') ? 'background-color: #e0e7ff; color: #4f46e5;' : 'color: #374151;'">
            <KeyIcon style="width: 20px; height: 20px; margin-right: 12px; flex-shrink: 0;" :style="isActive('/dashboard/api-keys') ? 'color: #4f46e5;' : 'color: #9ca3af;'" />
            API Keys
          </router-link>
        </div>
      </nav>

      <!-- User Menu -->
      <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 16px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; min-width: 0; flex: 1;">
            <UserCircleIcon style="width: 32px; height: 32px; color: #9ca3af; flex-shrink: 0;" />
            <div style="margin-left: 12px; min-width: 0; flex: 1;">
              <p style="font-size: 13px; font-weight: 500; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ authStore.user?.email || 'User' }}</p>
            </div>
          </div>
          <button @click="handleLogout" style="margin-left: 8px; padding: 4px 8px; border: none; font-size: 11px; font-weight: 500; border-radius: 4px; color: #4f46e5; background-color: #e0e7ff; cursor: pointer; flex-shrink: 0;">Logout</button>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <div style="margin-left: 256px; flex: 1;">
      <!-- Top Header Bar -->
      <div style="background-color: white; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);">
        <div style="padding: 16px 32px;">
          <h1 style="font-size: 24px; font-weight: 600; color: #111827;">{{ pageTitle }}</h1>
        </div>
      </div>

      <!-- Page Content -->
      <main style="padding: 24px 32px;">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import {
  HomeIcon,
  ChatBubbleLeftRightIcon,
  PhoneIcon,
  ChatBubbleBottomCenterTextIcon,
  DevicePhoneMobileIcon,
  GlobeAltIcon,
  EnvelopeIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  ChartBarIcon,
  BoltIcon,
  CheckBadgeIcon,
  UsersIcon,
  ListBulletIcon,
  MegaphoneIcon,
  PresentationChartLineIcon,
  UserGroupIcon,
  UserCircleIcon,
  TrophyIcon,
  QueueListIcon,
  Cog6ToothIcon,
  ChartPieIcon,
  PresentationChartBarIcon,
  CircleStackIcon,
  InboxIcon,
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  WrenchScrewdriverIcon,
  MicrophoneIcon,
  ArrowTrendingUpIcon,
  CreditCardIcon,
  ArrowUpTrayIcon,
  KeyIcon,
  VideoCameraIcon,
  SpeakerWaveIcon,
  PhoneArrowUpRightIcon,
  ComputerDesktopIcon,
  LanguageIcon,
  ShieldCheckIcon,
  ClipboardDocumentCheckIcon,
  LockClosedIcon
} from '@heroicons/vue/24/outline'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

function isActive(path) {
  if (path === '/dashboard') {
    return route.path === '/dashboard'
  }
  return route.path.startsWith(path)
}

const pageTitle = computed(() => {
  const path = route.path
  const titles = {
    '/dashboard': 'Dashboard',
    '/dashboard/conversations': 'Conversations',
    '/dashboard/call-logs': 'Call Logs',
    '/dashboard/messages': 'SMS Messages',
    '/dashboard/whatsapp': 'WhatsApp',
    '/dashboard/social': 'Social Media',
    '/dashboard/emails': 'Emails',
    '/dashboard/email-templates': 'Email Templates',
    '/dashboard/email-campaign-builder': 'Email Builder',
    '/dashboard/email-analytics': 'Email Analytics',
    '/dashboard/email-automation': 'Email Automation',
    '/dashboard/email-deliverability': 'Email Deliverability',
    '/dashboard/email-template-library': 'Email Template Library',
    '/dashboard/contacts': 'Contacts',
    '/dashboard/lists': 'Contact Lists',
    '/dashboard/campaigns': 'Campaign Management',
    '/dashboard/agents': 'Agent Management',
    '/dashboard/agent-performance': 'Agent Performance',
    '/dashboard/queues': 'Queue Management',
    '/dashboard/analytics': 'Advanced Analytics',
    '/dashboard/unified-analytics': 'Unified Analytics',
    '/dashboard/chat-inbox': 'Chat Inbox',
    '/dashboard/chat-settings': 'Chat Settings',
    '/dashboard/webhooks': 'Webhooks',
    '/dashboard/webhook-config': 'Webhook Configuration',
    '/dashboard/recordings': 'Call Recordings',
    '/dashboard/usage': 'Usage Dashboard',
    '/dashboard/billing-history': 'Billing History',
    '/dashboard/data-import': 'Import Data',
    '/dashboard/api-keys': 'API Keys',
    '/dashboard/email-template-library': 'Email Template Library'
  }
  return titles[path] || 'Dashboard'
})

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}
</script>

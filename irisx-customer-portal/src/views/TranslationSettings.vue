<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Translation Services</h1>
        <p class="text-gray-500 mt-1">Configure real-time language translation across all channels</p>
      </div>
      <div class="flex items-center space-x-3">
        <span class="text-sm text-gray-500">Translation Services</span>
        <label class="relative inline-flex items-center cursor-pointer">
          <input v-model="settings.translation_enabled" type="checkbox" @change="saveSettings" class="sr-only peer" />
          <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>
    </div>

    <!-- Tabs -->
    <div class="bg-white rounded-lg shadow mb-6">
      <div class="border-b border-gray-200">
        <nav class="flex -mb-px">
          <button
            @click="activeTab = 'channels'"
            :class="activeTab === 'channels' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Channel Settings
          </button>
          <button
            @click="activeTab = 'voice'"
            :class="activeTab === 'voice' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Voice Translation
          </button>
          <button
            @click="activeTab = 'glossary'"
            :class="activeTab === 'glossary' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Glossary
          </button>
          <button
            @click="activeTab = 'usage'"
            :class="activeTab === 'usage' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Usage & Cost
          </button>
        </nav>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <svg class="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <div v-else>
      <!-- Disabled Banner -->
      <div v-if="!settings.translation_enabled" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <div class="flex">
          <svg class="h-5 w-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
          <p class="ml-3 text-sm text-yellow-700">
            Translation services are currently disabled. Enable them using the toggle above to start translating messages across channels.
          </p>
        </div>
      </div>

      <!-- Channel Settings Tab -->
      <div v-if="activeTab === 'channels'" class="space-y-6">
        <!-- Default Settings -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Default Settings</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Company Default Language</label>
              <select v-model="settings.default_language" @change="saveSettings" class="w-full px-3 py-2 border rounded-md">
                <option v-for="lang in commonLanguages" :key="lang.code" :value="lang.code">
                  {{ lang.flag }} {{ lang.name }}
                </option>
              </select>
              <p class="text-xs text-gray-500 mt-1">Agent default language for outbound messages</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Auto-Detect Language</label>
              <label class="relative inline-flex items-center cursor-pointer mt-2">
                <input v-model="settings.auto_detect" type="checkbox" @change="saveSettings" class="sr-only peer" />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                <span class="ml-3 text-sm text-gray-600">Automatically detect customer language</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Per-Channel Settings -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Channel Configuration</h2>
          <div class="space-y-4">
            <!-- SMS -->
            <div class="border rounded-lg p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center">
                  <span class="text-2xl mr-3">📱</span>
                  <div>
                    <h3 class="font-medium">SMS</h3>
                    <p class="text-sm text-gray-500">Text message translation</p>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input v-model="settings.channel_settings.sms.enabled" type="checkbox" @change="saveSettings" class="sr-only peer" />
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div v-if="settings.channel_settings.sms.enabled" class="flex space-x-6 text-sm">
                <label class="flex items-center">
                  <input v-model="settings.channel_settings.sms.auto_translate_inbound" type="checkbox" @change="saveSettings" class="mr-2" />
                  Translate inbound messages
                </label>
                <label class="flex items-center">
                  <input v-model="settings.channel_settings.sms.auto_translate_outbound" type="checkbox" @change="saveSettings" class="mr-2" />
                  Translate outbound messages
                </label>
              </div>
            </div>

            <!-- Chat -->
            <div class="border rounded-lg p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center">
                  <span class="text-2xl mr-3">💬</span>
                  <div>
                    <h3 class="font-medium">Chat</h3>
                    <p class="text-sm text-gray-500">Live chat and web chat translation</p>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input v-model="settings.channel_settings.chat.enabled" type="checkbox" @change="saveSettings" class="sr-only peer" />
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div v-if="settings.channel_settings.chat.enabled" class="flex space-x-6 text-sm">
                <label class="flex items-center">
                  <input v-model="settings.channel_settings.chat.auto_translate_inbound" type="checkbox" @change="saveSettings" class="mr-2" />
                  Translate inbound messages
                </label>
                <label class="flex items-center">
                  <input v-model="settings.channel_settings.chat.auto_translate_outbound" type="checkbox" @change="saveSettings" class="mr-2" />
                  Translate outbound messages
                </label>
              </div>
            </div>

            <!-- Email -->
            <div class="border rounded-lg p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center">
                  <span class="text-2xl mr-3">📧</span>
                  <div>
                    <h3 class="font-medium">Email</h3>
                    <p class="text-sm text-gray-500">Email subject and body translation</p>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input v-model="settings.channel_settings.email.enabled" type="checkbox" @change="saveSettings" class="sr-only peer" />
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div v-if="settings.channel_settings.email.enabled" class="flex space-x-6 text-sm">
                <label class="flex items-center">
                  <input v-model="settings.channel_settings.email.auto_translate_inbound" type="checkbox" @change="saveSettings" class="mr-2" />
                  Translate inbound emails
                </label>
                <label class="flex items-center">
                  <input v-model="settings.channel_settings.email.auto_translate_outbound" type="checkbox" @change="saveSettings" class="mr-2" />
                  Translate outbound emails
                </label>
              </div>
            </div>

            <!-- WhatsApp -->
            <div class="border rounded-lg p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center">
                  <span class="text-2xl mr-3">🟢</span>
                  <div>
                    <h3 class="font-medium">WhatsApp</h3>
                    <p class="text-sm text-gray-500">WhatsApp message translation</p>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input v-model="settings.channel_settings.whatsapp.enabled" type="checkbox" @change="saveSettings" class="sr-only peer" />
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div v-if="settings.channel_settings.whatsapp.enabled" class="flex space-x-6 text-sm">
                <label class="flex items-center">
                  <input v-model="settings.channel_settings.whatsapp.auto_translate_inbound" type="checkbox" @change="saveSettings" class="mr-2" />
                  Translate inbound messages
                </label>
                <label class="flex items-center">
                  <input v-model="settings.channel_settings.whatsapp.auto_translate_outbound" type="checkbox" @change="saveSettings" class="mr-2" />
                  Translate outbound messages
                </label>
              </div>
            </div>

            <!-- Social Media -->
            <div class="border rounded-lg p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center">
                  <span class="text-2xl mr-3">📣</span>
                  <div>
                    <h3 class="font-medium">Social Media</h3>
                    <p class="text-sm text-gray-500">Facebook, Instagram, Twitter DM translation</p>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input v-model="settings.channel_settings.social.enabled" type="checkbox" @change="saveSettings" class="sr-only peer" />
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div v-if="settings.channel_settings.social.enabled" class="flex space-x-6 text-sm">
                <label class="flex items-center">
                  <input v-model="settings.channel_settings.social.auto_translate_inbound" type="checkbox" @change="saveSettings" class="mr-2" />
                  Translate inbound messages
                </label>
                <label class="flex items-center">
                  <input v-model="settings.channel_settings.social.auto_translate_outbound" type="checkbox" @change="saveSettings" class="mr-2" />
                  Translate outbound messages
                </label>
              </div>
            </div>

            <!-- Voice -->
            <div class="border rounded-lg p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center">
                  <span class="text-2xl mr-3">📞</span>
                  <div>
                    <h3 class="font-medium">Voice Calls</h3>
                    <p class="text-sm text-gray-500">Real-time voice translation (STT → Translate → TTS)</p>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input v-model="settings.channel_settings.voice.enabled" type="checkbox" @change="saveSettings" class="sr-only peer" />
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div v-if="settings.channel_settings.voice.enabled" class="text-sm">
                <label class="flex items-center">
                  <input v-model="settings.channel_settings.voice.real_time_translation" type="checkbox" @change="saveSettings" class="mr-2" />
                  Enable real-time translation (higher latency)
                </label>
                <p class="text-xs text-gray-500 mt-2">Note: Voice translation uses Speech-to-Text, Translation, and Text-to-Speech services. This may add latency to calls.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Voice Translation Tab -->
      <div v-if="activeTab === 'voice'" class="space-y-6">
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Voice Translation Settings</h2>
          <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Speech-to-Text Provider</label>
                <select v-model="settings.voice_settings.stt_provider" @change="saveSettings" class="w-full px-3 py-2 border rounded-md">
                  <option value="google">Google Cloud Speech</option>
                  <option value="aws">Amazon Transcribe</option>
                  <option value="azure">Azure Speech</option>
                  <option value="deepgram">Deepgram</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Text-to-Speech Provider</label>
                <select v-model="settings.voice_settings.tts_provider" @change="saveSettings" class="w-full px-3 py-2 border rounded-md">
                  <option value="openai">OpenAI TTS</option>
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="google">Google Cloud TTS</option>
                  <option value="aws_polly">Amazon Polly</option>
                </select>
              </div>
            </div>

            <div class="border-t pt-4 mt-4">
              <label class="flex items-center">
                <input v-model="settings.voice_settings.real_time_enabled" type="checkbox" @change="saveSettings" class="mr-2" />
                <span class="font-medium">Enable Real-Time Translation</span>
              </label>
              <p class="text-sm text-gray-500 mt-1 ml-6">Translates speech in real-time during calls. May add 1-3 seconds latency.</p>
            </div>

            <div class="border-t pt-4">
              <label class="flex items-center">
                <input v-model="settings.voice_settings.transcript_translation" type="checkbox" @change="saveSettings" class="mr-2" />
                <span class="font-medium">Translate Call Transcripts</span>
              </label>
              <p class="text-sm text-gray-500 mt-1 ml-6">Translate transcripts to agent language for review after the call.</p>
            </div>
          </div>
        </div>

        <!-- Voice Translation Info -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 class="font-medium text-blue-800 mb-2">How Voice Translation Works</h3>
          <div class="text-sm text-blue-700 space-y-2">
            <p>1. <strong>Customer speaks:</strong> Speech is captured and converted to text (STT)</p>
            <p>2. <strong>Translation:</strong> Text is translated to agent's language</p>
            <p>3. <strong>Agent hears:</strong> Translated text is converted to speech (TTS)</p>
            <p>4. <strong>Agent speaks:</strong> Process reverses for customer to hear</p>
          </div>
        </div>
      </div>

      <!-- Glossary Tab -->
      <div v-if="activeTab === 'glossary'" class="space-y-6">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-lg font-semibold">Custom Glossary</h2>
              <p class="text-sm text-gray-500">Define custom translations for brand names, products, and terminology</p>
            </div>
            <button @click="showAddTermModal = true" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
              + Add Term
            </button>
          </div>

          <div v-if="glossaryTerms.length === 0" class="text-center py-8 text-gray-500">
            <p>No custom terms defined yet</p>
            <p class="text-sm mt-1">Add terms to ensure consistent translation of your brand names and technical terms</p>
          </div>

          <div v-else class="overflow-x-auto">
            <table class="min-w-full">
              <thead>
                <tr class="text-left text-xs text-gray-500 uppercase border-b">
                  <th class="pb-3">Source Term</th>
                  <th class="pb-3">Language</th>
                  <th class="pb-3">Target Term</th>
                  <th class="pb-3">Language</th>
                  <th class="pb-3">Category</th>
                  <th class="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody class="text-sm">
                <tr v-for="term in glossaryTerms" :key="term.id" class="border-b">
                  <td class="py-3 font-medium">{{ term.source_term }}</td>
                  <td class="py-3">{{ term.source_language }}</td>
                  <td class="py-3 font-medium">{{ term.target_term }}</td>
                  <td class="py-3">{{ term.target_language }}</td>
                  <td class="py-3">
                    <span class="px-2 py-1 text-xs rounded-full bg-gray-100">{{ term.category || 'General' }}</span>
                  </td>
                  <td class="py-3">
                    <button @click="deleteTerm(term)" class="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Usage & Cost Tab -->
      <div v-if="activeTab === 'usage'" class="space-y-6">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div class="bg-white rounded-lg shadow p-6">
            <p class="text-sm text-gray-500">Translations This Month</p>
            <p class="text-2xl font-bold text-gray-900">{{ usage.translations.toLocaleString() }}</p>
          </div>
          <div class="bg-white rounded-lg shadow p-6">
            <p class="text-sm text-gray-500">Characters Translated</p>
            <p class="text-2xl font-bold text-gray-900">{{ formatCharCount(usage.characters) }}</p>
          </div>
          <div class="bg-white rounded-lg shadow p-6">
            <p class="text-sm text-gray-500">Cache Hit Rate</p>
            <p class="text-2xl font-bold text-green-600">{{ usage.cacheHitRate }}%</p>
          </div>
          <div class="bg-white rounded-lg shadow p-6">
            <p class="text-sm text-gray-500">Estimated Cost</p>
            <p class="text-2xl font-bold text-gray-900">${{ usage.cost.toFixed(2) }}</p>
          </div>
        </div>

        <!-- Usage by Channel -->
        <div class="bg-white rounded-lg shadow">
          <div class="px-6 py-4 border-b">
            <h3 class="font-semibold">Usage by Channel</h3>
          </div>
          <div class="p-6">
            <div class="space-y-4">
              <div v-for="channel in usageByChannel" :key="channel.name" class="flex items-center justify-between">
                <div class="flex items-center">
                  <span class="text-xl mr-3">{{ channel.icon }}</span>
                  <span class="font-medium">{{ channel.name }}</span>
                </div>
                <div class="flex items-center space-x-6 text-sm">
                  <span class="text-gray-500">{{ channel.translations.toLocaleString() }} translations</span>
                  <span class="text-gray-500">{{ formatCharCount(channel.characters) }}</span>
                  <span class="font-medium">${{ channel.cost.toFixed(2) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Budget Alert -->
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="font-semibold mb-4">Monthly Budget</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Set Monthly Budget ($)</label>
              <input
                v-model.number="settings.monthly_budget"
                type="number"
                min="0"
                placeholder="No limit"
                @blur="saveSettings"
                class="w-full px-3 py-2 border rounded-md"
              />
              <p class="text-xs text-gray-500 mt-1">Leave empty for no limit. You'll receive alerts at 80% and 100% usage.</p>
            </div>
            <div v-if="settings.monthly_budget" class="flex items-center">
              <div class="flex-1">
                <div class="flex justify-between text-sm mb-1">
                  <span>Current Usage</span>
                  <span :class="budgetPercentage >= 100 ? 'text-red-600' : budgetPercentage >= 80 ? 'text-yellow-600' : 'text-green-600'">
                    {{ budgetPercentage.toFixed(1) }}%
                  </span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div
                    class="h-2 rounded-full"
                    :class="budgetPercentage >= 100 ? 'bg-red-600' : budgetPercentage >= 80 ? 'bg-yellow-500' : 'bg-green-600'"
                    :style="{ width: Math.min(budgetPercentage, 100) + '%' }"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Term Modal -->
    <div
      v-if="showAddTermModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="showAddTermModal = false"
    >
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Add Glossary Term</h3>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">Source Term</label>
              <input v-model="newTerm.source_term" type="text" class="w-full px-3 py-2 border rounded-md" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Source Language</label>
              <select v-model="newTerm.source_language" class="w-full px-3 py-2 border rounded-md">
                <option v-for="lang in commonLanguages" :key="lang.code" :value="lang.code">{{ lang.name }}</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">Target Term</label>
              <input v-model="newTerm.target_term" type="text" class="w-full px-3 py-2 border rounded-md" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Target Language</label>
              <select v-model="newTerm.target_language" class="w-full px-3 py-2 border rounded-md">
                <option v-for="lang in commonLanguages" :key="lang.code" :value="lang.code">{{ lang.name }}</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Category (optional)</label>
            <input v-model="newTerm.category" type="text" placeholder="e.g., Product, Brand, Technical" class="w-full px-3 py-2 border rounded-md" />
          </div>
          <label class="flex items-center text-sm">
            <input v-model="newTerm.case_sensitive" type="checkbox" class="mr-2" />
            Case sensitive matching
          </label>
        </div>
        <div class="flex justify-end space-x-2 mt-6">
          <button @click="showAddTermModal = false" class="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">
            Cancel
          </button>
          <button @click="addTerm" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            Add Term
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import api from '../utils/api'

const authStore = useAuthStore()

const activeTab = ref('channels')
const loading = ref(true)
const showAddTermModal = ref(false)

const commonLanguages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' }
]

const settings = ref({
  translation_enabled: false,
  default_language: 'en',
  auto_detect: true,
  provider_priority: ['google', 'aws', 'deepl'],
  channel_settings: {
    sms: { enabled: false, auto_translate_inbound: true, auto_translate_outbound: true },
    chat: { enabled: false, auto_translate_inbound: true, auto_translate_outbound: true },
    email: { enabled: false, auto_translate_inbound: true, auto_translate_outbound: false },
    voice: { enabled: false, real_time_translation: false },
    whatsapp: { enabled: false, auto_translate_inbound: true, auto_translate_outbound: true },
    social: { enabled: false, auto_translate_inbound: true, auto_translate_outbound: true }
  },
  voice_settings: {
    stt_provider: 'google',
    tts_provider: 'openai',
    real_time_enabled: false,
    transcript_translation: true
  },
  monthly_budget: null
})

const glossaryTerms = ref([])

const newTerm = ref({
  source_term: '',
  source_language: 'en',
  target_term: '',
  target_language: 'es',
  category: '',
  case_sensitive: false
})

const usage = ref({
  translations: 4250,
  characters: 1250000,
  cacheHitRate: 42,
  cost: 28.50
})

const usageByChannel = ref([
  { name: 'SMS', icon: '📱', translations: 1520, characters: 380000, cost: 7.60 },
  { name: 'Chat', icon: '💬', translations: 1180, characters: 450000, cost: 9.00 },
  { name: 'Email', icon: '📧', translations: 850, characters: 320000, cost: 6.40 },
  { name: 'WhatsApp', icon: '🟢', translations: 520, characters: 85000, cost: 1.70 },
  { name: 'Social', icon: '📣', translations: 180, characters: 15000, cost: 0.30 }
])

const budgetPercentage = computed(() => {
  if (!settings.value.monthly_budget) return 0
  return (usage.value.cost / settings.value.monthly_budget) * 100
})

onMounted(async () => {
  await Promise.all([
    fetchSettings(),
    fetchGlossary(),
    fetchUsage()
  ])
  loading.value = false
})

async function fetchSettings() {
  try {
    const response = await api.get('/translation/settings')
    if (response.data.data) {
      // Merge with defaults to ensure all keys exist
      settings.value = {
        ...settings.value,
        ...response.data.data,
        channel_settings: {
          ...settings.value.channel_settings,
          ...response.data.data.channel_settings
        },
        voice_settings: {
          ...settings.value.voice_settings,
          ...response.data.data.voice_settings
        }
      }
    }
  } catch (error) {
    console.error('Failed to fetch translation settings:', error)
  }
}

async function saveSettings() {
  try {
    await api.put('/translation/settings', settings.value)
  } catch (error) {
    console.error('Failed to save translation settings:', error)
    alert('Failed to save settings')
  }
}

async function fetchGlossary() {
  try {
    const response = await api.get('/translation/glossary')
    glossaryTerms.value = response.data.data || []
  } catch (error) {
    console.error('Failed to fetch glossary:', error)
  }
}

async function addTerm() {
  try {
    await api.post('/translation/glossary', newTerm.value)
    await fetchGlossary()
    showAddTermModal.value = false
    // Reset form
    newTerm.value = {
      source_term: '',
      source_language: 'en',
      target_term: '',
      target_language: 'es',
      category: '',
      case_sensitive: false
    }
  } catch (error) {
    console.error('Failed to add term:', error)
    alert('Failed to add glossary term')
  }
}

async function deleteTerm(term) {
  if (!confirm(`Delete glossary term "${term.source_term}"?`)) return

  try {
    await api.delete(`/translation/glossary/${term.id}`)
    await fetchGlossary()
  } catch (error) {
    console.error('Failed to delete term:', error)
    alert('Failed to delete term')
  }
}

async function fetchUsage() {
  try {
    const response = await api.get('/translation/usage', { params: { days: 30 } })
    if (response.data.data?.summary) {
      usage.value = {
        translations: response.data.data.summary.total_translations || 0,
        characters: response.data.data.summary.total_characters || 0,
        cacheHitRate: Math.round(response.data.data.summary.cache_hit_rate || 0),
        cost: parseFloat(response.data.data.summary.total_cost || 0)
      }
    }
  } catch (error) {
    console.error('Failed to fetch usage:', error)
  }
}

function formatCharCount(chars) {
  if (chars >= 1000000000) return (chars / 1000000000).toFixed(1) + 'B'
  if (chars >= 1000000) return (chars / 1000000).toFixed(1) + 'M'
  if (chars >= 1000) return (chars / 1000).toFixed(1) + 'K'
  return chars.toString()
}
</script>

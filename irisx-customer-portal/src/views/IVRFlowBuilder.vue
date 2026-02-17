<template>
  <div class="h-screen flex flex-col bg-gray-100">
    <!-- Header -->
    <div class="bg-white border-b px-6 py-3 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <router-link to="/ivr" class="text-gray-500 hover:text-gray-700">
          <ArrowLeftIcon class="h-5 w-5" />
        </router-link>
        <div>
          <input
            v-if="isEditingName"
            v-model="flow.name"
            @blur="saveName"
            @keyup.enter="saveName"
            class="text-xl font-semibold border-b border-blue-500 focus:outline-none"
            ref="nameInput"
          />
          <h1 v-else @click="startEditName" class="text-xl font-semibold cursor-pointer hover:text-blue-600">
            {{ flow.name || 'Untitled Flow' }}
          </h1>
          <p class="text-sm text-gray-500">
            {{ flow.status === 'published' ? 'Published' : 'Draft' }}
            <span v-if="lastSaved"> • Saved {{ formatTime(lastSaved) }}</span>
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <button @click="showVariables = true" class="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">
          Variables
        </button>
        <button @click="validateFlow" class="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">
          Validate
        </button>
        <button @click="testFlow" class="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">
          Test
        </button>
        <button @click="saveFlow" :disabled="saving" class="px-4 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
        <button @click="publishFlow" :disabled="publishing" class="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
          {{ publishing ? 'Publishing...' : 'Publish' }}
        </button>
      </div>
    </div>

    <div class="flex-1 flex overflow-hidden">
      <!-- Node Palette (Left Sidebar) -->
      <div class="w-64 bg-white border-r overflow-y-auto p-4">
        <h3 class="text-sm font-medium text-gray-500 mb-3">NODES</h3>

        <div class="space-y-2">
          <div
            v-for="nodeType in nodeTypes"
            :key="nodeType.type"
            draggable="true"
            @dragstart="onDragStart($event, nodeType)"
            class="p-3 bg-gray-50 border rounded-lg cursor-move hover:bg-gray-100 hover:border-gray-300 transition-colors"
          >
            <div class="flex items-center gap-3">
              <div :class="['p-2 rounded', nodeType.bgColor]">
                <component :is="nodeType.icon" :class="['h-4 w-4', nodeType.iconColor]" />
              </div>
              <div>
                <p class="text-sm font-medium">{{ nodeType.label }}</p>
                <p class="text-xs text-gray-500">{{ nodeType.description }}</p>
              </div>
            </div>
          </div>
        </div>

        <h3 class="text-sm font-medium text-gray-500 mt-6 mb-3">TEMPLATES</h3>
        <div class="space-y-2">
          <button
            v-for="template in templates"
            :key="template.id"
            @click="loadTemplate(template)"
            class="w-full p-3 text-left bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
          >
            <p class="text-sm font-medium text-blue-900">{{ template.name }}</p>
            <p class="text-xs text-blue-600">{{ template.description }}</p>
          </button>
        </div>
      </div>

      <!-- Canvas -->
      <div
        ref="canvas"
        class="flex-1 relative overflow-auto bg-gray-50"
        @drop="onDrop"
        @dragover.prevent
        @click="deselectNode"
      >
        <!-- Grid Background -->
        <div class="absolute inset-0" style="background-image: radial-gradient(circle, #d1d5db 1px, transparent 1px); background-size: 20px 20px;"></div>

        <!-- SVG for Connections -->
        <svg class="absolute inset-0 pointer-events-none" style="width: 100%; height: 100%;">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
            </marker>
          </defs>

          <!-- Existing connections -->
          <path
            v-for="conn in connections"
            :key="conn.connection_id"
            :d="getConnectionPath(conn)"
            stroke="#6b7280"
            stroke-width="2"
            fill="none"
            marker-end="url(#arrowhead)"
            class="cursor-pointer hover:stroke-red-500"
            @click.stop="deleteConnection(conn)"
          />

          <!-- Drawing connection -->
          <path
            v-if="drawingConnection"
            :d="getDrawingPath()"
            stroke="#3b82f6"
            stroke-width="2"
            stroke-dasharray="5,5"
            fill="none"
          />
        </svg>

        <!-- Nodes -->
        <div
          v-for="node in nodes"
          :key="node.node_id"
          :ref="el => setNodeRef(node.node_id, el)"
          :style="{ left: node.position_x + 'px', top: node.position_y + 'px' }"
          :class="[
            'absolute w-56 bg-white border-2 rounded-lg shadow-sm cursor-move select-none',
            selectedNode?.node_id === node.node_id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
          ]"
          @mousedown="startDrag($event, node)"
          @click.stop="selectNode(node)"
        >
          <!-- Node Header -->
          <div :class="['px-3 py-2 rounded-t-lg flex items-center gap-2', getNodeHeaderClass(node.node_type)]">
            <component :is="getNodeIcon(node.node_type)" class="h-4 w-4" />
            <span class="text-sm font-medium truncate">{{ node.label || getNodeLabel(node.node_type) }}</span>
          </div>

          <!-- Node Body -->
          <div class="px-3 py-2 text-xs text-gray-600">
            <template v-if="node.node_type === 'menu'">
              {{ Object.keys(node.config?.options || {}).length }} options
            </template>
            <template v-else-if="node.node_type === 'play'">
              {{ node.config?.audio_name || 'No audio' }}
            </template>
            <template v-else-if="node.node_type === 'transfer'">
              {{ node.config?.destination || 'No destination' }}
            </template>
            <template v-else-if="node.node_type === 'condition'">
              {{ node.config?.variable || 'No condition' }}
            </template>
            <template v-else>
              {{ node.config?.description || 'Click to configure' }}
            </template>
          </div>

          <!-- Connection Points -->
          <div
            class="absolute -right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full cursor-crosshair border-2 border-white"
            @mousedown.stop="startConnection(node, 'output')"
          ></div>
          <div
            v-if="node.node_type !== 'start'"
            class="absolute -left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-green-500 rounded-full cursor-crosshair border-2 border-white"
            @mouseup.stop="endConnection(node, 'input')"
          ></div>
        </div>

        <!-- Zoom Controls -->
        <div class="absolute bottom-4 right-4 flex items-center gap-2 bg-white rounded-lg shadow p-2">
          <button @click="zoomOut" class="p-1 hover:bg-gray-100 rounded">
            <MinusIcon class="h-4 w-4" />
          </button>
          <span class="text-sm text-gray-600 w-12 text-center">{{ Math.round(zoom * 100) }}%</span>
          <button @click="zoomIn" class="p-1 hover:bg-gray-100 rounded">
            <PlusIcon class="h-4 w-4" />
          </button>
          <button @click="fitToScreen" class="p-1 hover:bg-gray-100 rounded ml-2">
            <ArrowsPointingOutIcon class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- Properties Panel (Right Sidebar) -->
      <div v-if="selectedNode" class="w-80 bg-white border-l overflow-y-auto">
        <div class="p-4 border-b flex items-center justify-between">
          <h3 class="font-medium">Node Properties</h3>
          <button @click="deleteNode(selectedNode)" class="text-red-500 hover:text-red-700">
            <TrashIcon class="h-5 w-5" />
          </button>
        </div>

        <div class="p-4 space-y-4">
          <!-- Common Properties -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Label</label>
            <input
              v-model="selectedNode.label"
              @change="updateNode"
              class="w-full px-3 py-2 border rounded-lg text-sm"
              placeholder="Node label"
            />
          </div>

          <!-- Type-specific Properties -->
          <template v-if="selectedNode.node_type === 'menu'">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Prompt Audio</label>
              <select v-model="selectedNode.config.audio_id" @change="updateNode" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Select audio...</option>
                <option v-for="audio in audioAssets" :key="audio.id" :value="audio.id">{{ audio.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Max Retries</label>
              <input v-model.number="selectedNode.config.max_retries" @change="updateNode" type="number" min="1" max="5" class="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Menu Options</label>
              <div class="space-y-2">
                <div v-for="(option, digit) in selectedNode.config.options" :key="digit" class="flex items-center gap-2">
                  <span class="w-8 text-center font-mono bg-gray-100 px-2 py-1 rounded">{{ digit }}</span>
                  <input v-model="selectedNode.config.options[digit]" @change="updateNode" class="flex-1 px-2 py-1 border rounded text-sm" placeholder="Description" />
                  <button @click="removeMenuOption(digit)" class="text-red-500 hover:text-red-700">
                    <XMarkIcon class="h-4 w-4" />
                  </button>
                </div>
              </div>
              <button @click="addMenuOption" class="mt-2 text-sm text-blue-600 hover:text-blue-700">+ Add Option</button>
            </div>
          </template>

          <template v-else-if="selectedNode.node_type === 'play'">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Audio File</label>
              <select v-model="selectedNode.config.audio_id" @change="updateNode" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Select audio...</option>
                <option v-for="audio in audioAssets" :key="audio.id" :value="audio.id">{{ audio.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Or TTS Text</label>
              <textarea v-model="selectedNode.config.tts_text" @change="updateNode" rows="3" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Enter text to speak..."></textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">TTS Voice</label>
              <select v-model="selectedNode.config.tts_voice" @change="updateNode" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="alloy">Alloy (Neutral)</option>
                <option value="echo">Echo (Male)</option>
                <option value="fable">Fable (British)</option>
                <option value="onyx">Onyx (Deep)</option>
                <option value="nova">Nova (Female)</option>
                <option value="shimmer">Shimmer (Warm)</option>
              </select>
            </div>
          </template>

          <template v-else-if="selectedNode.node_type === 'input'">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Variable Name</label>
              <input v-model="selectedNode.config.variable_name" @change="updateNode" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="caller_input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Max Digits</label>
              <input v-model.number="selectedNode.config.max_digits" @change="updateNode" type="number" min="1" max="20" class="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Timeout (seconds)</label>
              <input v-model.number="selectedNode.config.timeout" @change="updateNode" type="number" min="1" max="60" class="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div class="flex items-center gap-2">
              <input type="checkbox" v-model="selectedNode.config.terminate_on_hash" @change="updateNode" class="rounded" />
              <label class="text-sm text-gray-700">Terminate on # key</label>
            </div>
          </template>

          <template v-else-if="selectedNode.node_type === 'transfer'">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Transfer Type</label>
              <select v-model="selectedNode.config.transfer_type" @change="updateNode" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="queue">Queue</option>
                <option value="agent">Agent</option>
                <option value="extension">Extension</option>
                <option value="external">External Number</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Destination</label>
              <select v-if="selectedNode.config.transfer_type === 'queue'" v-model="selectedNode.config.destination" @change="updateNode" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Select queue...</option>
                <option v-for="q in queues" :key="q.id" :value="q.id">{{ q.name }}</option>
              </select>
              <input v-else v-model="selectedNode.config.destination" @change="updateNode" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Enter destination" />
            </div>
            <div class="flex items-center gap-2">
              <input type="checkbox" v-model="selectedNode.config.announce_position" @change="updateNode" class="rounded" />
              <label class="text-sm text-gray-700">Announce queue position</label>
            </div>
          </template>

          <template v-else-if="selectedNode.node_type === 'voicemail'">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Greeting Audio</label>
              <select v-model="selectedNode.config.greeting_audio_id" @change="updateNode" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Default greeting</option>
                <option v-for="audio in audioAssets" :key="audio.id" :value="audio.id">{{ audio.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Max Recording Length (seconds)</label>
              <input v-model.number="selectedNode.config.max_length" @change="updateNode" type="number" min="10" max="300" class="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Email Notification</label>
              <input v-model="selectedNode.config.notification_email" @change="updateNode" type="email" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="notify@example.com" />
            </div>
          </template>

          <template v-else-if="selectedNode.node_type === 'webhook'">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
              <input v-model="selectedNode.config.url" @change="updateNode" type="url" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="https://api.example.com/webhook" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">HTTP Method</label>
              <select v-model="selectedNode.config.method" @change="updateNode" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="POST">POST</option>
                <option value="GET">GET</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Response Variable</label>
              <input v-model="selectedNode.config.response_variable" @change="updateNode" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="webhook_result" />
            </div>
          </template>

          <template v-else-if="selectedNode.node_type === 'condition'">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Variable</label>
              <input v-model="selectedNode.config.variable" @change="updateNode" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="caller_input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Operator</label>
              <select v-model="selectedNode.config.operator" @change="updateNode" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="equals">Equals</option>
                <option value="not_equals">Not Equals</option>
                <option value="contains">Contains</option>
                <option value="greater_than">Greater Than</option>
                <option value="less_than">Less Than</option>
                <option value="starts_with">Starts With</option>
                <option value="ends_with">Ends With</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Value</label>
              <input v-model="selectedNode.config.value" @change="updateNode" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="expected value" />
            </div>
          </template>

          <template v-else-if="selectedNode.node_type === 'set_variable'">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Variable Name</label>
              <input v-model="selectedNode.config.variable_name" @change="updateNode" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="my_variable" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Value</label>
              <input v-model="selectedNode.config.value" @change="updateNode" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="value" />
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Variables Modal -->
    <div v-if="showVariables" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div class="p-4 border-b flex items-center justify-between">
          <h3 class="font-semibold">Flow Variables</h3>
          <button @click="showVariables = false" class="text-gray-500 hover:text-gray-700">
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>
        <div class="p-4 max-h-96 overflow-y-auto">
          <div class="space-y-3">
            <div v-for="variable in variables" :key="variable.id" class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div class="flex-1">
                <p class="font-medium text-sm">{{ variable.name }}</p>
                <p class="text-xs text-gray-500">{{ variable.variable_type }} - {{ variable.description || 'No description' }}</p>
              </div>
              <span class="px-2 py-1 bg-gray-200 rounded text-xs font-mono">{{ variable.default_value || 'null' }}</span>
              <button @click="deleteVariable(variable.id)" class="text-red-500 hover:text-red-700">
                <TrashIcon class="h-4 w-4" />
              </button>
            </div>
          </div>
          <div class="mt-4 p-3 border rounded-lg space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <input v-model="newVariable.name" placeholder="Variable name" class="px-3 py-2 border rounded text-sm" />
              <select v-model="newVariable.variable_type" class="px-3 py-2 border rounded text-sm">
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="date">Date</option>
              </select>
            </div>
            <input v-model="newVariable.default_value" placeholder="Default value" class="w-full px-3 py-2 border rounded text-sm" />
            <button @click="addVariable" class="w-full py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              Add Variable
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Validation Results Modal -->
    <div v-if="showValidation" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div class="p-4 border-b flex items-center justify-between">
          <h3 class="font-semibold">Validation Results</h3>
          <button @click="showValidation = false" class="text-gray-500 hover:text-gray-700">
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>
        <div class="p-4">
          <div v-if="validationResult?.valid" class="flex items-center gap-3 p-4 bg-green-50 text-green-700 rounded-lg">
            <CheckCircleIcon class="h-6 w-6" />
            <span>Flow is valid and ready to publish!</span>
          </div>
          <div v-else class="space-y-3">
            <div v-for="(error, i) in validationResult?.errors" :key="i" class="flex items-start gap-3 p-3 bg-red-50 text-red-700 rounded-lg">
              <ExclamationCircleIcon class="h-5 w-5 flex-shrink-0 mt-0.5" />
              <span class="text-sm">{{ error }}</span>
            </div>
            <div v-for="(warning, i) in validationResult?.warnings" :key="'w'+i" class="flex items-start gap-3 p-3 bg-yellow-50 text-yellow-700 rounded-lg">
              <ExclamationTriangleIcon class="h-5 w-5 flex-shrink-0 mt-0.5" />
              <span class="text-sm">{{ warning }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick, h } from 'vue'
import { useRoute } from 'vue-router'
import api from '../services/api'

// Icon Components
const ArrowLeftIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18' })]) }
const TrashIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0' })]) }
const XMarkIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M6 18L18 6M6 6l12 12' })]) }
const PlusIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M12 4.5v15m7.5-7.5h-15' })]) }
const MinusIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M19.5 12h-15' })]) }
const ArrowsPointingOutIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15' })]) }
const CheckCircleIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' })]) }
const ExclamationCircleIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z' })]) }
const ExclamationTriangleIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z' })]) }

// Node type icons
const PlayIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z' })]) }
const Squares2X2Icon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z' })]) }
const KeyboardIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z' })]) }
const PhoneArrowUpRightIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M20.25 3.75v4.5m0-4.5h-4.5m4.5 0l-6 6m3 12c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 014.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.054.902-.417 1.173l-1.293.97a1.062 1.062 0 00-.38 1.21 12.035 12.035 0 007.143 7.143c.441.162.928-.004 1.21-.38l.97-1.293a1.125 1.125 0 011.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 01-2.25 2.25h-2.25z' })]) }
const InboxIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-17.399 0V3.375c0-.621.504-1.125 1.125-1.125h15.75c.621 0 1.125.504 1.125 1.125v10.125m-17.399 0c-.621 0-1.125.504-1.125 1.125v4.875c0 .621.504 1.125 1.125 1.125h15.75c.621 0 1.125-.504 1.125-1.125v-4.875c0-.621-.504-1.125-1.125-1.125m-17.399 0h17.399' })]) }
const CodeBracketIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5' })]) }
const AdjustmentsHorizontalIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75' })]) }
const VariableIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M4.745 3A23.933 23.933 0 003 12c0 3.183.62 6.22 1.745 9M19.5 3c.967 2.78 1.5 5.817 1.5 9s-.533 6.22-1.5 9M8.25 8.885l1.444-.89a.75.75 0 011.105.402l2.402 7.206a.75.75 0 001.104.401l1.445-.889m-8.25.75l.213.09a1.687 1.687 0 002.062-.617l4.45-6.676a1.688 1.688 0 012.062-.618l.213.09' })]) }
const ArrowPathIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99' })]) }
const StopIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z' })]) }
const PlayCircleIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z' }), h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z' })]) }

const route = useRoute()
const canvas = ref(null)
const nameInput = ref(null)

// State
const flow = reactive({ id: null, name: '', description: '', status: 'draft' })
const nodes = ref([])
const connections = ref([])
const variables = ref([])
const audioAssets = ref([])
const queues = ref([])
const templates = ref([])

const selectedNode = ref(null)
const isEditingName = ref(false)
const lastSaved = ref(null)
const saving = ref(false)
const publishing = ref(false)
const zoom = ref(1)

const showVariables = ref(false)
const showValidation = ref(false)
const validationResult = ref(null)

const newVariable = reactive({ name: '', variable_type: 'string', default_value: '' })

// Drag state
const draggingNode = ref(null)
const dragOffset = ref({ x: 0, y: 0 })

// Connection drawing state
const drawingConnection = ref(false)
const connectionStart = ref(null)
const connectionEnd = ref({ x: 0, y: 0 })

// Node refs for connection calculations
const nodeRefs = ref({})

// Node types palette
const nodeTypes = [
  { type: 'start', label: 'Start', description: 'Entry point', icon: PlayCircleIcon, bgColor: 'bg-green-100', iconColor: 'text-green-600' },
  { type: 'menu', label: 'Menu', description: 'DTMF options', icon: Squares2X2Icon, bgColor: 'bg-blue-100', iconColor: 'text-blue-600' },
  { type: 'play', label: 'Play Audio', description: 'Play message', icon: PlayIcon, bgColor: 'bg-purple-100', iconColor: 'text-purple-600' },
  { type: 'input', label: 'Get Input', description: 'Collect digits', icon: KeyboardIcon, bgColor: 'bg-yellow-100', iconColor: 'text-yellow-600' },
  { type: 'transfer', label: 'Transfer', description: 'Route call', icon: PhoneArrowUpRightIcon, bgColor: 'bg-orange-100', iconColor: 'text-orange-600' },
  { type: 'voicemail', label: 'Voicemail', description: 'Leave message', icon: InboxIcon, bgColor: 'bg-pink-100', iconColor: 'text-pink-600' },
  { type: 'webhook', label: 'Webhook', description: 'API call', icon: CodeBracketIcon, bgColor: 'bg-indigo-100', iconColor: 'text-indigo-600' },
  { type: 'condition', label: 'Condition', description: 'If/else branch', icon: AdjustmentsHorizontalIcon, bgColor: 'bg-teal-100', iconColor: 'text-teal-600' },
  { type: 'set_variable', label: 'Set Variable', description: 'Store value', icon: VariableIcon, bgColor: 'bg-cyan-100', iconColor: 'text-cyan-600' },
  { type: 'goto', label: 'Go To', description: 'Jump to node', icon: ArrowPathIcon, bgColor: 'bg-gray-100', iconColor: 'text-gray-600' },
  { type: 'end', label: 'End', description: 'Hang up', icon: StopIcon, bgColor: 'bg-red-100', iconColor: 'text-red-600' },
]

// Initialize
onMounted(async () => {
  const flowId = route.params.id
  if (flowId && flowId !== 'new') {
    await loadFlow(flowId)
  } else {
    // Create default start node
    nodes.value.push({
      node_id: 'start-' + Date.now(),
      node_type: 'start',
      label: 'Start',
      position_x: 100,
      position_y: 200,
      config: {}
    })
  }
  await loadAudioAssets()
  await loadQueues()
  await loadTemplates()
})

async function loadFlow(flowId) {
  try {
    const { data } = await api.get(`/ivr/flows/${flowId}`)
    flow.id = data.flow.id
    flow.name = data.flow.name
    flow.description = data.flow.description
    flow.status = data.flow.status
    nodes.value = data.flow.nodes || []
    connections.value = data.flow.connections || []
    variables.value = data.flow.variables || []
  } catch (error) {
    console.error('Failed to load flow:', error)
  }
}

async function loadAudioAssets() {
  try {
    const { data } = await api.get('/ivr/audio')
    audioAssets.value = data.assets || []
  } catch (error) {
    console.error('Failed to load audio assets:', error)
  }
}

async function loadQueues() {
  try {
    const { data } = await api.get('/queues')
    queues.value = data.queues || []
  } catch (error) {
    console.error('Failed to load queues:', error)
  }
}

async function loadTemplates() {
  try {
    const { data } = await api.get('/ivr/templates')
    templates.value = data.templates || []
  } catch (error) {
    console.error('Failed to load templates:', error)
  }
}

// Save flow
async function saveFlow() {
  saving.value = true
  try {
    const flowState = {
      nodes: nodes.value,
      connections: connections.value,
      entryNodeId: nodes.value.find(n => n.node_type === 'start')?.node_id,
      metadata: { lastModified: new Date().toISOString() }
    }

    if (flow.id) {
      await api.put(`/ivr/flows/${flow.id}/state`, flowState)
    } else {
      const { data } = await api.post('/ivr/flows', { name: flow.name || 'Untitled Flow' })
      flow.id = data.flow.id
      await api.put(`/ivr/flows/${flow.id}/state`, flowState)
    }
    lastSaved.value = new Date()
  } catch (error) {
    console.error('Failed to save flow:', error)
  } finally {
    saving.value = false
  }
}

async function publishFlow() {
  publishing.value = true
  try {
    await saveFlow()
    await api.post(`/ivr/flows/${flow.id}/publish`)
    flow.status = 'published'
  } catch (error) {
    console.error('Failed to publish flow:', error)
  } finally {
    publishing.value = false
  }
}

async function validateFlow() {
  try {
    const { data } = await api.post(`/ivr/flows/${flow.id}/validate`)
    validationResult.value = data.validation
    showValidation.value = true
  } catch (error) {
    console.error('Failed to validate flow:', error)
  }
}

async function testFlow() {
  // Open test dialog or trigger test call
  console.log('Test flow:', flow.id)
}

// Name editing
function startEditName() {
  isEditingName.value = true
  nextTick(() => nameInput.value?.focus())
}

function saveName() {
  isEditingName.value = false
  saveFlow()
}

// Node operations
function setNodeRef(nodeId, el) {
  if (el) nodeRefs.value[nodeId] = el
}

function selectNode(node) {
  selectedNode.value = { ...node, config: { ...node.config } }
}

function deselectNode() {
  selectedNode.value = null
}

function updateNode() {
  const idx = nodes.value.findIndex(n => n.node_id === selectedNode.value.node_id)
  if (idx !== -1) {
    nodes.value[idx] = { ...selectedNode.value }
  }
}

function deleteNode(node) {
  nodes.value = nodes.value.filter(n => n.node_id !== node.node_id)
  connections.value = connections.value.filter(c => c.source_node_id !== node.node_id && c.target_node_id !== node.node_id)
  selectedNode.value = null
}

// Drag and drop from palette
function onDragStart(e, nodeType) {
  e.dataTransfer.setData('nodeType', JSON.stringify(nodeType))
}

function onDrop(e) {
  const nodeTypeData = e.dataTransfer.getData('nodeType')
  if (!nodeTypeData) return

  const nodeType = JSON.parse(nodeTypeData)
  const rect = canvas.value.getBoundingClientRect()
  const x = e.clientX - rect.left + canvas.value.scrollLeft
  const y = e.clientY - rect.top + canvas.value.scrollTop

  const newNode = {
    node_id: `${nodeType.type}-${Date.now()}`,
    node_type: nodeType.type,
    label: nodeType.label,
    position_x: x - 100,
    position_y: y - 30,
    config: getDefaultConfig(nodeType.type)
  }

  nodes.value.push(newNode)
}

function getDefaultConfig(nodeType) {
  switch (nodeType) {
    case 'menu':
      return { options: { '1': 'Sales', '2': 'Support', '0': 'Operator' }, max_retries: 3 }
    case 'play':
      return { tts_voice: 'nova' }
    case 'input':
      return { max_digits: 10, timeout: 5, terminate_on_hash: true }
    case 'transfer':
      return { transfer_type: 'queue', announce_position: true }
    case 'voicemail':
      return { max_length: 120 }
    case 'webhook':
      return { method: 'POST' }
    case 'condition':
      return { operator: 'equals' }
    default:
      return {}
  }
}

// Drag nodes on canvas
function startDrag(e, node) {
  if (e.target.classList.contains('cursor-crosshair')) return
  draggingNode.value = node
  dragOffset.value = {
    x: e.clientX - node.position_x,
    y: e.clientY - node.position_y
  }
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

function onDrag(e) {
  if (!draggingNode.value) return
  const node = nodes.value.find(n => n.node_id === draggingNode.value.node_id)
  if (node) {
    node.position_x = e.clientX - dragOffset.value.x
    node.position_y = e.clientY - dragOffset.value.y
  }
}

function stopDrag() {
  draggingNode.value = null
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// Connection drawing
function startConnection(node, port) {
  drawingConnection.value = true
  connectionStart.value = { node, port }
  document.addEventListener('mousemove', onDrawConnection)
  document.addEventListener('mouseup', cancelConnection)
}

function onDrawConnection(e) {
  const rect = canvas.value.getBoundingClientRect()
  connectionEnd.value = {
    x: e.clientX - rect.left + canvas.value.scrollLeft,
    y: e.clientY - rect.top + canvas.value.scrollTop
  }
}

function endConnection(node, port) {
  if (drawingConnection.value && connectionStart.value) {
    if (connectionStart.value.node.node_id !== node.node_id) {
      const newConnection = {
        connection_id: `conn-${Date.now()}`,
        source_node_id: connectionStart.value.node.node_id,
        source_port: connectionStart.value.port,
        target_node_id: node.node_id,
        target_port: port
      }
      connections.value.push(newConnection)
    }
  }
  cancelConnection()
}

function cancelConnection() {
  drawingConnection.value = false
  connectionStart.value = null
  document.removeEventListener('mousemove', onDrawConnection)
  document.removeEventListener('mouseup', cancelConnection)
}

function deleteConnection(conn) {
  connections.value = connections.value.filter(c => c.connection_id !== conn.connection_id)
}

// Connection path calculations
function getConnectionPath(conn) {
  const sourceNode = nodes.value.find(n => n.node_id === conn.source_node_id)
  const targetNode = nodes.value.find(n => n.node_id === conn.target_node_id)
  if (!sourceNode || !targetNode) return ''

  const sx = sourceNode.position_x + 224 // node width
  const sy = sourceNode.position_y + 40 // half height
  const tx = targetNode.position_x
  const ty = targetNode.position_y + 40

  const midX = (sx + tx) / 2
  return `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`
}

function getDrawingPath() {
  if (!connectionStart.value) return ''
  const node = connectionStart.value.node
  const sx = node.position_x + 224
  const sy = node.position_y + 40
  const tx = connectionEnd.value.x
  const ty = connectionEnd.value.y

  const midX = (sx + tx) / 2
  return `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`
}

// Node styling helpers
function getNodeIcon(nodeType) {
  const type = nodeTypes.find(t => t.type === nodeType)
  return type?.icon || PlayIcon
}

function getNodeLabel(nodeType) {
  const type = nodeTypes.find(t => t.type === nodeType)
  return type?.label || nodeType
}

function getNodeHeaderClass(nodeType) {
  const colors = {
    start: 'bg-green-100 text-green-800',
    menu: 'bg-blue-100 text-blue-800',
    play: 'bg-purple-100 text-purple-800',
    input: 'bg-yellow-100 text-yellow-800',
    transfer: 'bg-orange-100 text-orange-800',
    voicemail: 'bg-pink-100 text-pink-800',
    webhook: 'bg-indigo-100 text-indigo-800',
    condition: 'bg-teal-100 text-teal-800',
    set_variable: 'bg-cyan-100 text-cyan-800',
    goto: 'bg-gray-100 text-gray-800',
    end: 'bg-red-100 text-red-800'
  }
  return colors[nodeType] || 'bg-gray-100 text-gray-800'
}

// Menu options
function addMenuOption() {
  if (!selectedNode.value.config.options) {
    selectedNode.value.config.options = {}
  }
  const usedDigits = Object.keys(selectedNode.value.config.options)
  const allDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', '#']
  const nextDigit = allDigits.find(d => !usedDigits.includes(d))
  if (nextDigit) {
    selectedNode.value.config.options[nextDigit] = ''
    updateNode()
  }
}

function removeMenuOption(digit) {
  delete selectedNode.value.config.options[digit]
  updateNode()
}

// Variables
async function addVariable() {
  if (!newVariable.name) return
  try {
    const { data } = await api.post(`/ivr/flows/${flow.id}/variables`, newVariable)
    variables.value.push(data.variable)
    newVariable.name = ''
    newVariable.default_value = ''
  } catch (error) {
    console.error('Failed to add variable:', error)
  }
}

async function deleteVariable(variableId) {
  try {
    await api.delete(`/ivr/flows/${flow.id}/variables/${variableId}`)
    variables.value = variables.value.filter(v => v.id !== variableId)
  } catch (error) {
    console.error('Failed to delete variable:', error)
  }
}

// Templates
async function loadTemplate(template) {
  if (nodes.value.length > 1) {
    if (!confirm('This will replace your current flow. Continue?')) return
  }
  try {
    const { data } = await api.post(`/ivr/flows/from-template/${template.id}`, { name: flow.name || template.name })
    flow.id = data.flow.id
    await loadFlow(flow.id)
  } catch (error) {
    console.error('Failed to load template:', error)
  }
}

// Zoom
function zoomIn() {
  zoom.value = Math.min(zoom.value + 0.1, 2)
}

function zoomOut() {
  zoom.value = Math.max(zoom.value - 0.1, 0.5)
}

function fitToScreen() {
  zoom.value = 1
}

// Utilities
function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

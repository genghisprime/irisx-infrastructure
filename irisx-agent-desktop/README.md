# IRISX Agent Desktop - WebRTC Softphone

**Status:** 30% Complete - Foundation Ready, Components Needed

## ✅ Complete:
- Project structure (V ite + Vue 3)
- Dependencies (Vue Router, Pinia, Axios, SIP.js, Socket.io, Tailwind)
- Config files (Tailwind, PostCSS, .env.example)

## ❌ Needs Building (70%):
1. Auth store & API client (copy from Customer Portal)
2. Agent login page
3. Agent dashboard UI
4. **useSoftphone composable** (SIP.js WebRTC - MOST COMPLEX)
5. Softphone component (dial pad, call controls)
6. Call disposition modal
7. Agent status selector
8. Call queue & history

## Quick Start for Next Session:
```bash
# 1. Copy from Customer Portal
cp ../irisx-customer-portal/src/stores/auth.js src/stores/
cp ../irisx-customer-portal/src/utils/api.js src/utils/

# 2. Build useSoftphone.js (SIP.js integration)
# 3. Create AgentDashboard.vue
# 4. Create Softphone.vue component
```

**Note:** Requires FreeSWITCH WebRTC config. Foundation ready for 2-3 dev sessions.

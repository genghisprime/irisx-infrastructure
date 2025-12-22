-- Migration: 050_performance_indexes.sql
-- Description: Add missing performance indexes for admin portal and API routes
-- Created: 2025-12-10
--
-- This migration adds indexes identified through query pattern analysis
-- to improve performance of frequently used admin portal queries.

-- ============================================================================
-- CALLS TABLE - Heavy CDR queries (High Priority)
-- ============================================================================

-- Index for quality alerts query: WHERE mos_score < 3.5 AND mos_score IS NOT NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_mos_score
    ON calls (mos_score DESC NULLS LAST)
    WHERE mos_score IS NOT NULL;

-- Index for hangup cause analysis (GROUP BY hangup_cause)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_hangup_cause
    ON calls (hangup_cause)
    WHERE hangup_cause IS NOT NULL;

-- Index for parent call lookups in CDR timeline
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_parent_call_sid
    ON calls (parent_call_sid)
    WHERE parent_call_sid IS NOT NULL;

-- NOTE: contact_id and queue_id columns don't exist on calls table in production
-- These indexes would be useful if those columns are added in the future:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_contact_id ON calls (contact_id) WHERE contact_id IS NOT NULL;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_queue_id_status ON calls (queue_id, status) WHERE queue_id IS NOT NULL;


-- ============================================================================
-- TENANTS TABLE - Cross-tenant filtering
-- ============================================================================

-- Composite index for common tenant filtering pattern
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_status_deleted
    ON tenants (status, deleted_at)
    WHERE deleted_at IS NULL;

-- Index for created_at ordering in tenant list
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_created_at_desc
    ON tenants (created_at DESC);


-- ============================================================================
-- USERS TABLE - Agent and user management
-- ============================================================================

-- Composite index for tenant-scoped user queries with soft delete
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_tenant_deleted
    ON users (tenant_id, deleted_at)
    WHERE deleted_at IS NULL;


-- ============================================================================
-- QUEUES TABLE - Queue management
-- ============================================================================

-- Composite index for tenant-scoped queue queries with soft delete
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queues_tenant_deleted
    ON queues (tenant_id, deleted_at)
    WHERE deleted_at IS NULL;

-- Index for queue name uniqueness check per tenant
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queues_tenant_name
    ON queues (tenant_id, name)
    WHERE deleted_at IS NULL;


-- ============================================================================
-- CONTACTS TABLE - Contact search optimization
-- ============================================================================

-- Composite index for tenant-scoped contact queries with soft delete
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_tenant_deleted
    ON contacts (tenant_id, deleted_at)
    WHERE deleted_at IS NULL;

-- Index for created_at ordering in contact list
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_created_at_desc
    ON contacts (created_at DESC);


-- ============================================================================
-- INVOICES TABLE - Billing queries
-- ============================================================================

-- Composite index for tenant billing queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_tenant_status
    ON invoices (tenant_id, status);

-- Index for date range queries in revenue analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_created_at_desc
    ON invoices (created_at DESC);


-- ============================================================================
-- ALERT_RULES & ALERT_HISTORY - Alert management
-- ============================================================================

-- NOTE: alert_history uses recorded_at column, not resolved_at
-- NOTE: alert_rules table doesn't exist in production
-- These indexes would be useful if those schemas exist:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alert_history_unresolved ON alert_history (triggered_at DESC) WHERE resolved_at IS NULL;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alert_rules_status_deleted ON alert_rules (status, deleted_at) WHERE deleted_at IS NULL;


-- ============================================================================
-- API_KEYS TABLE - API key management
-- ============================================================================

-- Index for recent usage tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_last_used
    ON api_keys (last_used_at DESC NULLS LAST);

-- Index for created_at ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_created_at_desc
    ON api_keys (created_at DESC);


-- ============================================================================
-- IVR TABLES - IVR system optimization
-- ============================================================================

-- Index for active IVR sessions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ivr_sessions_active
    ON ivr_sessions (started_at DESC)
    WHERE ended_at IS NULL;

-- Index for IVR menu tenant queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ivr_menus_tenant_status
    ON ivr_menus (tenant_id, status);


-- ============================================================================
-- WEBHOOK DELIVERIES - Webhook monitoring
-- ============================================================================

-- Index for webhook delivery lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_deliveries_webhook_created
    ON webhook_deliveries (webhook_id, created_at DESC);


-- ============================================================================
-- CONVERSATIONS TABLE - Unified inbox optimization
-- ============================================================================

-- Index for SLA breach detection
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_sla_updated
    ON conversations (sla_due_at, updated_at)
    WHERE status NOT IN ('resolved', 'closed');


-- ============================================================================
-- ADMIN_AUDIT_LOG - Audit trail optimization
-- ============================================================================

-- Composite index for tenant-specific audit queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_audit_log_tenant_created
    ON admin_audit_log (tenant_id, created_at DESC)
    WHERE tenant_id IS NOT NULL;


-- ============================================================================
-- CAMPAIGN_RECIPIENTS - Campaign processing optimization
-- ============================================================================

-- Index for pending recipients in campaign processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaign_recipients_pending
    ON campaign_recipients (campaign_id)
    WHERE status = 'pending';

-- Index for failed recipients for retry processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaign_recipients_failed
    ON campaign_recipients (campaign_id, retry_count)
    WHERE status = 'failed';


-- ============================================================================
-- SMS_MESSAGES - SMS analytics optimization
-- ============================================================================

-- Composite index for tenant SMS queries with date filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sms_messages_tenant_created
    ON sms_messages (tenant_id, created_at DESC);


-- ============================================================================
-- EMAILS TABLE - Email analytics optimization
-- ============================================================================

-- Composite index for tenant email queries with date filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_emails_tenant_created
    ON emails (tenant_id, created_at DESC);


-- ============================================================================
-- ANALYZE updated tables for query planner
-- ============================================================================

ANALYZE calls;
ANALYZE tenants;
ANALYZE users;
ANALYZE queues;
ANALYZE contacts;
ANALYZE invoices;
ANALYZE alert_history;
ANALYZE alert_rules;
ANALYZE api_keys;
ANALYZE ivr_sessions;
ANALYZE ivr_menus;
ANALYZE webhook_deliveries;
ANALYZE conversations;
ANALYZE admin_audit_log;
ANALYZE campaign_recipients;
ANALYZE sms_messages;
ANALYZE emails;

-- Migration complete

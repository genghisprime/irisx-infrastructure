-- Migration: Add dunning system tables
-- Date: 2025-12-16
-- Description: Creates tables for failed payment recovery (dunning) system

-- Main dunning records table
CREATE TABLE IF NOT EXISTS dunning_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    stripe_invoice_id VARCHAR(255),
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'usd',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- Status: pending, in_progress, max_retries, suspended, resolved, canceled
    attempt_count INTEGER NOT NULL DEFAULT 0,
    reminder_count INTEGER NOT NULL DEFAULT 0,
    first_failed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    last_reminder_at TIMESTAMP WITH TIME ZONE,
    last_failure_reason TEXT,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    next_reminder_at TIMESTAMP WITH TIME ZONE,
    account_suspended_at TIMESTAMP WITH TIME ZONE,
    resolution VARCHAR(100),
    -- Resolution: payment_succeeded, manual_payment, written_off, canceled
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dunning events log (audit trail)
CREATE TABLE IF NOT EXISTS dunning_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dunning_record_id UUID NOT NULL REFERENCES dunning_records(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    -- Event types: dunning_started, payment_retry_failed, payment_retry_success,
    -- reminder_sent, account_suspended, account_reactivated, dunning_resolved, etc.
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dunning emails sent
CREATE TABLE IF NOT EXISTS dunning_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    dunning_record_id UUID REFERENCES dunning_records(id) ON DELETE SET NULL,
    email_type VARCHAR(100) NOT NULL,
    -- Types: payment_failed, reminder_1, reminder_2, reminder_final,
    -- account_suspended, account_will_cancel
    recipient VARCHAR(255) NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_dunning_tenant ON dunning_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dunning_status ON dunning_records(status);
CREATE INDEX IF NOT EXISTS idx_dunning_next_retry ON dunning_records(next_retry_at) WHERE status IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_dunning_next_reminder ON dunning_records(next_reminder_at) WHERE status IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_dunning_first_failed ON dunning_records(first_failed_at);
CREATE INDEX IF NOT EXISTS idx_dunning_events_record ON dunning_events(dunning_record_id);
CREATE INDEX IF NOT EXISTS idx_dunning_emails_tenant ON dunning_emails(tenant_id);

-- Add suspension columns to tenants if they don't exist
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS suspension_reason VARCHAR(100);

-- Comments for documentation
COMMENT ON TABLE dunning_records IS 'Tracks failed payment recovery attempts';
COMMENT ON TABLE dunning_events IS 'Audit log of all dunning-related events';
COMMENT ON TABLE dunning_emails IS 'Log of dunning emails sent to tenants';
COMMENT ON COLUMN dunning_records.status IS 'pending: new record, in_progress: retrying, max_retries: exhausted retries, suspended: account suspended, resolved: payment received, canceled: written off';
COMMENT ON COLUMN dunning_records.resolution IS 'How the dunning was resolved: payment_succeeded, manual_payment, written_off, canceled';

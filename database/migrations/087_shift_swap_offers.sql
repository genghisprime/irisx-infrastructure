-- Migration: 087_shift_swap_offers.sql
-- Description: Peer-to-peer shift swap and offer system
-- Created: 2026-02-16

-- ============================================
-- SHIFT OFFERS (Peer-to-Peer Trading)
-- ============================================

-- Shift offers table for give-away and trade offers
CREATE TABLE IF NOT EXISTS shift_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES scheduled_shifts(id) ON DELETE CASCADE,
    offering_agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Offer details
    offer_type VARCHAR(20) NOT NULL CHECK (offer_type IN ('giveaway', 'trade')),
    preferred_trade_date DATE, -- For trade type offers
    notes TEXT,

    -- Claim tracking
    claimed_by_agent_id UUID REFERENCES users(id),
    claimed_at TIMESTAMPTZ,

    -- Approval tracking
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'completed', 'cancelled', 'expired')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Offer notifications (track who was notified)
CREATE TABLE IF NOT EXISTS shift_offer_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL REFERENCES shift_offers(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notified_at TIMESTAMPTZ DEFAULT NOW(),
    notification_method VARCHAR(20) DEFAULT 'in_app', -- in_app, email, sms
    viewed_at TIMESTAMPTZ,

    UNIQUE(offer_id, agent_id)
);

-- Offer activity log
CREATE TABLE IF NOT EXISTS shift_offer_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL REFERENCES shift_offers(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL, -- created, viewed, claimed, approved, cancelled, expired
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SHIFT SWAPS ENHANCEMENTS
-- ============================================

-- Add decline tracking to shift_swaps if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'shift_swaps' AND column_name = 'declined_by'
    ) THEN
        ALTER TABLE shift_swaps ADD COLUMN declined_by UUID REFERENCES users(id);
        ALTER TABLE shift_swaps ADD COLUMN declined_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add swap offer ID reference (for trade swaps)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'shift_swaps' AND column_name = 'related_offer_id'
    ) THEN
        ALTER TABLE shift_swaps ADD COLUMN related_offer_id UUID REFERENCES shift_offers(id);
    END IF;
END $$;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_shift_offers_tenant ON shift_offers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shift_offers_agent ON shift_offers(offering_agent_id, status);
CREATE INDEX IF NOT EXISTS idx_shift_offers_status ON shift_offers(status, created_at);
CREATE INDEX IF NOT EXISTS idx_shift_offers_shift ON shift_offers(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_offers_claimed_by ON shift_offers(claimed_by_agent_id);

CREATE INDEX IF NOT EXISTS idx_shift_offer_notifications_offer ON shift_offer_notifications(offer_id);
CREATE INDEX IF NOT EXISTS idx_shift_offer_notifications_agent ON shift_offer_notifications(agent_id, viewed_at);

CREATE INDEX IF NOT EXISTS idx_shift_offer_activity_offer ON shift_offer_activity(offer_id);

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_shift_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_shift_offers_updated_at ON shift_offers;
CREATE TRIGGER trigger_shift_offers_updated_at
    BEFORE UPDATE ON shift_offers
    FOR EACH ROW
    EXECUTE FUNCTION update_shift_offers_updated_at();

-- ============================================
-- AUTO-EXPIRE OLD OFFERS
-- ============================================

-- Function to expire old offers (run via cron job)
CREATE OR REPLACE FUNCTION expire_old_shift_offers()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE shift_offers so
    SET status = 'expired', updated_at = NOW()
    FROM scheduled_shifts sch
    WHERE so.shift_id = sch.id
      AND so.status = 'open'
      AND sch.date < CURRENT_DATE;

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- AGENT PREFERENCES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS agent_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    preference_type VARCHAR(50) NOT NULL, -- 'shift_types', 'weekly_hours', 'notifications', etc.
    preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(agent_id, preference_type)
);

CREATE INDEX IF NOT EXISTS idx_agent_preferences_agent ON agent_preferences(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_preferences_tenant ON agent_preferences(tenant_id);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE shift_offers IS 'Peer-to-peer shift offers (giveaway/trade)';
COMMENT ON TABLE agent_preferences IS 'Agent work preferences (shift types, hours, etc.)';
COMMENT ON TABLE shift_offer_notifications IS 'Notification tracking for shift offers';
COMMENT ON TABLE shift_offer_activity IS 'Activity log for shift offers';

COMMENT ON COLUMN shift_offers.offer_type IS 'Type: giveaway (no exchange) or trade (wants shift in return)';
COMMENT ON COLUMN shift_offers.preferred_trade_date IS 'For trade offers - preferred date for exchange shift';

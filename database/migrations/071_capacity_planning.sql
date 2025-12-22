-- Migration: 071_capacity_planning.sql
-- Description: Capacity planning and forecasting tables
-- Date: 2025-12-16

-- Capacity metrics table for tracking resource utilization
CREATE TABLE IF NOT EXISTS capacity_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL,
    current_value DECIMAL(15, 2) NOT NULL,
    max_capacity DECIMAL(15, 2) NOT NULL,
    utilization_percent DECIMAL(5, 2),
    tenant_id UUID REFERENCES tenants(id),
    metadata JSONB DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Capacity forecasts table
CREATE TABLE IF NOT EXISTS capacity_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL,
    forecast_horizon VARCHAR(20) NOT NULL,
    forecast_data JSONB NOT NULL,
    trend_analysis JSONB,
    recommendations JSONB DEFAULT '[]'::jsonb,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Capacity alerts table
CREATE TABLE IF NOT EXISTS capacity_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    current_value DECIMAL(15, 2),
    threshold DECIMAL(15, 2),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Capacity scaling actions table
CREATE TABLE IF NOT EXISTS capacity_scaling_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL,
    action_type VARCHAR(30) NOT NULL, -- scale_up, scale_down, optimize
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, executing, completed, failed
    previous_capacity DECIMAL(15, 2),
    new_capacity DECIMAL(15, 2),
    cost_impact_monthly DECIMAL(10, 2),
    recommendation_id UUID,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_capacity_metrics_type ON capacity_metrics(resource_type);
CREATE INDEX IF NOT EXISTS idx_capacity_metrics_recorded ON capacity_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_capacity_metrics_type_time ON capacity_metrics(resource_type, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_capacity_metrics_tenant ON capacity_metrics(tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_capacity_forecasts_type ON capacity_forecasts(resource_type);
CREATE INDEX IF NOT EXISTS idx_capacity_forecasts_generated ON capacity_forecasts(generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_capacity_alerts_severity ON capacity_alerts(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capacity_alerts_resource ON capacity_alerts(resource_type);
CREATE INDEX IF NOT EXISTS idx_capacity_alerts_unresolved ON capacity_alerts(resolved_at) WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_capacity_scaling_status ON capacity_scaling_actions(status);

-- Create hypertable-like partitioning for time-series data (if TimescaleDB available)
-- For regular Postgres, we'll use range partitioning
DO $$
BEGIN
  -- Check if we can create partitions (Postgres 10+)
  IF current_setting('server_version_num')::integer >= 100000 THEN
    -- Create partitioned version if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_partitioned_table WHERE partrelid = 'capacity_metrics'::regclass) THEN
      -- Note: Partitioning would need to be set up during initial table creation
      -- For existing tables, we rely on the index strategy
      RAISE NOTICE 'Capacity metrics table exists, using index-based optimization';
    END IF;
  END IF;
END $$;

-- Function to clean up old capacity metrics (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_capacity_metrics()
RETURNS void AS $$
BEGIN
  DELETE FROM capacity_metrics
  WHERE recorded_at < NOW() - INTERVAL '90 days';

  DELETE FROM capacity_forecasts
  WHERE generated_at < NOW() - INTERVAL '30 days';

  DELETE FROM capacity_alerts
  WHERE resolved_at IS NOT NULL
    AND resolved_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job placeholder (would use pg_cron in production)
COMMENT ON FUNCTION cleanup_old_capacity_metrics() IS
  'Call this function daily to clean up old capacity metrics data. Schedule with pg_cron or external scheduler.';

-- Insert initial seed data for testing
INSERT INTO capacity_metrics (resource_type, current_value, max_capacity, utilization_percent)
VALUES
  ('api_requests', 15000, 100000, 15.0),
  ('database_connections', 45, 500, 9.0),
  ('database_storage', 25, 500, 5.0),
  ('redis_memory', 2, 16, 12.5),
  ('telephony_channels', 120, 1000, 12.0),
  ('concurrent_calls', 85, 500, 17.0),
  ('s3_storage', 150, 5000, 3.0),
  ('agent_sessions', 45, 2000, 2.25)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE capacity_metrics IS 'Time-series data for resource utilization tracking';
COMMENT ON TABLE capacity_forecasts IS 'Cached capacity forecasts with trend analysis';
COMMENT ON TABLE capacity_alerts IS 'Capacity threshold alerts requiring attention';
COMMENT ON TABLE capacity_scaling_actions IS 'Scaling action requests and their status';

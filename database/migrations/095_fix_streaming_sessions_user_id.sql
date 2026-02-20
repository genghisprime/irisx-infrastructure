-- Migration: 095_fix_streaming_sessions_user_id.sql
-- Description: Add user_id column to streaming_sessions if it doesn't exist
-- Date: February 19, 2026

-- Add user_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'streaming_sessions'
        AND column_name = 'user_id'
    ) THEN
        ALTER TABLE streaming_sessions
        ADD COLUMN user_id INTEGER;

        -- Add index for user_id
        CREATE INDEX IF NOT EXISTS idx_streaming_sessions_user_id
        ON streaming_sessions(user_id);
    END IF;
END $$;

-- Update existing rows to have a default user_id of 1 (demo user)
UPDATE streaming_sessions SET user_id = 1 WHERE user_id IS NULL;

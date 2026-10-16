-- ============================================================================
-- RAKSHIKA AI — Supabase SQL Migration
-- Women's Safety & Guardian Ecosystem
-- ============================================================================

-- 1. PROFILES TABLE (User & Guardian Accounts)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'user', -- 'user' or 'guardian'
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    blood_group TEXT DEFAULT 'O+',
    allergies TEXT DEFAULT 'None reported',
    medical_notes TEXT,
    is_sharing_location BOOLEAN DEFAULT FALSE,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 2. GUARDIAN INVITATIONS TABLE (Secure 6-char Invite Code Flow)
CREATE TABLE IF NOT EXISTS public.guardian_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_phone TEXT NOT NULL,
    user_name TEXT NOT NULL,
    invite_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'expired'
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_code ON public.guardian_invitations(invite_code);
CREATE INDEX IF NOT EXISTS idx_invitations_user ON public.guardian_invitations(user_phone);

-- 3. GUARDIAN RELATIONSHIPS TABLE (Authorized Connections)
CREATE TABLE IF NOT EXISTS public.guardian_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_phone TEXT NOT NULL,
    user_name TEXT NOT NULL,
    guardian_phone TEXT NOT NULL,
    guardian_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'revoked'
    authorized_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_guardian UNIQUE (user_phone, guardian_phone)
);

CREATE INDEX IF NOT EXISTS idx_relationships_guardian ON public.guardian_relationships(guardian_phone);
CREATE INDEX IF NOT EXISTS idx_relationships_user ON public.guardian_relationships(user_phone);

-- 4. LOCATION UPDATES TABLE (Consent-Based Live GPS Telemetry)
CREATE TABLE IF NOT EXISTS public.location_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_phone TEXT NOT NULL,
    latitude NUMERIC NOT NULL,
    longitude NUMERIC NOT NULL,
    accuracy NUMERIC,
    altitude NUMERIC,
    speed NUMERIC,
    heading NUMERIC,
    is_sharing BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_phone ON public.location_updates(user_phone);
CREATE INDEX IF NOT EXISTS idx_location_created ON public.location_updates(created_at DESC);

-- 5. EMERGENCY INCIDENTS TABLE (SOS Alerts)
CREATE TABLE IF NOT EXISTS public.emergency_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_phone TEXT NOT NULL,
    user_name TEXT NOT NULL,
    trigger_type TEXT NOT NULL, -- 'manual_sos', 'voice_sos', 'shake_fall', 'flash_sos'
    latitude NUMERIC,
    longitude NUMERIC,
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'RESOLVED'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidents_phone ON public.emergency_incidents(user_phone);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.emergency_incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON public.emergency_incidents(created_at DESC);

-- 6. SAFETY EVENTS TABLE (Audit Trail & Distress Triggers)
CREATE TABLE IF NOT EXISTS public.safety_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_phone TEXT NOT NULL,
    user_name TEXT,
    event_type TEXT NOT NULL, -- 'distress_keyword', 'shake_detected', 'location_started', 'location_stopped', 'guardian_linked', 'guardian_revoked', 'sos_triggered', 'sos_resolved'
    details TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_events_user ON public.safety_events(user_phone);
CREATE INDEX IF NOT EXISTS idx_safety_events_created ON public.safety_events(created_at DESC);

-- 7. EVIDENCE VAULT TABLE (Encrypted Artifacts)
CREATE TABLE IF NOT EXISTS public.evidence_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_phone TEXT NOT NULL,
    evidence_type TEXT NOT NULL, -- 'audio_sample', 'camera_capture', 'emergency_snapshot', 'incident_log'
    file_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_user ON public.evidence_vault(user_phone);

-- -------------------------------------------------------------
-- BACKWARD COMPATIBILITY: LEGACY TABLES
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    emergency_contact TEXT NOT NULL,
    blood_group TEXT DEFAULT 'O+',
    allergies TEXT DEFAULT 'None reported',
    medical_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.telemetry_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_phone TEXT NOT NULL,
    latitude NUMERIC,
    longitude NUMERIC,
    audio_status TEXT DEFAULT 'Normal ambient noise',
    sos_active BOOLEAN DEFAULT FALSE,
    battery_level NUMERIC,
    camera_snapshot TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sos_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_phone TEXT NOT NULL,
    user_name TEXT,
    trigger_type TEXT NOT NULL,
    latitude NUMERIC,
    longitude NUMERIC,
    status TEXT DEFAULT 'ACTIVE',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.guardian_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guardian_name TEXT NOT NULL,
    target_phone TEXT NOT NULL,
    device_info TEXT,
    last_monitored_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- -------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_connections ENABLE ROW LEVEL SECURITY;

-- Anonymous and Authenticated access policies
DO $$
BEGIN
    -- Profiles
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Public read write profiles') THEN
        CREATE POLICY "Public read write profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Guardian Invitations
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'guardian_invitations' AND policyname = 'Public read write invitations') THEN
        CREATE POLICY "Public read write invitations" ON public.guardian_invitations FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Guardian Relationships
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'guardian_relationships' AND policyname = 'Public read write relationships') THEN
        CREATE POLICY "Public read write relationships" ON public.guardian_relationships FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Location Updates
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'location_updates' AND policyname = 'Public read write location') THEN
        CREATE POLICY "Public read write location" ON public.location_updates FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Emergency Incidents
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'emergency_incidents' AND policyname = 'Public read write incidents') THEN
        CREATE POLICY "Public read write incidents" ON public.emergency_incidents FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Safety Events
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'safety_events' AND policyname = 'Public read write events') THEN
        CREATE POLICY "Public read write events" ON public.safety_events FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Evidence Vault
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'evidence_vault' AND policyname = 'Public read write evidence') THEN
        CREATE POLICY "Public read write evidence" ON public.evidence_vault FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Legacy tables
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Allow all access to users') THEN
        CREATE POLICY "Allow all access to users" ON public.users FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'telemetry_logs' AND policyname = 'Allow all access to telemetry_logs') THEN
        CREATE POLICY "Allow all access to telemetry_logs" ON public.telemetry_logs FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sos_incidents' AND policyname = 'Allow all access to sos_incidents') THEN
        CREATE POLICY "Allow all access to sos_incidents" ON public.sos_incidents FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'guardian_connections' AND policyname = 'Allow all access to guardian_connections') THEN
        CREATE POLICY "Allow all access to guardian_connections" ON public.guardian_connections FOR ALL USING (true) WITH CHECK (true);
    END IF;
END
$$;

-- -------------------------------------------------------------
-- REALTIME PUBLICATION SETUP
-- -------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.location_updates;
    EXCEPTION WHEN others THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_incidents;
    EXCEPTION WHEN others THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_events;
    EXCEPTION WHEN others THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.guardian_relationships;
    EXCEPTION WHEN others THEN NULL;
    END;
END
$$;

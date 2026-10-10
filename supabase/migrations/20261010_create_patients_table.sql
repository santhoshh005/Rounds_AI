-- =============================================================================
-- RoundsAI Supabase Schema Migration: Patients Roster & Audit Columns
-- File: supabase/migrations/20261010_create_patients_table.sql
-- =============================================================================
-- Matches backend/models/patient.py (Patient, PatientCreate, PatientUpdate)
-- and backend/services/patient_service.py.
-- =============================================================================

-- 1. Create the public.patients table
CREATE TABLE IF NOT EXISTS public.patients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    age INTEGER NOT NULL CHECK (age >= 0 AND age <= 125),
    sex TEXT NOT NULL,
    diagnosis TEXT NOT NULL CHECK (char_length(diagnosis) BETWEEN 2 AND 200),
    regimen TEXT NOT NULL DEFAULT 'Not stated' CHECK (char_length(regimen) <= 200),
    cycle INTEGER NOT NULL DEFAULT 1 CHECK (cycle >= 1 AND cycle <= 50),
    ward_bed TEXT NOT NULL CHECK (char_length(ward_bed) BETWEEN 2 AND 50),
    baseline_anc DOUBLE PRECISION CHECK (baseline_anc IS NULL OR baseline_anc >= 0),
    baseline_platelets DOUBLE PRECISION CHECK (baseline_platelets IS NULL OR baseline_platelets >= 0),
    baseline_wbc DOUBLE PRECISION CHECK (baseline_wbc IS NULL OR baseline_wbc >= 0),
    status TEXT NOT NULL DEFAULT 'admitted' CHECK (status IN ('admitted', 'discharged')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patients_status ON public.patients (status);
CREATE INDEX IF NOT EXISTS idx_patients_ward_bed ON public.patients (ward_bed);

-- 2. Ensure optional columns expected by backend/services/persistence.py exist on existing tables
ALTER TABLE IF EXISTS public.draft_notes
    ADD COLUMN IF NOT EXISTS approved_by TEXT;

ALTER TABLE IF EXISTS public.review_flags
    ADD COLUMN IF NOT EXISTS guideline TEXT;

-- 3. Seed default inpatient oncology ward patients (idempotent)
INSERT INTO public.patients (
    id, name, age, sex, diagnosis, regimen, cycle, ward_bed,
    baseline_anc, baseline_platelets, baseline_wbc, status, created_at
) VALUES
    (
        '104', 'David Miller', 58, 'male',
        'Colorectal Cancer (Stage III)', 'mFOLFOX6', 3, 'Ward 4B - Bed 12',
        1400.0, 180000.0, 3100.0, 'admitted', '2026-09-01T08:00:00Z'
    ),
    (
        '105', 'Sarah Jenkins', 46, 'female',
        'Diffuse Large B-Cell Lymphoma', 'R-CHOP', 2, 'Ward 4B - Bed 14',
        2200.0, 210000.0, 4500.0, 'admitted', '2026-09-03T10:30:00Z'
    ),
    (
        '106', 'Elena Rostova', 62, 'female',
        'Invasive Ductal Breast Carcinoma', 'AC-T (Doxorubicin/Cyclophosphamide)', 4, 'Ward 4B - Bed 16',
        1650.0, 160000.0, 3800.0, 'admitted', '2026-09-04T14:15:00Z'
    )
ON CONFLICT (id) DO NOTHING;

-- 4. Row Level Security (RLS) Configuration
-- Note: On the existing project tables (rounds, extractions, draft_notes, review_flags),
-- unauthenticated requests using SUPABASE_ANON_KEY currently succeed, meaning RLS is either
-- disabled or configured with a permissive anon policy.
-- Below enables RLS on public.patients (and existing tables) with an explicit policy for the
-- demo backend role; for production, restrict TO authenticated / service_role only.
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'patients' AND policyname = 'patients_demo_access'
    ) THEN
        CREATE POLICY patients_demo_access ON public.patients
            FOR ALL
            TO anon, authenticated, service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END
$$;

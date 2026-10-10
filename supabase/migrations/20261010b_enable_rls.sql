-- =============================================================================
-- RoundsAI Supabase Schema Migration (Part 2 of 2): Enable Row Level Security
-- File: supabase/migrations/20261010b_enable_rls.sql
-- =============================================================================
-- ⚠️  PREREQUISITES — run this file ONLY after:
--     1. SUPABASE_SERVICE_ROLE_KEY is set in your backend .env
--     2. The backend is verified working (health check passes, rounds can be saved)
--     3. Migration 20261010a_create_patients_table.sql has been applied
--
-- After this migration, unauthenticated calls using the anon key will be blocked
-- on all tables unless you add permissive policies explicitly. The service_role
-- key bypasses RLS and is always allowed for backend operations.
-- =============================================================================

-- 1. Enable RLS on the patients table
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- 2. Enable RLS on existing operational tables
ALTER TABLE IF EXISTS public.rounds           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.extractions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.labs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.review_flags     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.draft_notes      ENABLE ROW LEVEL SECURITY;

-- 3. Service-role bypass policies (allow backend operations via SUPABASE_SERVICE_ROLE_KEY)
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['patients', 'rounds', 'extractions', 'labs', 'review_flags', 'draft_notes']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = tbl
              AND policyname = tbl || '_service_role_full_access'
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
                tbl || '_service_role_full_access', tbl
            );
        END IF;
    END LOOP;
END
$$;

-- ── ON DELETE CASCADE Reference ───────────────────────────────────────
-- These foreign keys in supabase_schema.sql ensure child rows are deleted
-- automatically when a parent round is deleted:
--
--   extractions  : FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE
--   labs         : FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE
--   review_flags : FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE
--   draft_notes  : FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE
--
-- ── Cleanup Preview SELECTs (read-only, safe to run anytime) ──────────
-- These queries show exactly what each DELETE block would remove,
-- without actually deleting anything.

-- Preview: what DELETE FROM public.rounds WHERE patient_id = '104' would remove
-- (all child rows cascade automatically):
--
-- SELECT 'rounds' AS table_name, id, created_at FROM public.rounds WHERE patient_id = '104'
-- UNION ALL
-- SELECT 'extractions', e.id, e.created_at FROM public.extractions e
--   JOIN public.rounds r ON r.id = e.round_id WHERE r.patient_id = '104'
-- UNION ALL
-- SELECT 'labs', l.id::TEXT, l.created_at FROM public.labs l
--   JOIN public.rounds r ON r.id = l.round_id WHERE r.patient_id = '104'
-- UNION ALL
-- SELECT 'review_flags', f.id::TEXT, f.created_at FROM public.review_flags f
--   JOIN public.rounds r ON r.id = f.round_id WHERE r.patient_id = '104'
-- UNION ALL
-- SELECT 'draft_notes', n.id, n.created_at FROM public.draft_notes n
--   JOIN public.rounds r ON r.id = n.round_id WHERE r.patient_id = '104'
-- ORDER BY table_name, created_at;

-- ── Verification Query ────────────────────────────────────────────────
-- Run after applying this migration to confirm RLS is enabled on all tables:
--
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('patients', 'rounds', 'extractions', 'labs', 'review_flags', 'draft_notes')
-- ORDER BY tablename;
--
-- Expected: rowsecurity = TRUE for all 6 rows.

-- Workplace Personality Profile definition, created as an unpublished DRAFT.
-- The statements and scoring live in code (functions/lib/hpi-personality-source.js, IPIP-50, public
-- domain); the version payload only marks the format. Nothing opens from this migration: an admin
-- must publish the draft in /admin/assessments with the content and privacy approvals and an
-- approval reference, and the Pages variable ENABLE_HPI_PERSONALITY must be "true".
INSERT INTO assessment_definitions (id, slug, client_name, title, duration_seconds, current_version_id, status, created_at, updated_at)
VALUES ('6f1c2a90-9b5e-4c1d-8e3a-0d7b5a2f4c11', 'workplace-personality-profile', 'Talent Tree', 'Workplace Personality Profile', 3600,
        NULL, 'draft', '2026-11-25T00:00:00.000Z', '2026-11-25T00:00:00.000Z')
ON CONFLICT(slug) DO NOTHING;

INSERT INTO assessment_versions (id, definition_id, version_label, question_payload_json, scoring_key_json, scoring_engine_version, published_at, created_at)
SELECT '6f1c2a90-9b5e-4c1d-8e3a-0d7b5a2f4c12', d.id, 'v1',
       '{"format":"personality-v1","form_version":"hpi-2026-pilot-2","_metadata":{"title":"Workplace Personality Profile","client_name":"Talent Tree"}}',
       '{}', 'hpi-raw-v2', NULL, '2026-11-25T00:00:00.000Z'
FROM assessment_definitions d WHERE d.slug='workplace-personality-profile'
ON CONFLICT(id) DO NOTHING;

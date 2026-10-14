-- Adds the 6 Seedance renders made outside the app (with scripts) to the usage log, under
-- bananabondismyth@gmail.com, so the owner dashboard counts their cost (about $38).
-- No credits are charged. Safe to run twice: a render already added (same label) is skipped.
-- The rest of the app ignores these rows (mode "outside_app" has no video, review or operation).

INSERT INTO public.usage_logs (
  user_id, user_email, provider, model, feature, input_tokens, output_tokens, total_tokens,
  image_count, video_seconds, estimated_cost_usd, credit_cost, created_at, metadata
)
SELECT
  u.id, u.email, 'byteplus', 'dreamina-seedance-2-5-260628', 'video_generation', 0, r.tokens, r.tokens,
  0, r.seconds, round(r.tokens * r.usd_per_million / 1000000.0, 6), 0, r.at,
  jsonb_build_object(
    'mode', 'outside_app', 'newVideo', r.new_video, 'label', r.label, 'taskId', r.task_id, 'tokens', r.tokens,
    'quality', CASE WHEN r.resolution = '480p' THEN 'draft' ELSE r.resolution END, 'resolution', r.resolution,
    'durationSeconds', r.seconds, 'aspectRatio', '9:16', 'videoEngine', 'seedance',
    'videoModel', 'dreamina-seedance-2-5-260628', 'source', 'script', 'addedAt', '2026-10-14',
    'note', 'Rendered with a script outside the app; added so the dashboard counts its cost. No credits were charged.'
  )
FROM auth.users u
CROSS JOIN (VALUES
  ('Neeksha film test · 15 s 1080p',                               NULL,                       timestamptz '2026-09-29 12:00:00+08', 15, '1080p',  731025, 11.7, true),
  ('Colorland Treetop ad v1 · 30 s draft',                         'cgt-20261002201822-5umqr', timestamptz '2026-10-02 20:18:22+08', 30, '480p',   288625, 10.7, true),
  ('Colorland Treetop ad v2 · 30 s draft',                         'cgt-20261002205359-j79i7', timestamptz '2026-10-02 20:53:59+08', 30, '480p',   288625, 10.7, true),
  ('Colorland Treetop ad v4b · 30 s draft',                        'cgt-20261002212202-vebz5', timestamptz '2026-10-02 21:22:02+08', 30, '480p',   288625, 10.7, true),
  ('Colorland Treetop ad v5 · 30 s draft',                         'cgt-20261003151859-zvwso', timestamptz '2026-10-03 15:18:59+08', 30, '480p',   288625, 10.7, true),
  ('Colorland Treetop ad final · 30 s 1080p (from the v5 draft)',  'cgt-20261003154524-y55me', timestamptz '2026-10-03 15:45:24+08', 30, '1080p', 1460025, 11.7, false)
) AS r(label, task_id, at, seconds, resolution, tokens, usd_per_million, new_video)
WHERE lower(u.email) = 'bananabondismyth@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.usage_logs l
    WHERE l.user_id = u.id AND l.metadata->>'mode' = 'outside_app' AND l.metadata->>'label' = r.label
  );

-- What is there now (6 rows, about $37.99 in all):
SELECT metadata->>'label' AS render, video_seconds AS seconds, estimated_cost_usd AS usd
FROM public.usage_logs WHERE metadata->>'mode' = 'outside_app' ORDER BY created_at;

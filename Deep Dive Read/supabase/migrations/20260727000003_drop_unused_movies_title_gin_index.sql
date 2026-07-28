-- Finding #21: Drop unused movies_title_idx GIN index
-- This full-text search index is never queried (app does client-side filtering)
-- Removing it saves storage and improves INSERT/UPDATE performance

DROP INDEX IF EXISTS public.movies_title_idx;

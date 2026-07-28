-- Finding #8: Add composite index on movies(list_id, position) for faster sorted queries
-- Used by getList() in data.functions.ts which does ORDER BY position
-- This allows index-only scan for "WHERE list_id = ? ORDER BY position"

CREATE INDEX IF NOT EXISTS movies_list_id_position_idx ON public.movies(list_id, position NULLS LAST);

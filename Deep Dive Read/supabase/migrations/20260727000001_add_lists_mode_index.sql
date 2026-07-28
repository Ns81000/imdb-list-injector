-- Finding #7: Add index on lists.mode column for faster WHERE mode = ? queries
-- Used by listLists() and listMovies() in data.functions.ts
-- This eliminates sequential scans when filtering by mode

CREATE INDEX IF NOT EXISTS lists_mode_idx ON public.lists(mode);

-- Finding #19: Add composite index on lists(mode, last_refreshed) for covering index optimization
-- Used by listLists() which filters by mode and sorts by last_refreshed
-- This allows index-only scan for the common query pattern
-- Note: This makes lists_mode_idx partially redundant, but keeping both doesn't hurt

CREATE INDEX IF NOT EXISTS lists_mode_last_refreshed_idx ON public.lists(mode, last_refreshed DESC NULLS LAST);

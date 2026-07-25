
-- lists
CREATE TABLE public.lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled List',
  url TEXT,
  movie_count INTEGER NOT NULL DEFAULT 0,
  last_refreshed TIMESTAMPTZ,
  mode TEXT NOT NULL DEFAULT 'watching' CHECK (mode IN ('watching','watched')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
GRANT ALL ON public.lists TO service_role;
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (via admin client) may access.

-- movies
CREATE TABLE public.movies (
  imdb_id TEXT NOT NULL,
  list_id TEXT NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  position INTEGER,
  type TEXT,
  title TEXT NOT NULL,
  year TEXT,
  rating TEXT,
  votes TEXT,
  genre TEXT,
  content_rating TEXT,
  duration TEXT,
  description TEXT,
  imdb_url TEXT,
  keywords TEXT[],
  credits JSONB,
  PRIMARY KEY (imdb_id, list_id)
);
GRANT ALL ON public.movies TO service_role;
CREATE INDEX movies_list_id_idx ON public.movies(list_id);
CREATE INDEX movies_title_idx ON public.movies USING GIN (to_tsvector('english', title));
ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;

-- app_settings
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- sync_log
CREATE TABLE public.sync_log (
  id BIGSERIAL PRIMARY KEY,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mode TEXT NOT NULL,
  lists_count INTEGER,
  movies_count INTEGER,
  status TEXT NOT NULL DEFAULT 'complete'
);
GRANT ALL ON public.sync_log TO service_role;
CREATE INDEX sync_log_synced_at_idx ON public.sync_log(synced_at DESC);
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

-- updated_at trigger for lists
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER lists_set_updated_at
BEFORE UPDATE ON public.lists
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

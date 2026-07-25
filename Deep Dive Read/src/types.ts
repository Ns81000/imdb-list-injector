export type Mode = "watching" | "watched";

export interface List {
  id: string;
  name: string;
  url: string | null;
  movie_count: number;
  last_refreshed: string | null;
  mode: Mode;
  created_at?: string;
  updated_at?: string;
}

export interface Credits {
  Director?: string[];
  Writers?: string[];
  Producers?: string[];
  Cast?: string[];
}

export interface Movie {
  imdb_id: string;
  list_id: string;
  position: number | null;
  type: string | null;
  title: string;
  year: string | null;
  rating: string | null;
  votes: string | null;
  genre: string | null;
  content_rating: string | null;
  duration: string | null;
  description: string | null;
  imdb_url: string | null;
  keywords: string[] | null;
  credits: Credits | null;
}

export interface SyncStatusRow {
  synced_at: string;
  mode: string;
  lists_count: number | null;
  movies_count: number | null;
  status: string;
}

export interface AuthStatus {
  setup: boolean; // whether a password has been created
  authenticated: boolean; // whether the current session is authed
}

export interface TmdbResolveResponse {
  imdbId: string;
  tmdbId: number | null;
  mediaType: "movie" | "tv" | null;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  hasImages: boolean;
}

export interface TmdbPersonResponse {
  name: string;
  tmdbId: number | null;
  profilePath: string | null;
  knownFor: string;
}

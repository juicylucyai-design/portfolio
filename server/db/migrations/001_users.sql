-- Users module: people who can sign in, and their sessions.

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE CHECK (username = lower(username) AND length(username) BETWEEN 2 AND 64),
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only a SHA-256 hash of each session token is stored, so a database leak can't be replayed as a login.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

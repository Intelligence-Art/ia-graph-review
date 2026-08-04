-- Toy migration, so that `db/migrations/` exists as a sentinel path.
CREATE TABLE IF NOT EXISTS reservations (
  id      text PRIMARY KEY,
  user_id text NOT NULL,
  amount  bigint NOT NULL
);

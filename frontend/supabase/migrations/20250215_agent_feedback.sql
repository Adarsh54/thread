-- Stores user feedback (like/dislike) on agent-recommended products.
-- Used for in-context learning: the agent loads recent feedback to understand
-- user taste and improve recommendations across sessions.

create table if not exists agent_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null,
  product_name text not null default '',
  liked boolean not null,
  created_at timestamptz not null default now()
);

-- Index for fast lookup by user
create index if not exists idx_agent_feedback_user
  on agent_feedback(user_id, created_at desc);

-- Unique constraint: one feedback per user per product (latest wins via upsert)
create unique index if not exists idx_agent_feedback_user_product
  on agent_feedback(user_id, product_id);

-- RLS: users can only read/write their own feedback
alter table agent_feedback enable row level security;

create policy "Users can read own feedback"
  on agent_feedback for select
  using (auth.uid() = user_id);

create policy "Users can insert own feedback"
  on agent_feedback for insert
  with check (auth.uid() = user_id);

create policy "Users can update own feedback"
  on agent_feedback for update
  using (auth.uid() = user_id);

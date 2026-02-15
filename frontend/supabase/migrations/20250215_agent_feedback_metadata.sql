-- Add metadata column to store rich product details (brand, price, category, description)
-- for better agent learning across sessions.

alter table agent_feedback
  add column if not exists metadata jsonb default '{}';

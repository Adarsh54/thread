-- Search RPC: semantic similarity via pgvector
-- Run this AFTER the products table exists with: id, name, description, image_url, price, category, brand, source, metadata (jsonb), embedding vector(1536).
-- Re-run if you add brand/source to the table so the RPC returns them.

create or replace function match_products(
  query_embedding vector(1536),
  match_limit int default 20,
  match_threshold float default 0,
  filter_category text default null
)
returns table (
  id uuid,
  name text,
  description text,
  image_url text,
  price numeric,
  category text,
  brand text,
  source text,
  metadata jsonb,
  similarity float
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    p.id,
    p.name,
    p.description,
    p.image_url,
    p.price,
    p.category,
    p.brand,
    p.source,
    p.metadata,
    1 - (p.embedding <=> query_embedding) as similarity
  from products p
  where
    (filter_category is null or p.category = filter_category)
    and (1 - (p.embedding <=> query_embedding)) >= match_threshold
  order by p.embedding <=> query_embedding
  limit match_limit;
end;
$$;

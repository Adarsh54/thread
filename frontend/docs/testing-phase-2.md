# Testing Phase 2 — Semantic Search

Use these steps to confirm semantic search (Elasticsearch or pgvector) works end-to-end.

## Prerequisites

- Dev server running: `npm run dev`
- `.env.local` has at least:
  - **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **Semantic search:** either **Elasticsearch** (`ELASTICSEARCH_URL`, `ELASTICSEARCH_API_KEY`, `ELASTICSEARCH_INFERENCE_ID`, and optionally `ELASTICSEARCH_EMBEDDING_DIMENSION=384`) **or** OpenAI (`OPENAI_API_KEY`) if using pgvector
- Products in Supabase; if using Elasticsearch, products should be synced to the index (see below).

---

## 1. Health check (optional)

If you use **pgvector** (no Elasticsearch), check that the DB and RPC are ready:

```bash
curl -s http://localhost:3000/api/search/health
```

Expected: `{"ok":true,"message":"Schema ready. ..."}`

If you use **Elasticsearch**, this endpoint still checks pgvector; skip it or ignore a negative result.

---

## 2. Sync products to Elasticsearch (if using ES)

If `ELASTICSEARCH_URL` and `ELASTICSEARCH_INFERENCE_ID` are set, sync Supabase → Elasticsearch:

```bash
curl -X POST http://localhost:3000/api/search/index
```

Expected: `{"ok":true,"indexed":N,"total":N,...}`. Run once after adding new products.

---

## 3. Test semantic search API

This is the main Phase 2 check. Call the search API with a query:

```bash
curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"comfortable jeans","limit":5}' | jq
```

Without `jq`: same command but drop `| jq`.

**Success:** JSON with `"data": [ ... ]` and an array of products (each with `id`, `name`, `description`, `image_url`, `price`, `category`, `brand`, `similarity`, etc.).

**Failure:** `"error": "..."` — check env vars, that products exist and (if using ES) that you ran the index step above.

---

## 4. Try a few queries

Run the same `curl` with different queries to see semantic behavior:

- `"query": "summer dress"`
- `"query": "casual sneakers"`
- `"query": "something cozy for winter"`

Results should match **meaning** (e.g. “cozy” → sweaters, warm wear), not just keywords.

---

## 5. Optional: test from the UI

The main app search page may use the **graph** API (`/api/products/graph`), not `/api/search`. To test Phase 2 from the UI you can:

- Open a simple HTML page or use the browser console on any page:
  ```js
  fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'jeans', limit: 10 })
  }).then(r => r.json()).then(console.log)
  ```
- Or add a minimal test page that calls `POST /api/search` and displays the results.

---

## Quick checklist

| Step | Command / check | Pass? |
|------|------------------|--------|
| 1 | `curl -s http://localhost:3000/api/search/health` (pgvector only) | `ok: true` or skip |
| 2 | `curl -X POST http://localhost:3000/api/search/index` (ES only) | `ok: true`, indexed ≥ 1 |
| 3 | `curl -X POST .../api/search -d '{"query":"jeans","limit":5}'` | `data: [ ... ]` with products |
| 4 | Change query, run again | Different results, still relevant |

If step 3 returns product data, **Phase 2 semantic search is working.**

import {
  isElasticsearchConfigured,
} from "@/lib/search/elasticsearch";
import { syncProductsFromSupabase } from "@/lib/search/sync-from-supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/search/index
 * Syncs products from Supabase to Elasticsearch. Optional — search auto-syncs when the index is empty.
 * Use this to force a full re-sync after adding/updating many products.
 */
export async function POST(): Promise<Response> {
  if (!isElasticsearchConfigured()) {
    return Response.json(
      { ok: false, error: "Elasticsearch is not configured (set ELASTICSEARCH_URL)" },
      { status: 400 }
    );
  }

  try {
    const result = await syncProductsFromSupabase();
    return Response.json({
      ok: true,
      ...result,
      errors: result.errors.length ? result.errors.slice(0, 10) : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Indexing failed";
    console.error("[search/index]", err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

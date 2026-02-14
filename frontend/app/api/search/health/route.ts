import { createClient } from "@/lib/supabase/server";
import { SEARCH_CONFIG } from "@/lib/search/config";

export const dynamic = "force-dynamic";

/** Zero vector for health check (no real query). */
const ZERO_EMBEDDING = Array(SEARCH_CONFIG.embeddingDimension).fill(0);

export type SearchHealthResponse =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * GET /api/search/health
 * Verifies that the DB schema is ready: products table + match_products RPC.
 * Call this to confirm your partner's schema is integrated (e.g. from dashboard or CI).
 */
export async function GET(): Promise<Response> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      SEARCH_CONFIG.matchProductsRpc,
      {
        query_embedding: ZERO_EMBEDDING,
        match_limit: 0,
        match_threshold: 0,
        filter_category: null,
      }
    );

    if (error) {
      return Response.json(
        {
          ok: false,
          error: `Schema not ready: ${error.message}. Ensure the products table exists with an embedding column and match_products RPC is deployed.`,
        } satisfies SearchHealthResponse,
        { status: 502 }
      );
    }

    if (!Array.isArray(data)) {
      return Response.json(
        {
          ok: false,
          error: "match_products did not return an array. Check RPC return type.",
        } satisfies SearchHealthResponse,
        { status: 502 }
      );
    }

    return Response.json({
      ok: true,
      message:
        "Schema ready. Products table and match_products RPC are available.",
    } satisfies SearchHealthResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Health check failed";
    return Response.json(
      { ok: false, error: message } satisfies SearchHealthResponse,
      { status: 500 }
    );
  }
}

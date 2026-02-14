import { SEARCH_CONFIG } from "@/lib/search/config";
import { runSemanticSearch } from "@/lib/search/run-semantic-search";
import type { ProductWithScore } from "@/types/product";

export const dynamic = "force-dynamic";

export type SearchResponse =
  | { data: ProductWithScore[]; error: null }
  | { data: null; error: string };

/**
 * POST /api/search
 * Body: { query: string, limit?: number, category?: string }
 * Semantic search (Elasticsearch kNN or pgvector match_products).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const limit = Math.min(
      Number(body.limit) || SEARCH_CONFIG.defaultLimit,
      50
    );
    const category =
      typeof body.category === "string" && body.category.trim()
        ? body.category.trim()
        : null;

    if (!query) {
      return Response.json(
        { data: null, error: "Missing or empty query" } satisfies SearchResponse,
        { status: 400 }
      );
    }

    const products = await runSemanticSearch(query, { limit, category });
    return Response.json({ data: products, error: null } satisfies SearchResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    console.error("[search]", err);
    return Response.json(
      { data: null, error: message } satisfies SearchResponse,
      { status: 500 }
    );
  }
}

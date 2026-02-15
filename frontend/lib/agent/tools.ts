import { runSemanticSearch } from "@/lib/search/run-semantic-search";
import type { Product, ProductWithScore } from "@/types/product";
import type { SearchProductsArgs } from "./types";

/**
 * Gemini function declarations (tools) available to the shopping agent.
 * NOTE: category filter removed — semantic search handles relevance.
 */
export const AGENT_TOOL_DECLARATIONS = [
  {
    name: "search_products",
    description:
      "Search the product catalog using semantic search. The query is matched by meaning, not keywords — so vibe-based, subjective queries work great (e.g. 'cozy earth-tone winter layers', 'clean minimalist going-out fit', 'bold streetwear statement pieces'). Be creative and exploratory with queries rather than overly literal. You may optionally set a max_price filter.",
    parameters: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "A natural language query describing the vibe, aesthetic, or style you're looking for. Semantic search matches by meaning, so describe the mood and feel rather than exact product names.",
        },
        max_price: {
          type: "number",
          description:
            "Optional maximum price in USD. Only return products at or below this price.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "recommend_product",
    description:
      "Recommend a specific product to the user. Call this once for each product you want to recommend. Provide the product_id (the UUID in square brackets from search results) and a personalized explanation.",
    parameters: {
      type: "object" as const,
      properties: {
        product_id: {
          type: "string",
          description: "The exact UUID of the product from search results (e.g. '21168040-3d0e-4feb-826b-0bb39d05e102').",
        },
        reason: {
          type: "string",
          description:
            "A personalized 1-2 sentence explanation of why this product is a great match for the user.",
        },
      },
      required: ["product_id", "reason"],
    },
  },
  {
    name: "finish",
    description:
      "Call this ONLY after you have already called recommend_product at least 4 times. Provide a short summary of the outfit or collection you've curated.",
    parameters: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string",
          description:
            "A brief, friendly summary (2-3 sentences) of the outfit or collection you've put together and why it works for the user.",
        },
      },
      required: ["summary"],
    },
  },
];

// ── Tool handlers ────────────────────────────────────────────────────────────

/** In-memory product cache for the duration of one agent run. */
export class ProductCache {
  private cache = new Map<string, Product>();

  add(products: ProductWithScore[]) {
    for (const p of products) {
      this.cache.set(p.id, p);
    }
  }

  get(id: string): Product | undefined {
    return this.cache.get(id);
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Execute search_products tool: semantic search + optional price filter.
 * Category filter removed — semantic search handles relevance via the query.
 */
export async function executeSearch(
  args: SearchProductsArgs,
  cache: ProductCache
): Promise<ProductWithScore[]> {
  const results = await runSemanticSearch(args.query, {
    limit: 20,
    category: null, // always null — let semantic search handle it
  });

  // Apply price filter if provided
  let filtered = results;
  if (args.max_price != null) {
    filtered = results.filter(
      (p) => p.price != null && p.price <= args.max_price!
    );
  }

  cache.add(filtered);
  return filtered;
}

/**
 * Format search results for the model (compact text representation).
 */
export function formatResultsForModel(
  products: ProductWithScore[]
): string {
  if (products.length === 0) return "No products found for this query.";

  return products
    .slice(0, 15) // Keep context window manageable
    .map((p, i) => {
      const parts = [`${i + 1}. [${p.id}] ${p.name}`];
      if (p.brand) parts.push(`brand: ${p.brand}`);
      if (p.price != null) parts.push(`$${p.price.toFixed(2)}`);
      if (p.category) parts.push(`category: ${p.category}`);
      if (p.description) parts.push(`desc: "${p.description.slice(0, 120)}"`);
      if (p.similarity != null) parts.push(`relevance: ${(p.similarity * 100).toFixed(0)}%`);
      return parts.join(" · ");
    })
    .join("\n");
}

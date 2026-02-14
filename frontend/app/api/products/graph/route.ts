import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { runSemanticSearch } from "@/lib/search/run-semantic-search";

/** Max background nodes for the graph. */
const GRAPH_LIMIT = 500;
/** How many semantic matches to highlight. */
const SEMANTIC_TOP_K = 50;

/**
 * Returns products with 3D positions for the graph view.
 *
 * - When q is set:
 *     1. Fetch ALL products from Supabase (up to limit) → background nodes
 *        in the outer category ring (highlighted: false).
 *     2. Run semantic search for the top 50 matches.
 *     3. Matched nodes get similarity-based inner positions (highlighted: true).
 *        Any matched products not in the initial fetch are added too.
 *
 * - When q is empty:
 *     All products shown in category ring layout, no highlights.
 *
 * Response: { nodes, categories }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = Math.min(Number(searchParams.get("limit") ?? GRAPH_LIMIT), 2000);
  const q = searchParams.get("q")?.trim();

  const supabase = await createClient();

  // Always fetch products for the graph background
  const { data: allProducts, error } = await supabase
    .from("products")
    .select("id, name, image_url, price, category, brand, source, metadata")
    .not("image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Map products by id for easy lookup
  type RawProduct = (typeof allProducts)[number];
  const productById = new Map<string, RawProduct>();
  for (const p of allProducts ?? []) {
    productById.set(p.id, p);
  }

  // If there's a query, run semantic search for the top 50
  const matchMap = new Map<string, number>(); // id → similarity
  if (q) {
    try {
      const matches = await runSemanticSearch(q, {
        limit: SEMANTIC_TOP_K,
        category: null,
      });

      for (const m of matches) {
        matchMap.set(m.id, m.similarity ?? 0.5);
      }

      // Ensure every matched product is in the graph, even if the initial
      // Supabase fetch (limited to `limit`) didn't include it
      const missingIds = matches
        .filter((m) => !productById.has(m.id))
        .map((m) => m.id);

      if (missingIds.length > 0) {
        const { data: extras } = await supabase
          .from("products")
          .select("id, name, image_url, price, category, brand, source, metadata")
          .in("id", missingIds);

        for (const p of extras ?? []) {
          productById.set(p.id, p);
        }
      }
    } catch (err) {
      console.error("[graph] semantic search failed, falling back to all:", err);
    }
  }

  // Build category map from ALL products (including extras)
  const products = [...productById.values()];
  const categoryMap = new Map<string, number>();
  let catIdx = 0;
  for (const p of products) {
    const cat = (p.category ?? "other").toLowerCase();
    if (!categoryMap.has(cat)) categoryMap.set(cat, catIdx++);
  }

  const nodes = products.map((product) => {
    const cat = (product.category ?? "other").toLowerCase();
    const ci = categoryMap.get(cat) ?? 0;
    const total = categoryMap.size || 1;
    const seed = hashCode(product.id);
    const isMatch = matchMap.has(product.id);

    let position: [number, number, number];

    if (q && isMatch) {
      // ── Matched node: similarity-based inner cluster ──
      const sim = matchMap.get(product.id)!;
      // High similarity → small radius (close to center)
      const radius = (1 - sim) * 25 + 5;
      const angle = (ci / Math.max(total, 8)) * Math.PI * 2;
      const jx = seededRandom(seed) * 8 - 4;
      const jy = seededRandom(seed + 1) * 8 - 4;
      const jz = seededRandom(seed + 2) * 8 - 4;
      position = [
        Math.cos(angle) * radius + jx,
        jy,
        Math.sin(angle) * radius + jz,
      ];
    } else {
      // ── Background node: outer category ring ──
      const angle = (ci / Math.max(total, 8)) * Math.PI * 2;
      const radius = 40 + (ci % 3) * 12;
      const jx = seededRandom(seed) * 18 - 9;
      const jy = seededRandom(seed + 1) * 18 - 9;
      const jz = seededRandom(seed + 2) * 18 - 9;
      position = [
        Math.cos(angle) * radius + jx,
        jy,
        Math.sin(angle) * radius + jz,
      ];
    }

    return {
      id: product.id,
      name: product.name,
      image_url: product.image_url,
      price: product.price,
      category: product.category,
      brand: product.brand,
      source: product.source,
      metadata: product.metadata ?? null,
      position,
      highlighted: q ? isMatch : false,
    };
  });

  return NextResponse.json({
    nodes,
    categories: [...categoryMap.keys()],
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

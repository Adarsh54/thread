"use server";

import { createClient } from "@/lib/supabase/server";
import {
  ensureProductsIndex,
  useElasticsearchInference,
  inferEmbeddings,
  indexProducts,
  type ProductDocument,
} from "@/lib/search/elasticsearch";
import { SEARCH_CONFIG } from "@/lib/search/config";

/**
 * Sync products from Supabase into Elasticsearch.
 * When ELASTICSEARCH_INFERENCE_ID is set: fetches all products, generates embeddings via ES inference, then indexes.
 * Otherwise: fetches only products that already have an embedding in Supabase, then indexes.
 */
export async function syncProductsFromSupabase(): Promise<{
  indexed: number;
  total: number;
  skipped: number;
  errors: string[];
}> {
  const supabase = await createClient();
  const useInference = useElasticsearchInference();

  const select = "id, name, description, image_url, price, category, brand, source, metadata" + (useInference ? "" : ", embedding");
  let query = supabase.from(SEARCH_CONFIG.productsTable).select(select);
  if (!useInference) query = query.not("embedding", "is", null);

  const { data: rows, error } = await query;

  if (error) throw new Error(error.message);

  const list = (Array.isArray(rows) ? rows : []) as unknown as Record<string, unknown>[];
  if (list.length === 0) {
    await ensureProductsIndex();
    return { indexed: 0, total: 0, skipped: 0, errors: [] };
  }

  let docs: ProductDocument[];

  if (useInference) {
    const texts = list.map((row) =>
      [row.name, row.description].filter(Boolean).join(" ").trim() || String(row.id)
    );
    const embeddings = await inferEmbeddings(texts);
    if (embeddings.length !== list.length) {
      throw new Error(`Inference returned ${embeddings.length} embeddings, expected ${list.length}`);
    }
    docs = list.map((row, i) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      description: row.description != null ? String(row.description) : null,
      image_url: row.image_url != null ? String(row.image_url) : null,
      price: row.price != null ? Number(row.price) : null,
      category: row.category != null ? String(row.category) : null,
      brand: row.brand != null ? String(row.brand) : null,
      source: row.source != null ? String(row.source) : null,
      metadata:
        row.metadata != null && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : null,
      embedding: embeddings[i],
    }));
  } else {
    docs = list
      .map((row) => {
        let embedding: number[] = [];
        const raw = row.embedding;
        if (Array.isArray(raw)) embedding = raw as number[];
        else if (typeof raw === "string") {
          try {
            embedding = JSON.parse(raw) as number[];
          } catch {
            embedding = [];
          }
        }
        return {
          id: String(row.id ?? ""),
          name: String(row.name ?? ""),
          description: row.description != null ? String(row.description) : null,
          image_url: row.image_url != null ? String(row.image_url) : null,
          price: row.price != null ? Number(row.price) : null,
          category: row.category != null ? String(row.category) : null,
          brand: row.brand != null ? String(row.brand) : null,
          source: row.source != null ? String(row.source) : null,
          metadata:
            row.metadata != null && typeof row.metadata === "object"
              ? (row.metadata as Record<string, unknown>)
              : null,
          embedding,
        };
      })
      .filter((d) => d.embedding.length === SEARCH_CONFIG.embeddingDimension);
  }

  await ensureProductsIndex();
  const { indexed, errors } = await indexProducts(docs);

  return {
    indexed,
    total: list.length,
    skipped: list.length - docs.length,
    errors,
  };
}

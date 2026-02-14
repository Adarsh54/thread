/**
 * Search schema contract — align with your partner's products table and RPC.
 * If their schema uses different names, update these constants so the Search API
 * and RPC stay in sync.
 */
export const SEARCH_CONFIG = {
  /** Table name for products (partner creates this) */
  productsTable: "products" as const,
  /** Column name for the pgvector embedding (partner adds this column) */
  embeddingColumn: "embedding" as const,
  /** RPC name for similarity search (partner creates this function) */
  matchProductsRpc: "match_products" as const,
  /** OpenAI embedding dimension — must match the column type, e.g. vector(1536) */
  embeddingDimension: 1536,
  /** Default limit for search results */
  defaultLimit: 20,
} as const;

/** Elasticsearch index vector size. E5 small = 384; OpenAI text-embedding-3-small = 1536. Set via ELASTICSEARCH_EMBEDDING_DIMENSION. */
export function getElasticsearchEmbeddingDimension(): number {
  const n = Number(process.env.ELASTICSEARCH_EMBEDDING_DIMENSION);
  return Number.isFinite(n) && n > 0 ? n : SEARCH_CONFIG.embeddingDimension;
}

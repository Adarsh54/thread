import type { Product } from "@/types/product";

// ── SSE event types streamed from the agent API ──

export type AgentEvent =
  | { type: "thinking"; message: string }
  | { type: "searching"; query: string }
  | { type: "found"; count: number; query: string }
  | { type: "recommendation"; product: Product; reason: string }
  | { type: "done"; summary: string; outfit: Product[] }
  | { type: "error"; message: string };

// ── Feedback from user on recommended products ──

export interface ProductFeedback {
  product_id: string;
  product_name: string;
  liked: boolean;
  /** Rich product details so the agent can learn taste patterns */
  brand?: string;
  price?: number;
  category?: string;
  description?: string;
}

// ── Tool call / result types ──

export interface SearchProductsArgs {
  query: string;
  category?: string;
  max_price?: number;
}

export interface RecommendProductArgs {
  product_id: string;
  reason: string;
}

export interface FinishArgs {
  summary: string;
}

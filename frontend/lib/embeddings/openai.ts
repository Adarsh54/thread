"use server";

import OpenAI from "openai";

/** Lazy client so we don't require OPENAI_API_KEY when only using Elasticsearch inference. */
function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key?.trim()) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey: key });
}

/** OpenAI embedding model; dimension must match DB column (e.g. 1536 for text-embedding-3-small) */
const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Get a single embedding vector for a string (e.g. search query).
 * Server-only. Requires OPENAI_API_KEY in env.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAI();
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.trim().slice(0, 8191),
  });
  const vector = res.data[0]?.embedding;
  if (!vector || !Array.isArray(vector)) {
    throw new Error("OpenAI embedding returned no vector");
  }
  return vector;
}

/**
 * Get embeddings for multiple texts in one request (for backfilling product descriptions).
 * Server-only. Use when your partner has seeded products and you need to backfill embedding column.
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const openai = getOpenAI();
  const input = texts.map((t) => t.trim().slice(0, 8191));
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
  });
  const sorted = [...res.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return sorted.map((d) => d.embedding);
}

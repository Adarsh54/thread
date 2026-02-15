import { createClient } from "@/lib/supabase/server";
import { runAgent } from "@/lib/agent/run-agent";
import type { UserPreferences } from "@/types/preferences";
import type { ProductFeedback } from "@/lib/agent/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/agent
 * Body: {
 *   prompt?: string,
 *   feedback?: ProductFeedback[],   // from previous round
 *   round?: number,                 // which round (0 = first)
 *   seenProductIds?: string[],      // products the user already saw
 * }
 * Returns: SSE stream of AgentEvent JSON lines.
 */
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : undefined;
  const feedback: ProductFeedback[] = Array.isArray(body.feedback) ? body.feedback : [];
  const round = typeof body.round === "number" ? body.round : 0;
  const seenProductIds: string[] = Array.isArray(body.seenProductIds) ? body.seenProductIds : [];

  // Load preferences
  let prefs: Partial<UserPreferences> = {};
  try {
    const { data } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (data) prefs = data;
  } catch {
    // No preferences saved
  }

  // Load persistent feedback history from DB (last 30 signals) with rich metadata
  let historicalFeedback: ProductFeedback[] = [];
  try {
    const { data } = await supabase
      .from("agent_feedback")
      .select("product_id, product_name, liked, metadata")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (data) {
      historicalFeedback = data.map((row) => {
        const meta = (row.metadata as Record<string, unknown>) ?? {};
        return {
          product_id: row.product_id,
          product_name: row.product_name,
          liked: row.liked,
          brand: (meta.brand as string) ?? undefined,
          price: (meta.price as number) ?? undefined,
          category: (meta.category as string) ?? undefined,
          description: (meta.description as string) ?? undefined,
        };
      });
    }
  } catch {
    // Table might not exist yet — that's fine
  }

  // Merge: current round feedback + historical (deduplicated, current round takes priority)
  const currentIds = new Set(feedback.map((f) => f.product_id));
  const mergedFeedback = [
    ...feedback,
    ...historicalFeedback.filter((h) => !currentIds.has(h.product_id)),
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAgent({
          prefs,
          prompt,
          feedback: mergedFeedback.length > 0 ? mergedFeedback : undefined,
          round,
          seenProductIds,
        })) {
          const line = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(line));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Agent failed";
        const errorEvent = `data: ${JSON.stringify({ type: "error", message })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

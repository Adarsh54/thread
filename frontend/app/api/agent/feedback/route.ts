import { createClient } from "@/lib/supabase/server";
import type { ProductFeedback } from "@/lib/agent/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/feedback
 * Body: { feedback: ProductFeedback[] }
 *
 * Persists user feedback (like/dislike) to the database so the agent
 * can learn the user's taste across sessions.
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
  const feedback: ProductFeedback[] = Array.isArray(body.feedback)
    ? body.feedback
    : [];

  if (feedback.length === 0) {
    return Response.json({ error: "No feedback provided" }, { status: 400 });
  }

  // Upsert feedback rows (latest feedback per product wins)
  const rows = feedback.map((f) => ({
    user_id: user.id,
    product_id: f.product_id,
    product_name: f.product_name,
    liked: f.liked,
    metadata: {
      brand: f.brand ?? null,
      price: f.price ?? null,
      category: f.category ?? null,
      description: f.description ?? null,
    },
  }));

  const { error } = await supabase
    .from("agent_feedback")
    .upsert(rows, { onConflict: "user_id,product_id" });

  if (error) {
    console.error("[agent/feedback] upsert error:", error);
    return Response.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  return Response.json({ saved: rows.length });
}

/**
 * GET /api/agent/feedback
 * Returns the user's feedback history (most recent first, up to 50).
 */
export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("agent_feedback")
    .select("product_id, product_name, liked, metadata, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ error: "Failed to load feedback" }, { status: 500 });
  }

  // Flatten metadata back into ProductFeedback shape
  const feedback = (data ?? []).map((row) => {
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

  return Response.json({ feedback });
}

import type { UserPreferences } from "@/types/preferences";
import type { Product } from "@/types/product";
import type { AgentEvent, ProductFeedback } from "./types";
import {
  AGENT_TOOL_DECLARATIONS,
  ProductCache,
  executeSearch,
  formatResultsForModel,
} from "./tools";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.0-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_TURNS = 20;
const MAX_SEARCHES = 4;

// ── Types for Gemini REST API ────────────────────────────────────────────────

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { result: unknown } } };

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  error?: { message: string };
}

// ── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(
  prefs: Partial<UserPreferences>,
  userPrompt?: string,
  feedback?: ProductFeedback[],
  round?: number,
): string {
  const lines: string[] = [
    "You are a personal AI shopping agent for thread, a fashion e-commerce platform.",
    "You search the catalog and recommend specific products to the user.",
    "",
  ];

  // User's explicit request is THE priority
  if (userPrompt) {
    lines.push(
      "## USER REQUEST — THIS IS YOUR #1 PRIORITY",
      `The user asked: "${userPrompt}"`,
      "Your search queries and recommendations MUST directly match what the user asked for.",
      "Do NOT override or reinterpret the user's request based on saved preferences.",
      ""
    );
  }

  // ── Feedback from previous rounds ──
  if (feedback && feedback.length > 0) {
    const liked = feedback.filter((f) => f.liked);
    const disliked = feedback.filter((f) => !f.liked);

    lines.push(
      "## USER FEEDBACK — LEARN FROM THIS",
      `This is round ${(round ?? 1) + 1}. The user reviewed your recommendations and gave feedback.`,
      "You MUST adapt your taste model and searches based on this feedback.",
      "",
    );

    if (liked.length > 0) {
      lines.push("### Products the user LIKED (find MORE like these):");
      for (const f of liked) {
        const details: string[] = [`"${f.product_name}"`];
        if (f.brand) details.push(`brand: ${f.brand}`);
        if (f.price != null) details.push(`$${f.price.toFixed(2)}`);
        if (f.category) details.push(`category: ${f.category}`);
        if (f.description) details.push(`— ${f.description.slice(0, 100)}`);
        lines.push(`  ✓ ${details.join(" · ")}`);
      }
      lines.push("");
    }

    if (disliked.length > 0) {
      lines.push("### Products the user DISLIKED (AVOID similar items):");
      for (const f of disliked) {
        const details: string[] = [`"${f.product_name}"`];
        if (f.brand) details.push(`brand: ${f.brand}`);
        if (f.price != null) details.push(`$${f.price.toFixed(2)}`);
        if (f.category) details.push(`category: ${f.category}`);
        lines.push(`  ✗ ${details.join(" · ")}`);
      }
      lines.push("");
    }

    lines.push(
      "### How to use this feedback:",
      "- Identify the VIBE and AESTHETIC the user gravitates toward (not just specific items).",
      "- Note price ranges, brands, categories, and styles they prefer.",
      "- Actively AVOID the brands, styles, and price ranges of disliked items.",
      "- Your next searches should explore the user's taste, not repeat literal product names.",
      "",
    );
  }

  // ── Gender is a HARD constraint, not a preference ──
  if (prefs.gender) {
    lines.push(
      "## GENDER — HARD CONSTRAINT (NEVER IGNORE THIS)",
      `The user's gender is: ${prefs.gender}`,
      `You MUST only search for and recommend ${prefs.gender}'s clothing.`,
      `NEVER recommend clothing designed for a different gender.`,
      `Always include "${prefs.gender}" or "${prefs.gender}'s" in your search queries.`,
      "",
    );
  }

  // Other preferences as low-priority context
  const prefLines: string[] = [];
  if (prefs.preferred_styles?.length)
    prefLines.push(`- Style: ${prefs.preferred_styles.join(", ")}`);
  if (prefs.preferred_colors?.length)
    prefLines.push(`- Favorite colors: ${prefs.preferred_colors.join(", ")}`);
  if (prefs.fit_preference)
    prefLines.push(`- Fit preference: ${prefs.fit_preference}`);
  if (prefs.top_size) prefLines.push(`- Top size: ${prefs.top_size}`);
  if (prefs.bottom_size) prefLines.push(`- Bottom size: ${prefs.bottom_size}`);
  if (prefs.shoe_size) prefLines.push(`- Shoe size: US ${prefs.shoe_size}`);
  if (prefs.budget_min != null || prefs.budget_max != null) {
    const min = prefs.budget_min ?? 0;
    const max = prefs.budget_max ?? "no limit";
    prefLines.push(`- Budget: $${min} – ${typeof max === "number" ? `$${max}` : max}`);
  }
  if (prefs.preferred_brands?.length)
    prefLines.push(`- Preferred brands: ${prefs.preferred_brands.join(", ")}`);

  if (prefLines.length > 0) {
    lines.push(
      "## User Preferences (low priority — use as tiebreakers)",
      "Only apply these if they don't conflict with the user's request or feedback.",
      ...prefLines,
      ""
    );
  }

  const hasFeedback = (feedback?.length ?? 0) > 0;

  lines.push(
    "## Workflow (follow EXACTLY — do NOT deviate)",
    "",
    "1. Call search_products 2-3 times with different queries.",
    hasFeedback
      ? "   - You have feedback now. Search by VIBE and AESTHETIC, not literal product names."
      : "   - Base your first query on what the user asked for.",
    hasFeedback
      ? "   - Think about what the liked items have in common: mood, color palette, aesthetic, price tier."
      : "",
    hasFeedback
      ? "   - Example vibe queries: 'relaxed earth-tone streetwear', 'dark minimalist wardrobe staples', 'clean preppy summer look'."
      : "   - Each query should target a different product type (e.g. top, bottom, shoes, jacket).",
    !hasFeedback
      ? "   - Put details in the query string. Example: 'casual summer hoodie', 'slim dark jeans'."
      : "",
    "   - Think like a stylist: search for complementary pieces and cohesive looks, not just repeats of what they liked.",
    "",
    "2. IMMEDIATELY after your searches, call recommend_product 4-6 times.",
    "   - Pick products that match the user's vibe and taste.",
    hasFeedback
      ? "   - Do NOT re-recommend products the user already reviewed. Only suggest NEW products."
      : "",
    "   - Use the exact product_id (UUID) from search results.",
    "   - Write a 1-2 sentence reason for each pick — reference the vibe or why it fits their taste.",
    "",
    "3. After all recommend_product calls, call finish with a brief summary.",
    "",
    "## RULES",
    "- Maximum 3 searches. After that, start recommending immediately.",
    "- You MUST call recommend_product for each item. Products only appear in the UI via this tool.",
    "- Do NOT describe products in text. The user CANNOT see your text responses.",
    "- Do NOT call finish until you've called recommend_product at least 3 times.",
    "- Do NOT repeat searches with slight variations. Each search should explore a different angle of the user's taste.",
  );

  return lines.filter((l) => l !== "").length > 0
    ? lines.join("\n")
    : lines.join("\n");
}

// ── Gemini API call ──────────────────────────────────────────────────────────

async function callGemini(
  systemPrompt: string,
  contents: GeminiContent[]
): Promise<GeminiPart[]> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    tools: [{ function_declarations: AGENT_TOOL_DECLARATIONS }],
    tool_config: { function_calling_config: { mode: "AUTO" } },
  };

  const res = await fetch(
    `${API_BASE}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const data: GeminiResponse = await res.json();
  if (data.error) throw new Error(data.error.message);

  return data.candidates?.[0]?.content?.parts ?? [];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseArgs(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  if (typeof args === "string") {
    try { return JSON.parse(args); } catch { return {}; }
  }
  return {};
}

// ── Main agent loop ─────────────────────────────────────────────────────────

export interface RunAgentOptions {
  prefs: Partial<UserPreferences>;
  prompt?: string;
  /** Feedback from previous round(s) */
  feedback?: ProductFeedback[];
  /** Which round this is (0-based). First run = 0, after first feedback = 1, etc. */
  round?: number;
  /** Product IDs the user has already seen — agent should not re-recommend these */
  seenProductIds?: string[];
}

export async function* runAgent(
  options: RunAgentOptions
): AsyncGenerator<AgentEvent> {
  const { prefs, feedback, round = 0, seenProductIds = [] } = options;
  const userPrompt = options.prompt?.trim() || undefined;
  const systemPrompt = buildSystemPrompt(prefs, userPrompt, feedback, round);
  const cache = new ProductCache();
  const recommendations: Product[] = [];
  let searchCount = 0;

  // Build the initial user message depending on round
  let userMessage: string;
  if (round === 0) {
    userMessage = userPrompt
      ? `Find me: "${userPrompt}". Focus on exactly what I asked for. Start searching now.`
      : "Put together a great outfit for me. Start searching now.";
  } else {
    // Refinement round — remind the model about the feedback
    const liked = feedback?.filter((f) => f.liked) ?? [];
    const disliked = feedback?.filter((f) => !f.liked) ?? [];
    const parts: string[] = [];
    if (liked.length > 0) {
      parts.push(`I liked: ${liked.map((f) => `"${f.product_name}"`).join(", ")}`);
    }
    if (disliked.length > 0) {
      parts.push(`I didn't like: ${disliked.map((f) => `"${f.product_name}"`).join(", ")}`);
    }
    userMessage = `${parts.join(". ")}. Find me NEW products that match what I liked and avoid what I didn't. Do NOT recommend any products I already saw. Start searching now.`;
  }

  const contents: GeminiContent[] = [
    { role: "user", parts: [{ text: userMessage }] },
  ];

  yield {
    type: "thinking",
    message: round === 0
      ? "Analyzing your request..."
      : "Learning from your feedback and searching for better picks...",
  };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let parts: GeminiPart[];
    try {
      parts = await callGemini(systemPrompt, contents);
    } catch (err) {
      yield { type: "error", message: err instanceof Error ? err.message : "Agent failed" };
      return;
    }

    console.log(
      `[agent] Round ${round + 1}, Turn ${turn + 1}, searches=${searchCount}, recs=${recommendations.length}, parts:`,
      JSON.stringify(parts.map((p) =>
        "functionCall" in p ? { fn: p.functionCall.name } : "text" in p ? { text: p.text.slice(0, 80) } : "fnResponse"
      ))
    );

    contents.push({ role: "model", parts });

    // Extract function calls
    const functionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    for (const part of parts) {
      if ("text" in part && part.text.trim()) {
        yield { type: "thinking", message: part.text.trim() };
      }
      if ("functionCall" in part) {
        functionCalls.push({
          name: part.functionCall.name,
          args: parseArgs(part.functionCall.args),
        });
      }
    }

    // No function calls — nudge model
    if (functionCalls.length === 0) {
      if (recommendations.length >= 2) {
        yield { type: "done", summary: "Here are my picks for you — let me know what you think!", outfit: recommendations };
        return;
      }
      if (searchCount === 0) {
        contents.push({ role: "user", parts: [{ text: "Please call search_products now to find items." }] });
      } else {
        contents.push({ role: "user", parts: [{ text: "Now call recommend_product for your top 4-6 picks from the search results." }] });
      }
      continue;
    }

    // Execute function calls
    const functionResponses: GeminiPart[] = [];
    let finished = false;

    for (const call of functionCalls) {
      const { name, args } = call;

      if (name === "search_products") {
        if (searchCount >= MAX_SEARCHES) {
          functionResponses.push({
            functionResponse: {
              name: "search_products",
              response: {
                result: `You've already searched ${searchCount} times. STOP searching. Now call recommend_product for your top picks from the results you already have.`,
              },
            },
          });
          continue;
        }

        const query = String(args.query ?? "");
        const maxPrice = args.max_price != null ? Number(args.max_price) : undefined;

        yield { type: "searching", query };
        searchCount++;

        try {
          const results = await executeSearch({ query, max_price: maxPrice }, cache);
          yield { type: "found", count: results.length, query };

          let response = formatResultsForModel(results);

          // Tell the model which products were already seen
          if (seenProductIds.length > 0) {
            const seenInResults = results.filter((r) => seenProductIds.includes(r.id));
            if (seenInResults.length > 0) {
              response += `\n\n⚠️ The user has ALREADY SEEN these products from a previous round — do NOT recommend them again: ${seenInResults.map((r) => `[${r.id}] ${r.name}`).join(", ")}`;
            }
          }

          if (searchCount >= 2) {
            response += `\n\nYou have searched ${searchCount} times and have ${cache.size()} products to choose from. NOW call recommend_product for your top 4-6 picks.`;
          }

          functionResponses.push({
            functionResponse: { name: "search_products", response: { result: response } },
          });
        } catch (err) {
          functionResponses.push({
            functionResponse: {
              name: "search_products",
              response: { result: `Search failed: ${err instanceof Error ? err.message : "error"}` },
            },
          });
        }
      } else if (name === "recommend_product") {
        const productId = String(args.product_id ?? "");
        const reason = String(args.reason ?? "A great pick for you.");
        const product = cache.get(productId);

        // Block re-recommending products the user already saw
        if (seenProductIds.includes(productId)) {
          functionResponses.push({
            functionResponse: {
              name: "recommend_product",
              response: {
                result: `The user already saw product "${productId}" in a previous round. Pick a DIFFERENT product.`,
              },
            },
          });
          continue;
        }

        if (product) {
          recommendations.push(product);
          yield { type: "recommendation", product, reason };
          functionResponses.push({
            functionResponse: {
              name: "recommend_product",
              response: { result: `Recommended: ${product.name}` },
            },
          });
        } else {
          console.log(`[agent] recommend_product MISS: id=${productId}, cache_size=${cache.size()}`);
          functionResponses.push({
            functionResponse: {
              name: "recommend_product",
              response: {
                result: `Product "${productId}" not found. Use the exact full UUID from search results (the ID in square brackets).`,
              },
            },
          });
        }
      } else if (name === "finish") {
        const summary = String(args.summary ?? "Here are my top picks!");

        if (recommendations.length === 0) {
          functionResponses.push({
            functionResponse: {
              name: "finish",
              response: {
                result: "ERROR: No recommendations made yet. Call recommend_product for at least 3 products, then call finish.",
              },
            },
          });
          continue;
        }

        yield { type: "done", summary, outfit: recommendations };
        finished = true;
        break;
      }
    }

    if (finished) return;

    if (functionResponses.length > 0) {
      contents.push({ role: "user", parts: functionResponses });
    }
  }

  // Max turns reached
  yield {
    type: "done",
    summary: recommendations.length > 0
      ? "Here are my picks — let me know what you think!"
      : "I had trouble finding the right products. Try a different prompt.",
    outfit: recommendations,
  };
}

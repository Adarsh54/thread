"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Header } from "@/components/header";
import { TryOnPanel } from "@/components/outfit/try-on-panel";
import { createClient } from "@/lib/supabase/client";
import {
  Bot,
  Play,
  Search,
  Sparkles,
  ShoppingBag,
  Check,
  X,
  ArrowRight,
  Loader2,
  Send,
  Package,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
} from "lucide-react";
import { useCart } from "@/lib/cart-context";
import type { Product } from "@/types/product";
import type { AgentEvent, ProductFeedback } from "@/lib/agent/types";
import type { UserPreferences } from "@/types/preferences";

// ── Types ────────────────────────────────────────────────────────────────────

interface ActivityItem {
  id: string;
  type: "thinking" | "searching" | "found" | "recommendation" | "done" | "error" | "feedback";
  message: string;
  timestamp: number;
}

interface Recommendation {
  product: Product;
  reason: string;
  accepted: boolean | null; // null = pending, true = liked, false = disliked
  round: number;
}

const TRYON_KEY = "thread_tryon_product";

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Partial<UserPreferences> | null>(null);

  // Agent state
  const [running, setRunning] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [seenProductIds, setSeenProductIds] = useState<string[]>([]);
  const [allFeedback, setAllFeedback] = useState<ProductFeedback[]>([]);

  // Product detail panel
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Cart
  const { addItem, items: cartItems } = useCart();

  const activityEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const promptRef = useRef("");

  // Auth check + load preferences
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
      } else {
        setAuthed(true);
        fetch("/api/preferences")
          .then((r) => r.json())
          .then((d) => setPrefs(d.preferences ?? {}))
          .catch(() => setPrefs({}))
          .finally(() => setLoading(false));
      }
    });
  }, [router]);

  // Auto-scroll activity feed
  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activity]);

  const addActivity = useCallback(
    (type: ActivityItem["type"], message: string) => {
      setActivity((prev) => [
        ...prev,
        { id: `${Date.now()}-${Math.random()}`, type, message, timestamp: Date.now() },
      ]);
    },
    []
  );

  // ── SSE reader ──

  const readStream = useCallback(
    async (res: Response, currentRound: number) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const text = line.replace(/^data: /, "").trim();
          if (!text) continue;

          try {
            const event: AgentEvent = JSON.parse(text);

            switch (event.type) {
              case "thinking":
                addActivity("thinking", event.message);
                break;
              case "searching":
                addActivity("searching", `Searching: "${event.query}"`);
                break;
              case "found":
                addActivity("found", `Found ${event.count} products for "${event.query}"`);
                break;
              case "recommendation":
                addActivity("recommendation", `Recommending: ${event.product.name}`);
                setRecommendations((prev) => [
                  ...prev,
                  { product: event.product, reason: event.reason, accepted: null, round: currentRound },
                ]);
                setSeenProductIds((prev) =>
                  prev.includes(event.product.id) ? prev : [...prev, event.product.id]
                );
                break;
              case "done":
                addActivity("done", event.summary);
                setSummary(event.summary);
                break;
              case "error":
                addActivity("error", event.message);
                break;
            }
          } catch {
            // Ignore malformed lines
          }
        }
      }
    },
    [addActivity]
  );

  // ── Start agent (round 0) ──

  const startAgent = useCallback(async () => {
    setRunning(true);
    setActivity([]);
    setRecommendations([]);
    setSummary(null);
    setRound(0);
    setSeenProductIds([]);
    setAllFeedback([]);
    setSelectedProduct(null);
    promptRef.current = prompt;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt || undefined, round: 0 }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        addActivity("error", "Failed to start agent.");
        setRunning(false);
        return;
      }

      await readStream(res, 0);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        addActivity("error", "Connection lost.");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [prompt, addActivity, readStream]);

  // ── Refine picks (round 1+) ──

  const refinePicks = useCallback(async () => {
    const currentRoundRecs = recommendations.filter((r) => r.accepted !== null);
    const newFeedback: ProductFeedback[] = currentRoundRecs.map((r) => ({
      product_id: r.product.id,
      product_name: r.product.name,
      liked: r.accepted === true,
      brand: r.product.brand ?? undefined,
      price: r.product.price ?? undefined,
      category: r.product.category ?? undefined,
      description: r.product.description ?? undefined,
    }));

    const combinedFeedback = [...allFeedback, ...newFeedback];
    setAllFeedback(combinedFeedback);

    // Persist feedback to DB (fire and forget)
    fetch("/api/agent/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: newFeedback }),
    }).catch(() => {});

    const nextRound = round + 1;
    setRound(nextRound);
    setRunning(true);
    setSummary(null);

    addActivity(
      "feedback",
      `Round ${round + 1} feedback: ${newFeedback.filter((f) => f.liked).length} liked, ${newFeedback.filter((f) => !f.liked).length} disliked — refining...`
    );

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptRef.current || undefined,
          feedback: combinedFeedback,
          round: nextRound,
          seenProductIds,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        addActivity("error", "Failed to refine.");
        setRunning(false);
        return;
      }

      await readStream(res, nextRound);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        addActivity("error", "Connection lost.");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [recommendations, allFeedback, round, seenProductIds, addActivity, readStream]);

  const stopAgent = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  const setAccepted = useCallback((index: number, value: boolean) => {
    setRecommendations((prev) =>
      prev.map((r, i) => (i === index ? { ...r, accepted: value } : r))
    );
  }, []);

  const handleTryOn = useCallback((product: Product) => {
    sessionStorage.setItem(TRYON_KEY, JSON.stringify(product));
    router.push("/outfit?generate=true");
  }, [router]);

  // ── Computed state ──

  // Pending = current round, not yet liked (still deciding or disliked)
  const pendingRecs = recommendations.filter(
    (r) => r.round === round && r.accepted !== true
  );
  const likedProducts = recommendations.filter((r) => r.accepted === true);
  const hasAnyFeedback = recommendations.filter((r) => r.round === round).some((r) => r.accepted !== null);

  // ── Render ──

  if (!authed || loading) {
    return (
      <main className="min-h-screen bg-background">
        <Header />
        <div className="pt-28 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
        </div>
      </main>
    );
  }

  const hasPrefs =
    prefs &&
    ((prefs.preferred_styles?.length ?? 0) > 0 ||
      prefs.budget_max != null ||
      prefs.gender != null);

  return (
    <main className="min-h-screen bg-background pb-24">
      <Header />
      <div className="pt-28" />

      <div className="mx-auto max-w-6xl px-6 md:px-12">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground">
                <Bot size={20} className="text-background" />
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground">
                Thread Bot
              </h1>
            </div>
            <p className="mt-2 text-lg text-muted-foreground">
              Tell me what you&apos;re looking for. Like or dislike picks and I&apos;ll learn your taste.
            </p>
          </div>
        </div>

        {/* ── Preferences summary ── */}
        {!hasPrefs && !running && recommendations.length === 0 && (
          <div className="mt-8 rounded-2xl border border-border bg-secondary/30 p-6">
            <p className="text-sm text-muted-foreground">
              You haven&apos;t set up your preferences yet. The agent works best when it
              knows your style, sizing, and budget.
            </p>
            <button
              onClick={() => router.push("/preferences")}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
            >
              Set up preferences
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        {hasPrefs && !running && recommendations.length === 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {prefs?.preferred_styles?.map((s) => (
              <span key={s} className="rounded-full bg-secondary border border-border px-3 py-1 text-xs text-muted-foreground">{s}</span>
            ))}
            {prefs?.preferred_colors?.map((c) => (
              <span key={c} className="rounded-full bg-secondary border border-border px-3 py-1 text-xs text-muted-foreground">{c}</span>
            ))}
            {prefs?.budget_max != null && (
              <span className="rounded-full bg-secondary border border-border px-3 py-1 text-xs text-muted-foreground">
                Budget: up to ${prefs.budget_max}
              </span>
            )}
            {prefs?.fit_preference && (
              <span className="rounded-full bg-secondary border border-border px-3 py-1 text-xs text-muted-foreground capitalize">
                {prefs.fit_preference} fit
              </span>
            )}
          </div>
        )}

        {/* ── Start controls ── */}
        {!running && recommendations.length === 0 && (
          <div className="mt-8 space-y-4">
            <div className="relative">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !running) startAgent();
                }}
                placeholder="What are you looking for? (e.g. 'casual summer outfit', 'date night look', 'black sneakers')..."
                className="w-full rounded-2xl border border-border bg-secondary/50 py-4 pl-5 pr-14 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none transition-colors"
              />
              <button
                onClick={startAgent}
                disabled={running}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {running ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        )}

        {/* ── Main content: activity + recommendations ── */}
        {(running || activity.length > 0) && (
          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
            {/* Left: Activity feed */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  Activity {round > 0 && `· Round ${round + 1}`}
                </h2>
                {running && (
                  <button onClick={stopAgent} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Stop
                  </button>
                )}
              </div>

              <div className="space-y-0 rounded-2xl border border-border bg-secondary/30 p-4 max-h-[600px] overflow-y-auto">
                {activity.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
                {running && (
                  <div className="flex items-center gap-2 py-2 px-1">
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Thinking...</span>
                  </div>
                )}
                <div ref={activityEndRef} />
              </div>

              {/* Summary */}
              {summary && (
                <div className="mt-4 rounded-xl border border-foreground/20 bg-foreground/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={14} className="text-foreground" />
                    <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      {round === 0 ? "Summary" : `Round ${round + 1} summary`}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80">{summary}</p>
                </div>
              )}

              {/* Restart */}
              {!running && activity.length > 0 && (
                <button
                  onClick={() => {
                    setActivity([]);
                    setRecommendations([]);
                    setSummary(null);
                    setRound(0);
                    setSeenProductIds([]);
                    setAllFeedback([]);
                    setSelectedProduct(null);
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
                >
                  <Play size={12} />
                  Start over
                </button>
              )}
            </div>

            {/* Right: Recommendations */}
            <div>
              {/* ── Pending / current round cards ── */}
              {pendingRecs.length > 0 && (
                <>
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
                    Recommendations
                    <span className="ml-2 text-muted-foreground font-normal">
                      — like or dislike to teach me your taste
                    </span>
                  </h2>

                  <div className="space-y-4">
                    {pendingRecs.map((rec) => {
                      const idx = recommendations.indexOf(rec);
                      return (
                        <RecommendationCard
                          key={`${rec.product.id}-${rec.round}`}
                          rec={rec}
                          onAccept={() => setAccepted(idx, true)}
                          onReject={() => setAccepted(idx, false)}
                          onImageClick={() => setSelectedProduct(rec.product)}
                          onTryOn={() => handleTryOn(rec.product)}
                        />
                      );
                    })}
                  </div>
                </>
              )}

              {/* Refine button */}
              {!running && hasAnyFeedback && (
                <div className="mt-6">
                  <button
                    onClick={refinePicks}
                    className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90 transition-opacity"
                  >
                    <RefreshCw size={14} />
                    Refine my picks
                  </button>
                </div>
              )}

              {/* ── Liked items section ── */}
              {likedProducts.length > 0 && (
                <div className="mt-10">
                  <div className="flex items-center gap-2 mb-4">
                    <ThumbsUp size={14} className="text-green-500" />
                    <h2 className="text-sm font-semibold text-green-500 uppercase tracking-wider">
                      Liked Items ({likedProducts.length})
                    </h2>
                  </div>

                  <div className="space-y-3">
                    {likedProducts.map((rec) => (
                      <LikedItemCard
                        key={`liked-${rec.product.id}`}
                        product={rec.product}
                        reason={rec.reason}
                        onImageClick={() => setSelectedProduct(rec.product)}
                        onTryOn={() => handleTryOn(rec.product)}
                        onAddToCart={() => addItem(rec.product)}
                        inCart={cartItems.some((ci) => ci.product.id === rec.product.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Previous round results (collapsed) */}
              {round > 0 && (
                <div className="mt-8">
                  <PreviousRounds recommendations={recommendations} currentRound={round} />
                </div>
              )}

              {/* Empty state while searching */}
              {recommendations.length === 0 && running && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20">
                  <Package size={32} className="text-muted-foreground/40" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    Recommendations will appear here...
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Product detail panel (slides in from right) */}
      {selectedProduct && (
        <TryOnPanel
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </main>
  );
}

// ── Activity row ─────────────────────────────────────────────────────────────

function ActivityRow({ item }: { item: ActivityItem }) {
  const icon = {
    thinking: <Sparkles size={14} className="text-purple-400" />,
    searching: <Search size={14} className="text-blue-400" />,
    found: <Check size={14} className="text-green-400" />,
    recommendation: <ShoppingBag size={14} className="text-amber-400" />,
    done: <Check size={14} className="text-green-500" />,
    error: <X size={14} className="text-red-400" />,
    feedback: <RefreshCw size={14} className="text-purple-400" />,
  }[item.type];

  return (
    <div className="flex items-start gap-2.5 py-2 px-1 group">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <p className="text-xs text-muted-foreground leading-relaxed min-w-0">
        {item.message}
      </p>
    </div>
  );
}

// ── Recommendation card (pending / disliked) ─────────────────────────────────

function RecommendationCard({
  rec,
  onAccept,
  onReject,
  onImageClick,
  onTryOn,
}: {
  rec: Recommendation;
  onAccept: () => void;
  onReject: () => void;
  onImageClick: () => void;
  onTryOn: () => void;
}) {
  const { product, reason, accepted } = rec;

  return (
    <div
      className={`group relative flex gap-4 rounded-2xl border p-4 transition-all ${
        accepted === false
          ? "border-red-500/20 bg-red-500/5 opacity-60"
          : "border-border bg-background hover:border-foreground/20 hover:shadow-sm"
      }`}
    >
      {/* Clickable image */}
      {product.image_url && (
        <button
          onClick={onImageClick}
          className="relative h-28 w-22 shrink-0 overflow-hidden rounded-xl bg-secondary cursor-pointer hover:opacity-80 transition-opacity"
        >
          <Image src={product.image_url} alt={product.name} fill className="object-cover" sizes="88px" />
        </button>
      )}

      {/* Details */}
      <div className="flex-1 min-w-0">
        <button onClick={onImageClick} className="text-left cursor-pointer">
          {product.brand && (
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              {product.brand}
            </p>
          )}
          <p className="mt-0.5 text-sm font-semibold text-foreground leading-snug line-clamp-2 hover:underline">
            {product.name}
          </p>
        </button>
        <div className="mt-1.5 flex items-center gap-2">
          {product.price != null && (
            <span className="text-sm font-bold text-foreground">${product.price.toFixed(2)}</span>
          )}
          {product.category && (
            <span className="rounded-full bg-secondary border border-border px-2 py-0.5 text-[10px] text-muted-foreground capitalize">
              {product.category}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">{reason}</p>

        {/* Actions */}
        {accepted === null && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={onAccept}
              className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 border border-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors"
            >
              <ThumbsUp size={12} />
              Like this
            </button>
            <button
              onClick={onReject}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <ThumbsDown size={12} />
              Not for me
            </button>
            <button
              onClick={onTryOn}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
            >
              <Play size={12} />
              Try it on
            </button>
          </div>
        )}

        {accepted === false && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-red-400">
            <ThumbsDown size={12} />
            Got it — I&apos;ll avoid similar items
          </div>
        )}
      </div>
    </div>
  );
}

// ── Liked item card (in the "Liked Items" section) ───────────────────────────

function LikedItemCard({
  product,
  reason,
  onImageClick,
  onTryOn,
  onAddToCart,
  inCart,
}: {
  product: Product;
  reason: string;
  onImageClick: () => void;
  onTryOn: () => void;
  onAddToCart: () => void;
  inCart: boolean;
}) {
  return (
    <div className="flex gap-4 rounded-2xl border border-green-500/30 bg-green-500/5 p-4 transition-all">
      {/* Clickable image */}
      {product.image_url && (
        <button
          onClick={onImageClick}
          className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-secondary cursor-pointer hover:opacity-80 transition-opacity"
        >
          <Image src={product.image_url} alt={product.name} fill className="object-cover" sizes="80px" />
        </button>
      )}

      {/* Details */}
      <div className="flex-1 min-w-0">
        <button onClick={onImageClick} className="text-left cursor-pointer">
          {product.brand && (
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              {product.brand}
            </p>
          )}
          <p className="mt-0.5 text-sm font-semibold text-foreground leading-snug line-clamp-2 hover:underline">
            {product.name}
          </p>
        </button>
        <div className="mt-1 flex items-center gap-2">
          {product.price != null && (
            <span className="text-sm font-bold text-foreground">${product.price.toFixed(2)}</span>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed line-clamp-1">{reason}</p>

        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            onClick={onAddToCart}
            disabled={inCart}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              inCart
                ? "bg-green-500/10 border border-green-500/20 text-green-400"
                : "bg-foreground text-background hover:opacity-90"
            }`}
          >
            {inCart ? (
              <>
                <Check size={12} />
                In cart
              </>
            ) : (
              <>
                <ShoppingBag size={12} />
                Add to cart
              </>
            )}
          </button>
          <button
            onClick={onTryOn}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
          >
            <Play size={12} />
            Try it on
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Previous rounds (collapsed) ─────────────────────────────────────────────

function PreviousRounds({
  recommendations,
  currentRound,
}: {
  recommendations: Recommendation[];
  currentRound: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const previousRecs = recommendations.filter(
    (r) => r.round < currentRound && r.accepted !== true // liked ones already in the Liked section
  );

  if (previousRecs.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? "Hide" : "Show"} previous rounds ({previousRecs.length} items)
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 opacity-60">
          {previousRecs.map((rec) => (
            <div
              key={`prev-${rec.product.id}-${rec.round}`}
              className="flex items-center gap-3 rounded-xl border border-red-500/10 bg-red-500/5 p-3 text-xs"
            >
              {rec.product.image_url && (
                <div className="relative h-10 w-8 shrink-0 overflow-hidden rounded-lg bg-secondary">
                  <Image src={rec.product.image_url} alt={rec.product.name} fill className="object-cover" sizes="32px" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground/70 line-clamp-1">{rec.product.name}</p>
                <p className="text-muted-foreground">Round {rec.round + 1}</p>
              </div>
              <ThumbsDown size={12} className="text-red-400 shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

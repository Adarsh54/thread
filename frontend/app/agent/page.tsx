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
  ChevronDown,
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

const QUICK_PROMPTS = [
  "Casual summer outfit",
  "Date night look",
  "Black sneakers under $150",
  "Cozy fall layers",
];

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

  // Mobile activity toggle
  const [activityOpen, setActivityOpen] = useState(false);

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

  const resetAgent = useCallback(() => {
    setActivity([]);
    setRecommendations([]);
    setSummary(null);
    setRound(0);
    setSeenProductIds([]);
    setAllFeedback([]);
    setSelectedProduct(null);
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

  const pendingRecs = recommendations.filter(
    (r) => r.round === round && r.accepted !== true
  );
  const likedProducts = recommendations.filter((r) => r.accepted === true);
  const hasAnyFeedback = recommendations.filter((r) => r.round === round).some((r) => r.accepted !== null);

  const isActive = running || activity.length > 0;

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

      <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-12">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* STATE A: Initial — Hero Prompt + Style Context               */}
          {/* ══════════════════════════════════════════════════════════════ */}

          {!isActive && (
            <>
              {/* Hero Prompt Cell */}
              <div className="md:col-span-8 rounded-2xl bg-secondary overflow-hidden p-8 md:p-12 flex flex-col justify-center min-h-[320px]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground">
                    <Bot size={24} className="text-background" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                      Thread Bot
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      Your AI stylist — tell me what you&apos;re looking for
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !running) startAgent();
                    }}
                    placeholder="Describe what you want... (e.g. 'casual summer outfit', 'date night look')"
                    className="w-full rounded-2xl border border-border bg-background py-4 pl-5 pr-14 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none transition-colors"
                  />
                  <button
                    onClick={startAgent}
                    disabled={running}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>

                {/* Quick prompts */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setPrompt(q);
                        promptRef.current = q;
                        startAgent();
                      }}
                      className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style Context Cell */}
              <div className="md:col-span-4 rounded-2xl border border-border bg-background p-6 flex flex-col justify-between min-h-[320px]">
                {hasPrefs ? (
                  <>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                        Your Style
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {prefs?.preferred_styles?.map((s) => (
                          <span key={s} className="rounded-full bg-secondary border border-border px-2.5 py-1 text-xs text-foreground">
                            {s}
                          </span>
                        ))}
                        {prefs?.preferred_colors?.map((c) => (
                          <span key={c} className="rounded-full bg-secondary border border-border px-2.5 py-1 text-xs text-foreground">
                            {c}
                          </span>
                        ))}
                        {prefs?.budget_max != null && (
                          <span className="rounded-full bg-secondary border border-border px-2.5 py-1 text-xs text-foreground">
                            Up to ${prefs.budget_max}
                          </span>
                        )}
                        {prefs?.fit_preference && (
                          <span className="rounded-full bg-secondary border border-border px-2.5 py-1 text-xs text-foreground capitalize">
                            {prefs.fit_preference} fit
                          </span>
                        )}
                        {prefs?.gender && (
                          <span className="rounded-full bg-secondary border border-border px-2.5 py-1 text-xs text-foreground capitalize">
                            {prefs.gender}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => router.push("/preferences")}
                      className="mt-6 flex items-center justify-center gap-1.5 rounded-full border border-border py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                    >
                      Edit preferences
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center flex-1">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary mb-4">
                      <Sparkles size={18} className="text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Set up your style</p>
                    <p className="mt-1 text-xs text-muted-foreground max-w-[200px]">
                      The bot works best when it knows your preferences
                    </p>
                    <button
                      onClick={() => router.push("/preferences")}
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background hover:opacity-90 transition-opacity"
                    >
                      Set up preferences
                      <ArrowRight size={12} />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* STATE B/C: Active — Activity Feed + Recommendations Grid     */}
          {/* ══════════════════════════════════════════════════════════════ */}

          {isActive && (
            <>
              {/* ── Activity Feed (desktop sidebar) ── */}
              <div className="hidden md:flex md:col-span-4 rounded-2xl bg-secondary/30 border border-border overflow-hidden flex-col max-h-[640px]">
                {/* Summary pinned at top */}
                {summary && (
                  <div className="p-4 border-b border-border bg-foreground/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={14} className="text-foreground" />
                      <span className="text-[10px] font-semibold text-foreground uppercase tracking-widest">
                        {round === 0 ? "Summary" : `Round ${round + 1}`}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/80 leading-relaxed">{summary}</p>
                  </div>
                )}

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h2 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Activity {round > 0 && `/ Round ${round + 1}`}
                  </h2>
                  {running && (
                    <button onClick={stopAgent} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                      Stop
                    </button>
                  )}
                </div>

                {/* Scrollable feed */}
                <div className="flex-1 overflow-y-auto p-4 space-y-0">
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

                {/* Previous rounds + Start over */}
                {!running && activity.length > 0 && (
                  <div className="p-3 border-t border-border space-y-2">
                    {round > 0 && (
                      <PreviousRounds recommendations={recommendations} currentRound={round} />
                    )}
                    <button
                      onClick={resetAgent}
                      className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
                    >
                      <Play size={10} />
                      Start over
                    </button>
                  </div>
                )}
              </div>

              {/* ── Activity Feed (mobile collapsible) ── */}
              <div className="md:hidden">
                <button
                  onClick={() => setActivityOpen(!activityOpen)}
                  className="flex items-center justify-between w-full rounded-2xl bg-secondary/30 border border-border p-4"
                >
                  <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Activity ({activity.length})
                    {running && " — running"}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-muted-foreground transition-transform ${activityOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {activityOpen && (
                  <div className="mt-2 rounded-2xl bg-secondary/30 border border-border p-4 max-h-[300px] overflow-y-auto space-y-0">
                    {summary && (
                      <div className="mb-3 rounded-xl bg-foreground/5 p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Sparkles size={12} className="text-foreground" />
                          <span className="text-[10px] font-semibold text-foreground uppercase tracking-widest">Summary</span>
                        </div>
                        <p className="text-xs text-foreground/80 leading-relaxed">{summary}</p>
                      </div>
                    )}
                    {activity.map((item) => (
                      <ActivityRow key={item.id} item={item} />
                    ))}
                    {running && (
                      <div className="flex items-center gap-2 py-2 px-1">
                        <Loader2 size={14} className="animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Thinking...</span>
                      </div>
                    )}
                    {!running && (
                      <button
                        onClick={resetAgent}
                        className="mt-2 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-all"
                      >
                        <Play size={10} />
                        Start over
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Recommendation Grid ── */}
              <div className="md:col-span-8">
                {pendingRecs.length > 0 && (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                        Recommendations
                      </h2>
                    </div>
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                      {pendingRecs.map((rec, i) => {
                        const idx = recommendations.indexOf(rec);
                        return (
                          <div key={`${rec.product.id}-${rec.round}`} className="animate-reveal-up" style={{ animationDelay: `${i * 80}ms` }}>
                            <BentoRecCard
                              rec={rec}
                              onAccept={() => setAccepted(idx, true)}
                              onReject={() => setAccepted(idx, false)}
                              onImageClick={() => setSelectedProduct(rec.product)}
                              onTryOn={() => handleTryOn(rec.product)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Empty state while searching */}
                {recommendations.length === 0 && running && (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border min-h-[400px]">
                    <Package size={40} className="text-muted-foreground/30" />
                    <p className="mt-4 text-sm text-muted-foreground">
                      Recommendations will appear here...
                    </p>
                    <div className="mt-6 flex gap-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-48 w-32 rounded-xl bg-secondary animate-pulse" />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Liked Items Strip ── */}
              {likedProducts.length > 0 && (
                <div className="md:col-span-12 rounded-2xl border border-green-500/20 bg-green-500/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ThumbsUp size={14} className="text-green-500" />
                    <h2 className="text-[10px] font-semibold text-green-500 uppercase tracking-widest">
                      Liked ({likedProducts.length})
                    </h2>
                  </div>

                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                    {likedProducts.map((rec) => {
                      const inCart = cartItems.some((ci) => ci.product.id === rec.product.id);
                      return (
                        <div
                          key={`liked-${rec.product.id}`}
                          className="shrink-0 w-40 rounded-xl border border-green-500/20 bg-background overflow-hidden"
                        >
                          <button
                            onClick={() => setSelectedProduct(rec.product)}
                            className="relative aspect-[3/4] w-full bg-secondary block"
                          >
                            {rec.product.image_url && (
                              <Image
                                src={rec.product.image_url}
                                alt={rec.product.name}
                                fill
                                className="object-cover"
                                sizes="160px"
                              />
                            )}
                          </button>
                          <div className="p-2.5">
                            <p className="text-xs font-medium text-foreground line-clamp-1">
                              {rec.product.name}
                            </p>
                            {rec.product.price != null && (
                              <p className="text-xs font-bold text-foreground mt-0.5">
                                ${rec.product.price.toFixed(2)}
                              </p>
                            )}
                            <div className="mt-2 flex gap-1.5">
                              <button
                                onClick={() => addItem(rec.product)}
                                disabled={inCart}
                                className={`flex-1 rounded-full py-1.5 text-[10px] font-medium transition-colors ${
                                  inCart
                                    ? "bg-green-500/10 border border-green-500/20 text-green-400"
                                    : "bg-foreground text-background hover:opacity-90"
                                }`}
                              >
                                {inCart ? "In cart" : "Add to cart"}
                              </button>
                              <button
                                onClick={() => handleTryOn(rec.product)}
                                className="flex items-center justify-center rounded-full border border-border px-2 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Play size={10} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Previous rounds (mobile only — desktop is in activity sidebar) ── */}
              {round > 0 && (
                <div className="md:hidden rounded-2xl border border-border bg-secondary/30 p-4">
                  <PreviousRounds recommendations={recommendations} currentRound={round} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Sticky Prompt / Refine Bar ── */}
      {isActive && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/80 backdrop-blur-xl">
          <div className="mx-auto max-w-[1400px] px-6 md:px-12 py-3 flex items-center gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !running) startAgent();
                }}
                placeholder="Ask for something else..."
                className="w-full rounded-full border border-border bg-secondary/50 py-3 pl-5 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none transition-colors"
              />
              <button
                onClick={startAgent}
                disabled={running}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>

            {!running && hasAnyFeedback && (
              <button
                onClick={refinePicks}
                className="shrink-0 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-xs font-semibold text-background hover:opacity-90 transition-opacity"
              >
                <RefreshCw size={12} />
                Refine picks
              </button>
            )}
          </div>
        </div>
      )}

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

// ── Bento Recommendation Card (image-forward vertical tile) ──────────────────

function BentoRecCard({
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
      className={`group rounded-2xl border overflow-hidden transition-all ${
        accepted === false
          ? "border-red-500/20 opacity-50"
          : "border-border bg-background hover:border-foreground/20 hover:shadow-md"
      }`}
    >
      {/* Product image */}
      <button
        onClick={onImageClick}
        className="relative aspect-[3/4] w-full overflow-hidden bg-secondary block"
      >
        {product.image_url && (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        )}

        {/* Like / Dislike overlay */}
        {accepted === null && (
          <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="flex gap-2 justify-center">
              <button
                onClick={(e) => { e.stopPropagation(); onAccept(); }}
                className="flex items-center gap-1.5 rounded-full bg-green-500/90 backdrop-blur-md px-3 py-2 text-[11px] font-medium text-white shadow-lg hover:bg-green-500 transition-colors"
              >
                <ThumbsUp size={12} />
                Like
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onReject(); }}
                className="flex items-center gap-1.5 rounded-full bg-red-500/90 backdrop-blur-md px-3 py-2 text-[11px] font-medium text-white shadow-lg hover:bg-red-500 transition-colors"
              >
                <ThumbsDown size={12} />
                Pass
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onTryOn(); }}
                className="flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md px-2.5 py-2 text-white shadow-lg hover:bg-white/30 transition-colors"
              >
                <Play size={12} />
              </button>
            </div>
          </div>
        )}

        {/* Disliked overlay */}
        {accepted === false && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <ThumbsDown size={20} className="text-white/60" />
          </div>
        )}
      </button>

      {/* Info */}
      <div className="p-3">
        {product.brand && (
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {product.brand}
          </p>
        )}
        <p className="mt-0.5 text-sm font-medium text-foreground line-clamp-1">
          {product.name}
        </p>
        <div className="mt-1 flex items-center gap-2">
          {product.price != null && (
            <span className="text-sm font-bold text-foreground">
              ${product.price.toFixed(2)}
            </span>
          )}
          {product.category && (
            <span className="rounded-full bg-secondary border border-border px-2 py-0.5 text-[10px] text-muted-foreground capitalize">
              {product.category}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
          {reason}
        </p>
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
    (r) => r.round < currentRound && r.accepted !== true
  );

  if (previousRecs.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? "Hide" : "Show"} previous rounds ({previousRecs.length} items)
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {previousRecs.map((rec) => (
            <div
              key={`prev-${rec.product.id}-${rec.round}`}
              className="flex items-center gap-2 rounded-lg border border-red-500/10 bg-red-500/5 p-2 text-[10px]"
            >
              {rec.product.image_url && (
                <div className="relative h-8 w-6 shrink-0 overflow-hidden rounded bg-secondary">
                  <Image src={rec.product.image_url} alt={rec.product.name} fill className="object-cover" sizes="24px" />
                </div>
              )}
              <p className="flex-1 min-w-0 font-medium text-foreground/70 line-clamp-1">
                {rec.product.name}
              </p>
              <ThumbsDown size={10} className="text-red-400 shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

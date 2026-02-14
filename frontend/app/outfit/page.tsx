"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/header";
import { Search, Play, Loader2, Upload, X, Bell, Settings2 } from "lucide-react";
import type { Product } from "@/types/product";
import type { UserPreferences } from "@/types/preferences";

const PreferenceMannequin = dynamic(
  () =>
    import("@/components/preference-mannequin").then(
      (m) => m.PreferenceMannequin
    ),
  { ssr: false }
);

const STORAGE_KEY = "thread_tryon_job";

interface TryOnJob {
  operationName: string;
  product: Product;
  startedAt: number;
}

export default function OutfitPage() {
  return (
    <Suspense>
      <OutfitPageInner />
    </Suspense>
  );
}

function OutfitPageInner() {
  const searchParams = useSearchParams();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [generating, setGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollMsg, setPollMsg] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Fetch user preferences
  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.preferences) setPrefs(data.preferences);
        else if (data && !data.preferences) setPrefs(data);
      })
      .catch(() => {});
  }, []);

  // Fetch products for selection
  useEffect(() => {
    const params = new URLSearchParams({ limit: "20" });
    if (searchQuery) params.set("category", searchQuery);
    fetch(`/api/products?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const fetched = data.products ?? [];
        setProducts(fetched);

        // Auto-select product from query param
        const productId = searchParams.get("product");
        if (productId && !selectedProduct) {
          const match = fetched.find((p: Product) => p.id === productId);
          if (match) setSelectedProduct(match);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // If product param exists but wasn't in initial fetch, fetch it directly
  useEffect(() => {
    const productId = searchParams.get("product");
    if (productId && !selectedProduct) {
      fetch(`/api/products?limit=1&offset=0`)
        .then((r) => r.json())
        .then(() => {
          // Product might be in any page, so try fetching all and finding
          fetch(`/api/products?limit=100&offset=0`)
            .then((r) => r.json())
            .then((data) => {
              const match = (data.products ?? []).find(
                (p: Product) => p.id === productId
              );
              if (match) setSelectedProduct(match);
            });
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const sendNotification = useCallback((title: string, body: string) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/thread-logo.svg" });
    }
  }, []);

  // Start polling for an operation name
  const startPolling = useCallback(
    (opName: string, product: Product) => {
      if (pollRef.current) clearInterval(pollRef.current);

      setGenerating(true);
      setSelectedProduct(product);
      setPollMsg(
        "Generating video — feel free to browse around, we'll notify you when it's ready!"
      );

      let attempts = 0;
      const maxAttempts = 60;

      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          sessionStorage.removeItem(STORAGE_KEY);
          if (mountedRef.current) {
            setError("Generation timed out. Please try again.");
            setGenerating(false);
            setPollMsg(null);
          }
          return;
        }

        try {
          const pollRes = await fetch(
            `/api/tryon/video?op=${encodeURIComponent(opName)}`
          );
          const pollData = await pollRes.json();

          if (pollData.error) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            sessionStorage.removeItem(STORAGE_KEY);
            if (mountedRef.current) {
              setError(pollData.error);
              setGenerating(false);
              setPollMsg(null);
            }
            return;
          }

          if (pollData.done && pollData.videoUrl) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            sessionStorage.removeItem(STORAGE_KEY);
            if (mountedRef.current) {
              setVideoUrl(pollData.videoUrl);
              setGenerating(false);
              setPollMsg(null);
            }
            if (document.hidden) {
              sendNotification(
                "Try-on video ready!",
                `Your ${product.name} video is ready to view.`
              );
            }
          }
        } catch {
          // Keep polling on transient errors
        }
      }, 5000);
    },
    [sendNotification]
  );

  // Resume polling from sessionStorage on mount
  useEffect(() => {
    mountedRef.current = true;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const job: TryOnJob = JSON.parse(stored);
        // Only resume if less than 5 minutes old
        if (Date.now() - job.startedAt < 5 * 60 * 1000) {
          startPolling(job.operationName, job.product);
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [startPolling]);

  async function handleGenerate() {
    if (!selectedProduct) return;
    setGenerating(true);
    setVideoUrl(null);
    setError(null);
    setPollMsg("Starting generation...");

    try {
      const startRes = await fetch("/api/tryon/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productImageUrl: selectedProduct.image_url,
          productName: selectedProduct.name,
        }),
      });

      if (!startRes.ok) {
        const data = await startRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start generation");
      }

      const { operationName } = await startRes.json();
      if (!operationName) throw new Error("No operation name returned");

      // Persist to sessionStorage so it survives tab switches / page navigations
      const job: TryOnJob = {
        operationName,
        product: selectedProduct,
        startedAt: Date.now(),
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(job));

      startPolling(operationName, selectedProduct);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setGenerating(false);
      setPollMsg(null);
    }
  }

  const heightCm = prefs?.height_cm ?? 170;
  const weightKg = prefs?.weight_kg ?? 70;
  const gender = prefs?.gender ?? "male";
  const fitPref = prefs?.fit_preference ?? "regular";

  return (
    <main className="min-h-screen bg-background">
      <Header />
      <div className="pt-28" />

      <div className="mx-auto max-w-7xl px-6 md:px-12">
        <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
          Try On
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          See how pieces look with AI-generated video and your 3D body model.
        </p>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8 md:px-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* ── Left: Mannequin with user preferences ── */}
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Your Body Model
            </h2>
            <div className="relative h-[560px] rounded-2xl bg-secondary overflow-hidden">
              <PreferenceMannequin
                heightCm={heightCm}
                weightKg={weightKg}
                gender={gender}
                fitPreference={fitPref}
              />

              {/* Settings overlay - top left */}
              <div className="absolute top-4 left-4 flex flex-col gap-1.5">
                <div className="flex items-center gap-3 rounded-xl bg-black/50 backdrop-blur-md px-3.5 py-2.5">
                  <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs text-white/80">
                    <span className="text-white/40">Height</span>
                    <span className="font-medium">{heightCm} cm</span>
                    <span className="text-white/40">Weight</span>
                    <span className="font-medium">{weightKg} kg</span>
                    <span className="text-white/40">Gender</span>
                    <span className="font-medium capitalize">{gender}</span>
                    <span className="text-white/40">Fit</span>
                    <span className="font-medium capitalize">{fitPref}</span>
                  </div>
                </div>
                <Link
                  href="/preferences"
                  className="flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur-md px-3 py-1.5 text-[11px] text-white/60 hover:text-white transition-colors w-fit"
                >
                  <Settings2 size={12} />
                  Edit preferences
                </Link>
              </div>

              {!prefs && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                  <a
                    href="/preferences"
                    className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
                  >
                    Set up your preferences
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Product picker + Video generation ── */}
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Generate Try-On Video
            </h2>

            <div className="relative h-[560px] rounded-2xl bg-secondary overflow-hidden flex items-center justify-center">
              {videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="h-full w-full object-cover"
                  controls
                  autoPlay
                  loop
                />
              ) : generating ? (
                <div className="flex flex-col items-center gap-4 px-8 text-center">
                  <Loader2
                    size={32}
                    className="animate-spin text-muted-foreground"
                  />
                  <p className="text-sm text-muted-foreground">{pollMsg}</p>
                  <div className="flex items-center gap-2 rounded-full bg-foreground/5 border border-border px-4 py-2">
                    <Bell size={14} className="text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      We&apos;ll send a notification when it&apos;s done
                    </p>
                  </div>
                </div>
              ) : selectedProduct ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative h-48 w-36 rounded-xl overflow-hidden bg-background">
                    {selectedProduct.image_url && (
                      <Image
                        src={selectedProduct.image_url}
                        alt={selectedProduct.name}
                        fill
                        className="object-cover"
                        sizes="144px"
                      />
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">
                      {selectedProduct.name}
                    </p>
                    {selectedProduct.price != null && (
                      <p className="text-sm text-muted-foreground">
                        ${selectedProduct.price.toFixed(2)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleGenerate}
                    className="flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background hover:opacity-80 transition-opacity"
                  >
                    <Play size={16} />
                    Generate Video
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Upload size={32} />
                  <p className="text-sm">Select a product below to try on</p>
                </div>
              )}

              {error && (
                <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              {videoUrl && (
                <button
                  onClick={() => {
                    setVideoUrl(null);
                    setError(null);
                  }}
                  className="absolute top-3 right-3 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Product picker */}
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="relative mb-4">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by category..."
                  className="w-full rounded-full border border-border bg-secondary pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/30"
                />
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProduct(p);
                      setVideoUrl(null);
                      setError(null);
                    }}
                    className={`relative shrink-0 h-28 w-20 rounded-xl overflow-hidden transition-all ${
                      selectedProduct?.id === p.id
                        ? "ring-2 ring-foreground scale-105"
                        : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    {p.image_url && (
                      <Image
                        src={p.image_url}
                        alt={p.name}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

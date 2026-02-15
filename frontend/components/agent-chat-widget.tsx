"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Bot,
  X,
  Send,
  Search,
  Sparkles,
  Check,
  Loader2,
  ShoppingBag,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/types/product";
import type { AgentEvent } from "@/lib/agent/types";

// ── Message types ────────────────────────────────────────────────────────────

type ChatMessage =
  | { role: "user"; text: string }
  | { role: "thinking"; text: string }
  | { role: "searching"; query: string }
  | { role: "found"; count: number; query: string }
  | { role: "recommendation"; product: Product; reason: string }
  | { role: "done"; summary: string }
  | { role: "error"; text: string };

// ── Component ────────────────────────────────────────────────────────────────

const TRYON_KEY = "thread_tryon_product";

interface AgentChatWidgetProps {
  /** Called when user clicks a recommended product — scroll to it in the grid */
  onProductSelect?: (product: Product) => void;
}

export function AgentChatWidget({ onProductSelect }: AgentChatWidgetProps = {}) {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auth check
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setAuthed(!!user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  // ── Send message ──

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || running) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => [...prev, { role: "error", text: "Failed to start agent." }]);
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const raw = line.replace(/^data: /, "").trim();
          if (!raw) continue;

          try {
            const event: AgentEvent = JSON.parse(raw);
            setMessages((prev) => {
              switch (event.type) {
                case "thinking":
                  return [...prev, { role: "thinking", text: event.message }];
                case "searching":
                  return [...prev, { role: "searching", query: event.query }];
                case "found":
                  return [...prev, { role: "found", count: event.count, query: event.query }];
                case "recommendation":
                  return [...prev, { role: "recommendation", product: event.product, reason: event.reason }];
                case "done":
                  return [...prev, { role: "done", summary: event.summary }];
                case "error":
                  return [...prev, { role: "error", text: event.message }];
                default:
                  return prev;
              }
            });
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => [...prev, { role: "error", text: "Connection lost." }]);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [input, running]);

  function handleProductClick(product: Product) {
    if (onProductSelect) {
      onProductSelect(product);
    } else {
      sessionStorage.setItem(TRYON_KEY, JSON.stringify(product));
      router.push("/outfit?generate=true");
    }
  }

  // Don't render if not authenticated
  if (!authed) return null;

  return (
    <>
      {/* ── Floating button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg hover:scale-105 active:scale-95 transition-all"
          aria-label="Open Thread Bot"
        >
          <Bot size={24} />
        </button>
      )}

      {/* ── Slide-out panel ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex pointer-events-none">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 pointer-events-auto animate-in fade-in duration-200"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="pointer-events-auto ml-auto flex h-full w-full max-w-md flex-col bg-background border-l border-border shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Thread Bot</h2>
                  <p className="text-[10px] text-muted-foreground">Personal shopping agent</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.length === 0 && !running && (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary mb-4">
                    <Sparkles size={20} className="text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">What are you looking for?</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Describe an outfit, style, or specific item and I&apos;ll find the best matches for you.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2 justify-center">
                    {["casual summer outfit", "black jeans", "date night look", "gym clothes"].map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setInput(s);
                          setTimeout(() => inputRef.current?.focus(), 50);
                        }}
                        className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} onTryOn={handleProductClick} />
              ))}

              {running && (
                <div className="flex items-center gap-2 px-1 py-1">
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Thinking...</span>
                </div>
              )}
            </div>

            {/* Input bar */}
            <div className="shrink-0 border-t border-border p-4">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                  placeholder={running ? "Agent is working..." : "Describe what you want..."}
                  disabled={running}
                  className="w-full rounded-xl border border-border bg-secondary/50 py-3 pl-4 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none transition-colors disabled:opacity-50"
                />
                <button
                  onClick={send}
                  disabled={running || !input.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-30"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Message bubble renderer ──────────────────────────────────────────────────

function MessageBubble({
  msg,
  onTryOn,
}: {
  msg: ChatMessage;
  onTryOn: (product: Product) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-foreground px-4 py-2.5 text-sm text-background">
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.role === "thinking") {
    return (
      <div className="flex items-start gap-2">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-purple-400" />
        <p className="text-xs text-muted-foreground leading-relaxed">{msg.text}</p>
      </div>
    );
  }

  if (msg.role === "searching") {
    return (
      <div className="flex items-center gap-2">
        <Search size={14} className="shrink-0 text-blue-400" />
        <p className="text-xs text-muted-foreground">
          Searching: <span className="text-foreground/70">&quot;{msg.query}&quot;</span>
        </p>
      </div>
    );
  }

  if (msg.role === "found") {
    return (
      <div className="flex items-center gap-2">
        <Check size={14} className="shrink-0 text-green-400" />
        <p className="text-xs text-muted-foreground">
          Found {msg.count} products
        </p>
      </div>
    );
  }

  if (msg.role === "recommendation") {
    return (
      <button
        onClick={() => onTryOn(msg.product)}
        className="w-full text-left rounded-xl border border-border bg-secondary/30 p-3 hover:border-foreground/30 transition-colors cursor-pointer"
      >
        <div className="flex gap-3">
          {msg.product.image_url && (
            <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-secondary">
              <Image
                src={msg.product.image_url}
                alt={msg.product.name}
                fill
                className="object-cover"
                sizes="64px"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {msg.product.brand && (
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {msg.product.brand}
              </p>
            )}
            <p className="mt-0.5 text-xs font-semibold text-foreground leading-snug line-clamp-2">
              {msg.product.name}
            </p>
            {msg.product.price != null && (
              <p className="mt-1 text-xs font-bold text-foreground">
                ${msg.product.price.toFixed(2)}
              </p>
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
          {msg.reason}
        </p>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-[11px] font-medium text-background">
          View item
        </span>
      </button>
    );
  }

  if (msg.role === "done") {
    return (
      <div className="rounded-xl border border-foreground/20 bg-foreground/5 p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <ShoppingBag size={12} className="text-foreground" />
          <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">
            Outfit Complete
          </span>
        </div>
        <p className="text-xs text-foreground/80 leading-relaxed">{msg.summary}</p>
      </div>
    );
  }

  if (msg.role === "error") {
    return (
      <div className="flex items-start gap-2">
        <X size={14} className="mt-0.5 shrink-0 text-red-400" />
        <p className="text-xs text-red-400">{msg.text}</p>
      </div>
    );
  }

  return null;
}

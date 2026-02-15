"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_SUGGESTIONS = [
  "jeans men",
  "jeans women",
  "jeans men baggy",
  "jeans men slim fit",
  "jeans diesel men",
  "jeans",
  "jeans american eagle men",
  "jeans jacket men",
];

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
}

export function SearchModal({
  open,
  onOpenChange,
  initialQuery = "",
}: SearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  const runSearch = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      onOpenChange(false);
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    },
    [onOpenChange, router]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  const handleSuggestionClick = (suggestion: string) => {
    runSearch(suggestion);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-0 rounded-3xl border-0 p-0 shadow-2xl",
          "max-h-[85vh] overflow-y-auto bg-background border border-border",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        )}
      >
          <div className="flex flex-col p-6 pt-8 pb-12">
            {/* Search bar */}
            <form onSubmit={handleSubmit} className="mb-8">
              <div className="relative flex items-center rounded-full bg-secondary px-4 py-3">
                <Search
                  className="text-muted-foreground pointer-events-none size-5 shrink-0"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search..."
                  className="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 rounded-full flex-1 mx-3 h-auto py-0 text-base"
                  autoFocus
                  aria-label="Search"
                />
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-black/10 hover:text-foreground transition-colors"
                  aria-label="Close search"
                >
                  <X className="size-5" />
                </button>
              </div>
            </form>

            {/* Brands */}
            <h2 className="font-display text-xl font-normal text-foreground mb-4">
              Brands
            </h2>
            <div className="flex flex-col gap-3 mb-10">
              <button
                type="button"
                className="flex h-24 w-full items-center gap-4 overflow-hidden rounded-xl bg-secondary text-left transition-opacity hover:opacity-95"
                onClick={() => handleSuggestionClick("AG jeans")}
              >
                <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-background ml-4 text-sm font-semibold text-foreground">
                  AG
                </div>
                <span className="font-medium text-foreground/90">AG</span>
              </button>
              <button
                type="button"
                className="flex h-24 w-full items-center gap-4 overflow-hidden rounded-xl bg-[#2C2C2C] text-left transition-opacity hover:opacity-95"
                onClick={() => handleSuggestionClick("Silver Jeans Co")}
              >
                <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/10 ml-4 text-xs font-semibold text-white">
                  SJC
                </div>
                <span className="font-medium text-white/90">
                  Silver Jeans Co.
                </span>
              </button>
            </div>

            {/* Suggestions */}
            <h2 className="font-display text-xl font-normal text-foreground mb-4">
              Suggestions
            </h2>
            <ul className="flex flex-col">
              {DEFAULT_SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="flex w-full items-center justify-between py-3 text-left text-foreground hover:bg-muted/50 rounded-md px-2 -mx-2 transition-colors"
                  >
                    <span className="text-base">{suggestion}</span>
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
      </DialogContent>
    </Dialog>
  );
}

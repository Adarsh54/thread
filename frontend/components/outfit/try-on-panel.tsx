"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { X, Play } from "lucide-react";
import type { Product } from "@/types/product";

const TRYON_PRODUCT_KEY = "thread_tryon_product";

interface TryOnPanelProps {
  product: Product | null;
  onClose: () => void;
}

export function TryOnPanel({ product, onClose }: TryOnPanelProps) {
  const router = useRouter();

  if (!product) return null;

  const allImages: string[] = [
    product.image_url,
    ...((product.metadata?.all_images as string[]) ?? []),
  ].filter((url): url is string => !!url);

  const uniqueImages = [...new Set(allImages)].slice(0, 4);

  function handleTryOn() {
    sessionStorage.setItem(TRYON_PRODUCT_KEY, JSON.stringify(product));
    router.push("/outfit?generate=true");
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-background shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {product.brand}
            </p>
            <h2 className="text-lg font-semibold text-foreground">
              {product.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-secondary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Product images */}
          <div className="grid grid-cols-2 gap-1 p-1">
            {uniqueImages.map((url, i) => (
              <div
                key={i}
                className="relative aspect-[3/4] bg-secondary overflow-hidden"
              >
                <Image
                  src={url}
                  alt={`${product.name} view ${i + 1}`}
                  fill
                  className="object-cover"
                  sizes="300px"
                />
              </div>
            ))}
          </div>

          {/* Product details */}
          <div className="px-6 py-5">
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-semibold">
                {product.price != null ? `$${product.price.toFixed(2)}` : ""}
              </p>
              <p className="text-sm text-muted-foreground capitalize">
                {product.category}
              </p>
            </div>

            {product.description && (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-3">
                {product.description}
              </p>
            )}
          </div>

          {/* Try it on button */}
          <div className="px-6 pb-6">
            <button
              onClick={handleTryOn}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-3.5 text-sm font-semibold text-background hover:opacity-80 transition-opacity"
            >
              <Play size={16} />
              Try it on
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

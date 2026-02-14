"use client";

import { useState } from "react";
import { Header } from "@/components/header";
import { ProductGrid } from "@/components/outfit/product-grid";
import { TryOnPanel } from "@/components/outfit/try-on-panel";
import type { Product } from "@/types/product";

export default function CollectionsPage() {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  return (
    <main className="min-h-screen bg-white">
      <Header />
      <div className="pt-28" />

      <div className="mx-auto max-w-7xl px-6 md:px-12">
        <h1 className="text-4xl font-bold tracking-tight text-neutral-900 md:text-5xl">
          Collections
        </h1>
        <p className="mt-2 text-lg text-neutral-400">
          Browse and shop all pieces.
        </p>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8 md:px-12">
        <ProductGrid
          onSelect={setSelectedProduct}
          selectedId={selectedProduct?.id}
        />
      </div>

      {selectedProduct && (
        <TryOnPanel
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </main>
  );
}

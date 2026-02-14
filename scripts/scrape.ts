import { writeFileSync, mkdirSync } from "fs";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  name: string;
  description: string | null;
  image_url: string | null;
  price: number | null;
  category: string | null;
  brand: string | null;
  source: string;
  metadata: Record<string, unknown>;
}

// ── Shopify Scraper ───────────────────────────────────────────────────────────

const SHOPIFY_STORES: { domain: string; brand: string; maxPages: number }[] = [
  { domain: "kith.com", brand: "Kith", maxPages: 8 },
  { domain: "allbirds.com", brand: "Allbirds", maxPages: 5 },
  { domain: "gymshark.com", brand: "Gymshark", maxPages: 8 },
  { domain: "fashionnova.com", brand: "Fashion Nova", maxPages: 8 },
  { domain: "outdoorvoices.com", brand: "Outdoor Voices", maxPages: 5 },
  { domain: "cotopaxi.com", brand: "Cotopaxi", maxPages: 5 },
  { domain: "rebeccaminkoff.com", brand: "Rebecca Minkoff", maxPages: 5 },
  { domain: "taylorstitch.com", brand: "Taylor Stitch", maxPages: 5 },
  { domain: "everlane.com", brand: "Everlane", maxPages: 8 },
];

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function scrapeShopifyStore(
  domain: string,
  brand: string,
  maxPages: number
): Promise<Product[]> {
  const products: Product[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://${domain}/products.json?limit=250&page=${page}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ThreadBot/1.0)" },
      });

      if (!res.ok) {
        console.warn(`  [${domain}] page ${page}: HTTP ${res.status}, stopping`);
        break;
      }

      const data = await res.json();
      const items = data.products ?? [];

      if (items.length === 0) break;

      for (const p of items) {
        const firstImage = p.images?.[0]?.src ?? null;
        const firstVariant = p.variants?.[0];
        const price = firstVariant?.price ? parseFloat(firstVariant.price) : null;
        const description = p.body_html ? stripHtml(p.body_html) : null;

        products.push({
          name: p.title,
          description,
          image_url: firstImage,
          price,
          category: p.product_type || null,
          brand: p.vendor || brand,
          source: domain,
          metadata: {
            tags: p.tags ?? [],
            handle: p.handle,
            shopify_id: p.id,
            all_images: (p.images ?? []).map((img: { src: string }) => img.src),
            variants: (p.variants ?? []).map(
              (v: { title: string; price: string; available: boolean }) => ({
                title: v.title,
                price: v.price,
                available: v.available,
              })
            ),
          },
        });
      }

      console.log(`  [${domain}] page ${page}: ${items.length} products`);

      if (items.length < 250) break;

      // Rate limit: 500ms between pages
      await sleep(500);
    } catch (err) {
      console.warn(`  [${domain}] page ${page} error:`, (err as Error).message);
      break;
    }
  }

  return products;
}

async function scrapeAllShopify(): Promise<Product[]> {
  console.log("\n--- Scraping Shopify stores ---");
  const allProducts: Product[] = [];

  for (const store of SHOPIFY_STORES) {
    console.log(`\n> ${store.brand} (${store.domain})`);
    const products = await scrapeShopifyStore(
      store.domain,
      store.brand,
      store.maxPages
    );
    console.log(`  Total: ${products.length} products`);
    allProducts.push(...products);
    // Rate limit between stores
    await sleep(1000);
  }

  return allProducts;
}

// ── DummyJSON Scraper ─────────────────────────────────────────────────────────

const DUMMYJSON_CATEGORIES = [
  "mens-shirts",
  "mens-shoes",
  "womens-dresses",
  "womens-shoes",
  "womens-bags",
  "tops",
  "sunglasses",
];

async function scrapeDummyJson(): Promise<Product[]> {
  console.log("\n--- Scraping DummyJSON ---");
  const products: Product[] = [];

  for (const cat of DUMMYJSON_CATEGORIES) {
    const url = `https://dummyjson.com/products/category/${cat}?limit=50`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      const items = data.products ?? [];

      for (const p of items) {
        products.push({
          name: p.title,
          description: p.description ?? null,
          image_url: p.thumbnail ?? p.images?.[0] ?? null,
          price: p.price ?? null,
          category: cat.replace(/-/g, " "),
          brand: p.brand ?? "DummyJSON",
          source: "dummyjson.com",
          metadata: {
            rating: p.rating,
            stock: p.stock,
            all_images: p.images ?? [],
            dummyjson_id: p.id,
          },
        });
      }

      console.log(`  [${cat}] ${items.length} products`);
    } catch (err) {
      console.warn(`  [${cat}] error:`, (err as Error).message);
    }
  }

  return products;
}

// ── Fake Store API Scraper ────────────────────────────────────────────────────

async function scrapeFakeStoreApi(): Promise<Product[]> {
  console.log("\n--- Scraping Fake Store API ---");
  const products: Product[] = [];

  try {
    const res = await fetch("https://fakestoreapi.com/products");
    const items = await res.json();

    for (const p of items) {
      if (!["men's clothing", "women's clothing", "jewelery"].includes(p.category))
        continue;

      products.push({
        name: p.title,
        description: p.description ?? null,
        image_url: p.image ?? null,
        price: p.price ?? null,
        category: p.category,
        brand: "Fake Store",
        source: "fakestoreapi.com",
        metadata: {
          rating: p.rating,
          fakestore_id: p.id,
        },
      });
    }

    console.log(`  ${products.length} clothing products`);
  } catch (err) {
    console.warn("  error:", (err as Error).message);
  }

  return products;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("thread product scraper\n");

  // Scrape all sources (Shopify is sequential to avoid rate limits; APIs in parallel)
  const [shopify, dummy, fakeStore] = await Promise.all([
    scrapeAllShopify(),
    scrapeDummyJson(),
    scrapeFakeStoreApi(),
  ]);

  const allProducts = [...shopify, ...dummy, ...fakeStore];

  console.log(`\n--- Summary ---`);
  console.log(`  Shopify:    ${shopify.length}`);
  console.log(`  DummyJSON:  ${dummy.length}`);
  console.log(`  FakeStore:  ${fakeStore.length}`);
  console.log(`  Total:      ${allProducts.length}`);

  // Filter out products without images or names
  const valid = allProducts.filter((p) => p.name && p.image_url);
  console.log(`  Valid (has name + image): ${valid.length}`);

  if (valid.length === 0) {
    console.log("No products scraped.");
    return;
  }

  // Save to JSON file
  mkdirSync("data", { recursive: true });
  writeFileSync("data/products.json", JSON.stringify(valid, null, 2));
  console.log(`\nSaved to scripts/data/products.json`);

  // If Supabase env vars are set, also upload directly
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, key);
    await uploadToSupabase(supabase, valid);
  } else {
    console.log(
      "\nNo SUPABASE_SERVICE_ROLE_KEY set — skipping direct upload."
    );
    console.log("Products saved to data/products.json for manual upload.");
  }
}

async function uploadToSupabase(
  supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>,
  products: Product[]
): Promise<void> {
  console.log(`\n--- Uploading ${products.length} products to Supabase ---`);

  const BATCH_SIZE = 200;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from("products")
      .upsert(batch, { onConflict: "source,name,brand", ignoreDuplicates: true })
      .select("id");

    if (error) {
      console.warn(
        `  Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${error.message}`
      );
      for (const product of batch) {
        const { error: singleErr } = await supabase
          .from("products")
          .upsert(product, {
            onConflict: "source,name,brand",
            ignoreDuplicates: true,
          });
        if (singleErr) skipped++;
        else inserted++;
      }
    } else {
      inserted += data?.length ?? batch.length;
    }

    const pct = Math.round(((i + batch.length) / products.length) * 100);
    process.stdout.write(
      `\r  Progress: ${pct}% (${inserted} inserted, ${skipped} skipped)`
    );
  }

  console.log(`\n  Done: ${inserted} inserted, ${skipped} skipped`);

  const { count } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true });
  console.log(`\n  Total products in database: ${count}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

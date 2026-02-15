# Thread

**One-liner:** An AI-powered fashion platform that lets you search, discover, and virtually try on clothes using your own photo — generating personalized video try-ons with Google Veo 3.1.

---

## Inspiration

Online shopping is broken. You scroll through hundreds of flat product images, guess how something might look on you, order it, and return half of it. We wanted to build the future of fashion e-commerce — one where AI closes the gap between browsing and trying on. What if you could see *yourself* wearing any garment before you buy it? What if a personal shopping agent knew your style, your body, and your budget, and could find exactly what you're looking for in seconds?

Thread was born from the frustration of returns, size charts, and the disconnect between how clothes look on a model versus on you.

## What it does

Thread is a full-stack AI fashion platform with four core experiences:

- **AI Virtual Try-On** — Upload your photo and select any product. Thread sends both your photo and the garment image as reference images to Google Veo 3.1, generating a personalized fashion video of *you* wearing the outfit. Gemini 2.5 Flash pre-analyzes both the product (fabric, fit, color, pattern) and your appearance (build, hair, skin tone, gender) to craft a detailed cinematic prompt.

- **3D Body Model** — An interactive mannequin built with mannequin-js and Three.js, calibrated to your body measurements (height, weight, gender, fit preference). Drag to rotate, scroll to zoom. The mannequin recolors to match the selected garment's dominant color, extracted via AI with a pixel-sampling fallback.

- **AI Shopping Agent (Thread Bot)** — A conversational shopping assistant powered by Gemini 2.0 Flash with tool-calling. It searches the catalog semantically, recommends products based on your style preferences and feedback, and refines results across multiple rounds. The bento grid UI shows activity, product tiles with like/pass buttons, and a liked items strip.

- **Semantic Search** — Natural language product search powered by Elasticsearch kNN with vector embeddings. Search "cozy oversized sweater for fall" and get ranked results by semantic similarity, not just keyword matching. Includes a 3D product graph visualization where search results light up within the full catalog.

## How we built it

**Frontend:** Next.js 16 (App Router) with React 19, Tailwind CSS 4, Radix UI primitives, and shadcn/ui components. Deployed on Vercel.

**Backend & Data:**
- **Supabase** — PostgreSQL database for products, user preferences, try-on history, and agent feedback. Supabase Auth for authentication. Supabase Storage for user photos and generated try-on videos.
- **Elasticsearch** — Vector search engine with kNN index for semantic product search. Embeddings generated via Elasticsearch's built-in inference API.
- **Product scraper** — Custom TypeScript scraper that pulls real product data from Shopify stores (Kith, Everlane, Gymshark, Allbirds, Fashion Nova, and more) via their public JSON APIs.

**AI/ML Stack:**
- **Google Gemini 2.5 Flash** — Product image analysis (garment type, fabric, color, fit, pattern, features) and person photo analysis (build, hair, age, skin tone, gender). Structured JSON output.
- **Google Gemini 2.0 Flash** — Powers the shopping agent with function-calling for catalog search and multi-round recommendation refinement.
- **Google Veo 3.1 Fast** — Video generation with dual reference images (user photo + product image as ASSET references) for personalized try-on videos.
- **sharp + heic-convert** — Server-side image processing for photo uploads, including HEIC/HEIF conversion for iOS photos.

**3D:** mannequin-js for parametric body models, Three.js OrbitControls for interactive manipulation, React Three Fiber for rendering.

## Challenges we ran into

- **Veo reference images** — Getting Veo to generate videos that actually look like the user required passing both the person's photo and the product image as ASSET reference images, plus crafting detailed prompts with AI-extracted appearance attributes. Text-only descriptions produced generic models.

- **HEIC photo uploads** — iOS users upload HEIC photos by default, but sharp doesn't ship with HEIC codec support. We had to add heic-convert as a pure-JS preprocessing step that detects HEIC files by extension, MIME type, and magic bytes before converting to JPEG.

- **Vercel serverless limits** — Video generation returns 5-20MB of video data, exceeding Vercel's ~4.5MB response body limit. We pivoted to uploading generated videos to Supabase Storage and returning the public URL instead. Also hit function timeout limits (10s default) and needed `maxDuration` on multiple routes.

- **Mannequin interactivity** — mannequin-js creates its own Three.js renderer and scene internally. Since we extract the canvas and manage it ourselves, the built-in controls weren't initialized. We had to create our own OrbitControls and hook into mannequin-js's `animationLoop` callback for per-frame updates.

- **Semantic search quality** — Getting vector search to return relevant results required tuning the embedding pipeline, implementing relevance score cutoffs, and building a sync layer between Supabase (source of truth) and Elasticsearch (search index).

## Accomplishments that we're proud of

- **True personalized try-on** — Not just "here's a generic model wearing the shirt." Thread uses your actual photo as a reference image, so the generated video depicts your face, your body, your hair. Combined with AI-extracted attributes and gender, the results feel personal.

- **End-to-end AI pipeline** — From product scraping to embedding generation to semantic search to AI analysis to video generation, every step is automated and connected. Select a product, and the system analyzes it, builds your body model, and generates a cinematic try-on video.

- **The shopping agent** — A multi-round conversational agent that actually understands fashion context. It searches semantically, respects your preferences, learns from like/dislike feedback across rounds, and surfaces increasingly relevant recommendations.

- **Real product data** — Not mock data. Thread scrapes real products from real fashion brands, with real images, real prices, and real descriptions.

## What we learned

- Veo 3.1's reference image feature is powerful but requires careful prompt engineering to maintain character consistency — the AI-extracted appearance description combined with the photo reference produces significantly better results than either alone.

- Elasticsearch's built-in inference API makes vector search surprisingly accessible — you don't need a separate embedding service or model hosting.

- Building for serverless (Vercel) forces good architectural decisions: streaming responses, offloading large payloads to object storage, and keeping function execution times bounded.

- The gap between "AI can do this" and "AI does this reliably in production" is significant. Every AI feature needed fallback paths, error handling, and graceful degradation.

## What's next for Thread

- **Real-time virtual try-on** — Using Veo's image-to-video with webcam frames for live try-on, instead of pre-recorded video generation.
- **Outfit builder** — Combine multiple products (top + bottom + shoes) into a single styled outfit with a unified try-on video.
- **Social features** — Share try-on videos, save outfits, get feedback from friends.
- **Size recommendation** — Use body measurements and garment analysis to predict the best size, reducing returns.
- **More brands** — Expand the product catalog with more scrapers and brand partnerships.
- **Fine-tuned style model** — Train on user feedback data to build a personalized style profile that improves recommendations over time.

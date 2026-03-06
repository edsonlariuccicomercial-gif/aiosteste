// Fetch all product images from Asia Import Next.js API
// Usage: node fetch-images.js

const fs = require('fs');
const path = require('path');

const BUILD_ID = 'V_Q2yKOfYKlQdRb2c3AbB';
const BASE = `https://www.asiaimport.com.br/_next/data/${BUILD_ID}/produto`;
const BATCH_SIZE = 10;
const DELAY_MS = 300;

async function main() {
  const products = JSON.parse(fs.readFileSync(path.join(__dirname, 'products-reseller.json'), 'utf8'));
  const slugs = products.products.map(p => ({ slug: p.slug, id: p.id }));

  console.log(`Fetching images for ${slugs.length} products...`);

  const imageMap = {};
  let done = 0;
  let failed = 0;

  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const batch = slugs.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async ({ slug, id }) => {
        const url = `${BASE}/${slug}.json`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status} for ${slug}`);
        const data = await res.json();
        const imgs = (data.pageProps?.product?.images || []).map(img => ({
          src: img.src,
          thumb: img.thumbnail || img.src
        }));
        return { id: String(id), slug, images: imgs };
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.images.length > 0) {
        imageMap[r.value.id] = r.value.images;
        done++;
      } else {
        failed++;
      }
    }

    const pct = Math.round((i + batch.length) / slugs.length * 100);
    process.stdout.write(`\r[${pct}%] ${done} ok, ${failed} failed, ${i + batch.length}/${slugs.length}`);

    if (i + BATCH_SIZE < slugs.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\nDone! ${done} products with images, ${failed} failed`);

  const outPath = path.join(__dirname, 'product-images.json');
  fs.writeFileSync(outPath, JSON.stringify(imageMap, null, 2));
  console.log(`Saved to ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`);

  // Stats
  const counts = Object.values(imageMap).map(arr => arr.length);
  const avg = (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  console.log(`Images per product: avg=${avg}, min=${min}, max=${max}`);
}

main().catch(e => { console.error(e); process.exit(1); });

// Netlify Function: fetch products from supplier API, apply markup, return JSON
// Simplified: only fetches product pages (fast), uses static category/subcategory/image maps
const MARKUP = 1.6;
const API_BASE = 'https://s.asiaimport.com.br/wp-json/hg/products';
const ADMIN_USER = 'lariucci';
const ADMIN_PASS = 'lariucci@2025';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Auth check — decode body (may be base64-encoded on Netlify)
  let rawBody = event.body || '{}';
  if (event.isBase64Encoded) {
    rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
  }

  let user, pass;
  try {
    const body = JSON.parse(rawBody);
    user = body.user;
    pass = body.pass;
  } catch(e) {}

  user = (user || '').trim().toLowerCase();
  pass = (pass || '').trim().toLowerCase();

  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Usuario ou senha incorretos' }) };
  }

  try {
    // Fetch all 5 product pages in parallel (fast)
    const pagePromises = [];
    for (let i = 1; i <= 5; i++) {
      pagePromises.push(
        fetch(`${API_BASE}?per_page=100&page=${i}`).then(r => r.json())
      );
    }
    const pages = await Promise.all(pagePromises);

    const allRaw = [];
    for (const data of pages) {
      if (data.products) allRaw.push(...data.products);
    }

    // Build products with markup (category/subcategory/image data comes from client-side merge)
    const allProducts = allRaw.map(p => {
      const origPrice = parseFloat(p.price);
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        slug: p.slug,
        originalPrice: origPrice,
        price: Math.round(origPrice * MARKUP * 100) / 100,
        salePrice: p.sale_price ? Math.round(parseFloat(p.sale_price) * MARKUP * 100) / 100 : null,
        stock: p.stock_quantity,
        mainImage: p.images?.[0]?.src || '',
        allImages: (p.images || []).map(img => img.src),
        colors: (p.variations || []).map(v => ({
          name: v.colors?.name,
          hex: v.colors?.color,
          origPrice: parseFloat(v.price),
          price: Math.round(parseFloat(v.price) * MARKUP * 100) / 100
        })).filter(v => v.name),
        tags: (p.tags || []).map(t => ({ name: t.name, slug: t.slug, bg: t.color_bg, text: t.color_text })),
        video: p.video_product?.[0]?.embedUrl?.[0] || null,
        susceptible: p.susceptible_product || false,
        categories: [],
        subcategories: [],
        thumbs: []
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        meta: {
          source: 'LARIUCCI Brindes',
          markup: '60%',
          totalProducts: allProducts.length,
          generatedAt: new Date().toISOString()
        },
        products: allProducts
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Falha ao buscar produtos', details: error.message })
    };
  }
};

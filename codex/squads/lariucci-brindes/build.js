// Build script: fetches fresh products from Asia Import API,
// merges with static category/subcategory/image maps, generates products-reseller.json
const fs = require('fs');
const path = require('path');

const MARKUP = 1.6;
const API_BASE = 'https://s.asiaimport.com.br/wp-json/hg/products';
const dataDir = path.join(__dirname, 'data');

async function build() {
  console.log('Fetching fresh products from Asia Import...');

  // Fetch all 5 pages in parallel
  const pagePromises = [];
  for (let i = 1; i <= 5; i++) {
    pagePromises.push(
      fetch(`${API_BASE}?per_page=100&page=${i}`)
        .then(r => r.json())
        .then(d => { console.log(`  Page ${i}: ${d.products?.length || 0} products`); return d; })
    );
  }
  const pages = await Promise.all(pagePromises);

  const allRaw = [];
  for (const data of pages) {
    if (data.products) allRaw.push(...data.products);
  }
  console.log(`Total raw products: ${allRaw.length}`);

  // Load static maps
  const categories = JSON.parse(fs.readFileSync(path.join(dataDir, 'categories.json'), 'utf8'));
  const catProductMap = JSON.parse(fs.readFileSync(path.join(dataDir, 'category-map.json'), 'utf8'));

  let productImagesMap = {};
  try {
    productImagesMap = JSON.parse(fs.readFileSync(path.join(dataDir, 'product-images.json'), 'utf8'));
    console.log(`Loaded images for ${Object.keys(productImagesMap).length} products`);
  } catch (e) {
    console.log('No product-images.json found, using API images only');
  }

  let subcatMapRaw = {};
  try {
    subcatMapRaw = JSON.parse(fs.readFileSync(path.join(dataDir, 'subcategory-map.json'), 'utf8'));
  } catch (e) {
    console.log('No subcategory-map.json found');
  }

  // Build reverse maps
  const productCatMap = {};
  for (const [catSlug, catData] of Object.entries(catProductMap)) {
    const pids = catData.productIds || catData;
    if (Array.isArray(pids)) {
      for (const pid of pids) {
        if (!productCatMap[pid]) productCatMap[pid] = [];
        productCatMap[pid].push(catSlug);
      }
    }
  }

  const productSubcatMap = {};
  for (const [slug, pids] of Object.entries(subcatMapRaw)) {
    if (Array.isArray(pids)) {
      for (const pid of pids) {
        if (!productSubcatMap[pid]) productSubcatMap[pid] = [];
        if (!productSubcatMap[pid].includes(slug)) productSubcatMap[pid].push(slug);
      }
    }
  }

  // Build enriched products
  const allProducts = allRaw.map(p => {
    const origPrice = parseFloat(p.price);
    const imgData = productImagesMap[p.id];
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      originalPrice: origPrice,
      price: Math.round(origPrice * MARKUP * 100) / 100,
      salePrice: p.sale_price ? Math.round(parseFloat(p.sale_price) * MARKUP * 100) / 100 : null,
      stock: p.stock_quantity,
      mainImage: imgData?.[0]?.src || p.images?.[0]?.src || '',
      allImages: imgData?.map(img => img.src) || (p.images || []).map(img => img.src),
      thumbs: imgData?.map(img => img.thumb) || [],
      colors: (p.variations || []).map(v => ({
        name: v.colors?.name,
        hex: v.colors?.color,
        origPrice: parseFloat(v.price),
        price: Math.round(parseFloat(v.price) * MARKUP * 100) / 100
      })).filter(v => v.name),
      tags: (p.tags || []).map(t => ({ name: t.name, slug: t.slug, bg: t.color_bg, text: t.color_text })),
      video: p.video_product?.[0]?.embedUrl?.[0] || null,
      susceptible: p.susceptible_product || false,
      categories: productCatMap[p.id] || [],
      subcategories: productSubcatMap[p.id] || []
    };
  });

  // Category tree
  const catMap = {};
  for (const c of categories) {
    catMap[c.id] = { id: c.id, name: c.name, slug: c.slug, parent: c.parent, count: c.count, children: [] };
  }
  const rootCats = [];
  for (const c of Object.values(catMap)) {
    if (c.parent === 0) rootCats.push(c);
    else if (catMap[c.parent]) catMap[c.parent].children.push(c);
  }

  // Menu structure
  const menuStructure = [
    { name: 'Novidades', slug: 'novidades', type: 'tags', children: [
      { name: 'Lançamentos', slug: 'lancamento', type: 'tag' },
      { name: 'Oportunidades', slug: 'oportunidade', type: 'tag' },
      { name: 'Promoções', slug: 'promocoes', type: 'tag' },
      { name: 'Reposições', slug: 'reposicao', type: 'tag' }
    ]},
    { name: 'Mochilas & Malas', slug: 'mochilas-e-malas', type: 'category', children: [
      { name: 'Bolsas Térmicas', slug: 'bolsas-termicas', type: 'subcategory' },
      { name: 'Bolsas Multifuncional', slug: 'bolsa-mochila-maternidade', type: 'subcategory' },
      { name: 'Malas & Maletas', slug: 'malas-viagem', type: 'subcategory', children: [
        { name: 'Esportivas', slug: 'malas-esportivas' }, { name: 'Viagem', slug: 'malas-viagem-malas-viagem' }, { name: 'Executivas', slug: 'pastas-executivas' }
      ]},
      { name: 'Mochilas', slug: 'mochilas', type: 'subcategory', children: [
        { name: 'Antifurto', slug: 'antifurto' }, { name: 'C/ Térmica', slug: 'mochila-c-termica' }, { name: 'C/ Expansor', slug: 'com-expansor' },
        { name: 'Pasta', slug: 'mochila-pasta' }, { name: 'Premium', slug: 'premium' }, { name: 'P/ Notebooks', slug: 'p-notebooks' }
      ]},
      { name: 'Nécessaire', slug: 'necessaire', type: 'subcategory' },
      { name: 'Sacolas', slug: 'sacolas', type: 'subcategory', children: [
        { name: 'Algodão', slug: 'algodao' }, { name: 'Algodão & Juta', slug: 'algodao-juta' }, { name: 'Poliéster & TNT', slug: 'poliester-e-tnt' }
      ]}
    ]},
    { name: 'Escritório', slug: 'escritorio', type: 'category', children: [
      { name: 'Blocos de Anotações', slug: 'blocos-de-anotacoes', type: 'subcategory' },
      { name: 'Cadernos', slug: 'cadernos-pastas', type: 'subcategory', children: [
        { name: 'Brochura', slug: 'caderno-brochura' }, { name: 'Espiral', slug: 'caderno-espiral' }, { name: 'Com Caneta', slug: 'caderno-c-caneta' }
      ]},
      { name: 'Canetas', slug: 'canetas', type: 'subcategory', children: [
        { name: 'Bambu', slug: 'bambu' }, { name: 'Metálicas', slug: 'metalicas' }, { name: 'Plásticas', slug: 'c-plasticas' },
        { name: 'Roller', slug: 'caneta-roller' }, { name: 'Touch', slug: 'touch' }
      ]},
      { name: 'Estojos', slug: 'estojos', type: 'subcategory' },
      { name: 'Pasta Convenção', slug: 'pasta-convencao', type: 'subcategory' },
      { name: 'Kit Escritório', slug: 'kit-escritorio', type: 'subcategory', children: [
        { name: 'Acessórios', slug: 'acessorios-acessorios' }, { name: 'Conjuntos', slug: 'conjuntos-escritorio' }
      ]}
    ]},
    { name: 'Canecas & Garrafas', slug: 'canecas-e-garrafas', type: 'category', children: [
      { name: 'Canecas', slug: 'canecas', type: 'subcategory', children: [
        { name: 'Inox', slug: 'inox-canecas' }, { name: 'Plástica', slug: 'plastica' }, { name: 'Vidro Borossilicato', slug: 'vidro-canecas' }
      ]},
      { name: 'Copos', slug: 'copos', type: 'subcategory', children: [
        { name: 'Ecológico', slug: 'ecologico' }, { name: 'Inox', slug: 'copo-inox' }, { name: 'Térmico', slug: 'copo-termico' }, { name: 'Vidro', slug: 'copo-vidro' }
      ]},
      { name: 'Garrafas', slug: 'garrafas', type: 'subcategory', children: [
        { name: 'Alumínio', slug: 'aluminio' }, { name: 'Inox', slug: 'inox' }, { name: 'Térmica', slug: 'termica' },
        { name: 'Térmica c/ Copo', slug: 'termica-c-copo' }, { name: 'Plásticas e PET', slug: 'plasticas' }
      ]},
      { name: 'Xícaras', slug: 'xicaras', type: 'subcategory' }
    ]},
    { name: 'Diversos', slug: 'diversos', type: 'category', children: [
      { name: 'Chaveiros', slug: 'chaveiros', type: 'subcategory' },
      { name: 'Guarda Chuvas & Lancheiras', slug: 'guarda-chuvas', type: 'subcategory' },
      { name: 'Churrasco & Vinho & Drink', slug: 'kit-churrasco-e-vinho', type: 'subcategory' },
      { name: 'Kit Ferramenta', slug: 'kit-ferramenta', type: 'subcategory' },
      { name: 'Umidificadores', slug: 'umidificadores', type: 'subcategory' }
    ]}
  ];

  const output = {
    meta: {
      source: 'LARIUCCI Brindes',
      markup: '60%',
      totalProducts: allProducts.length,
      generatedAt: new Date().toISOString()
    },
    categories: rootCats,
    menu: menuStructure,
    products: allProducts
  };

  fs.writeFileSync(path.join(dataDir, 'products-reseller.json'), JSON.stringify(output));
  console.log(`\nBuild complete: ${allProducts.length} products with 60% markup`);
  console.log(`Generated at: ${output.meta.generatedAt}`);
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});

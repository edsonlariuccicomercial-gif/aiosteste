# Task: Shopify GEO Audit

## Metadata
- **id:** audit-shopify
- **agent:** geo-seo-chief
- **elicit:** false
- **command:** `*shopify-audit {url}`

## Description
Auditoria GEO específica para lojas Shopify. Inclui todos os checks standard MAIS verificações específicas de Shopify.

## Execution

### Step 1: Detect Shopify
Confirmar que é Shopify:
- `WebFetch {url}` → procurar `Shopify.theme`, `cdn.shopify.com`, `myshopify.com`
- Se não for Shopify → avisar e executar `*audit` standard

### Step 2: Standard Audit
Executar todos os steps de `run-audit.md` (crawl + 5 módulos + aggregate).

### Step 3: Shopify-Specific Checks
Adicionar estes checks aos módulos correspondentes:

#### Schema (Dixon Jones)
| Check | Severidade | O que verificar |
|-------|-----------|-----------------|
| Product schema do tema | CRITICAL | Shopify temas geram Product schema automaticamente — mas frequentemente incompleto (sem `brand`, sem `review`, sem `sku`) |
| Offer schema | CRITICAL | `price`, `priceCurrency`, `availability`, `url` — temas básicos omitem campos |
| AggregateRating | HIGH | Se a loja tem reviews (Judge.me, Loox, Yotpo), verificar se geram schema |
| Collection schema | HIGH | Páginas de colecção raramente têm `CollectionPage` ou `ItemList` schema |
| BreadcrumbList | MEDIUM | Verificar se o tema gera BreadcrumbList JSON-LD |
| Organization | CRITICAL | Temas Shopify raramente incluem Organization schema na homepage |
| LocalBusiness | HIGH | Se tem loja física, verificar `LocalBusiness` |

#### Technical (Mike King)
| Check | Severidade | O que verificar |
|-------|-----------|-----------------|
| Shopify sitemap | MEDIUM | `/sitemap.xml` auto-gerado — verificar se inclui todos os produtos e colecções |
| Duplicate content | HIGH | Shopify cria URLs duplicados: `/products/x` e `/collections/y/products/x` — verificar canonical |
| Pagination | MEDIUM | Colecções com 50+ produtos — verificar `rel=next/prev` ou infinite scroll |
| Theme speed | HIGH | Temas pesados (Dawn vs custom) — impacto em Core Web Vitals |
| Metafields | MEDIUM | Shopify metafields podem alimentar schema — verificar se estão configurados |

#### LLM Readability (Olaf Kopp)
| Check | Severidade | O que verificar |
|-------|-----------|-----------------|
| Product descriptions | HIGH | Muitas lojas Shopify têm descrições copiadas do fornecedor — conteúdo duplicado = baixa citabilidade |
| Collection descriptions | HIGH | Páginas de colecção sem texto = zero contexto para LLMs |
| Blog | MEDIUM | Shopify tem blog built-in — verificar se está a ser usado |
| FAQ na PDP | MEDIUM | Product Detail Pages sem FAQ — oportunidade perdida |

#### Entity Identity (Jason Barnard)
| Check | Severidade | O que verificar |
|-------|-----------|-----------------|
| Shopify store name vs brand | MEDIUM | O nome no Shopify admin pode ser diferente do nome de marca — verificar consistência |
| About page | HIGH | Lojas Shopify frequentemente não têm página "Sobre Nós" substancial |
| Contact schema | HIGH | Verificar se contacto está em schema (não só no footer) |

Frases de impacto para lojas Shopify:

```
- "O tema Shopify gera schema Product incompleto — Google so ve {X}% dos dados dos seus produtos"
- "{N} produtos sem descricao unica — a IA trata como conteudo duplicado"
- "Paginas de coleccao sem texto — {N} categorias invisiveis para LLMs"
- "URLs duplicados: cada produto tem 2 URLs — Google pode penalizar"
- "Blog Shopify vazio — a ferramenta existe mas nao esta a ser usada"
- "Reviews de clientes sem schema — {N} avaliacoes que a IA nao ve"
```

```
Schema Product completo
Correcao de duplicados
Descricoes optimizadas
Blog e-commerce
```

## Veto Conditions
- Site não é Shopify → executar `*audit` standard em vez deste
- Shopify em modo password/manutenção → ABORT

## Output
```
squads/geo-seo/outputs/audit-{mode}-{domain}.html
```
Com tag "E-commerce" no header eyebrow.

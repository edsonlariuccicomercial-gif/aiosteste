# GEO/SEO Squad — Workflows

## 1. Full GEO Audit (`*audit {url}`)

Auditoria completa com diagnóstico e plano de acção.

```
User → *audit {url}
         │
         ▼
┌── FASE 1: CRAWL ──────────────────────────┐
│  GEO Commander crawla URL + sitemap        │
│  Detecta CMS (Shopify/WP/Custom)           │
│  Extrai HTML, meta, schema, headers, links │
└────────────────┬───────────────────────────┘
                 │
                 ▼
┌── FASE 2: PARALLEL AUDIT ─────────────────┐
│                                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│  │ Barnard │ │  Kopp   │ │  King   │     │
│  │ Entity  │ │  LLM    │ │ Technic │     │
│  │Identity │ │Readabil.│ │Relevance│     │
│  └────┬────┘ └────┬────┘ └────┬────┘     │
│       │            │           │           │
│  ┌────┴────┐ ┌────┴────┐                 │
│  │  Jones  │ │ Fishkin │                  │
│  │ Schema  │ │Audience │                  │
│  │ Entity  │ │Strategy │                  │
│  └────┬────┘ └────┬────┘                 │
└───────┼────────────┼──────────────────────┘
        │            │
        ▼            ▼
┌── FASE 3: AGGREGATE (Solis) ──────────────┐
│  Recebe 5 sub-scores                       │
│  Calcula GEO Score (0-100)                 │
│  Prioriza acções (impacto × esforço)       │
│  Gera relatório (mode: full)               │
│  Output: PDF/Markdown 20-30 páginas        │
└────────────────────────────────────────────┘
```

## 2. Shopify Audit (`*shopify-audit {url}`)

Auditoria com heurísticas específicas para Shopify.

```
User → *shopify-audit {url}
         │
         ▼
  Full audit + Shopify-specific checks:
  - Product schema completude
  - Collection/category structure
  - Liquid template meta tags
  - Shopify sitemap verification
  - Theme schema defaults vs custom
```

## 3. Competitor Compare (`*compare {url1} {url2}`)

```
User → *compare {url1} {url2}
         │
         ▼
  Run *score em ambos → tabela comparativa
  Highlight: onde url1 ganha, onde perde
  Competitor AI visibility (Fishkin)
```

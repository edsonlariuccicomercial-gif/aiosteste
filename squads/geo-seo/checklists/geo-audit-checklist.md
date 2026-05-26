# GEO Audit Checklist

## Pre-Audit
- [ ] URL válido e acessível
- [ ] Modo: completo
- [ ] Nome da marca identificado

## Crawl & Detect
- [ ] Homepage fetched — HTML, meta, headings, schema, links
- [ ] robots.txt analisado — AI bots, crawl-delay, sitemap
- [ ] Sitemap verificado — page count, structure
- [ ] /llms.txt verificado (exists | not found)
- [ ] CMS detectado (Shopify | WordPress | WooCommerce | custom)
- [ ] E-commerce identificado (sim | não)
- [ ] Se e-commerce: página de produto verificada
- [ ] Presença externa pesquisada (reviews, menções, ratings)

## Module: Entity Identity (Barnard)
- [ ] Entity Home identificado
- [ ] Schema Organization verificado
- [ ] Knowledge Graph presence checked
- [ ] Corroboration Threshold avaliado
- [ ] Brand SERP analisado
- [ ] sameAs links verificados
- [ ] Score calculado (0-100)

## Module: Entity & Schema (Jones)
- [ ] Todos os schemas presentes listados
- [ ] Schemas em falta identificados
- [ ] Product/Offer schema (se e-commerce)
- [ ] FAQPage, HowTo, BreadcrumbList
- [ ] Review/AggregateRating
- [ ] LocalBusiness (se lojas físicas)
- [ ] Validação JSON-LD
- [ ] Score calculado (0-100)

## Module: LLM Readability (Kopp)
- [ ] Chunk quality avaliada
- [ ] Fact density medida
- [ ] Content structure analisada
- [ ] Information hierarchy verificada
- [ ] AI crawler access verificado
- [ ] llms.txt status
- [ ] Score calculado (0-100)

## Module: Technical Relevance (King)
- [ ] Page count e volume de conteúdo
- [ ] H1 uniqueness
- [ ] Meta descriptions
- [ ] Image alt text
- [ ] Internal linking
- [ ] Content freshness
- [ ] Score calculado (0-100)

## Module: Audience Presence (Fishkin)
- [ ] Brand mentions mapeadas
- [ ] Directórios/listas do sector
- [ ] Social media presence
- [ ] Review platforms
- [ ] Competitor AI visibility
- [ ] Score calculado (0-100)

## Aggregate & Report
- [ ] GEO Score calculado (weighted average)
- [ ] Classificação atribuída (Crítico/Fraco/Médio/Bom/Excelente)
- [ ] Pontos positivos identificados
- [ ] Issues ordenados por severidade
- [ ] Relatório HTML gerado
- [ ] Ficheiro guardado em outputs/

## Quality Gate
- [ ] Score coerente com findings
- [ ] Positivos e negativos equilibrados (não só negativo)
- [ ] Pain points específicos ao site (não genéricos)
- [ ] Se e-commerce: checks específicos incluídos
- [ ] Linguagem clara e acessível para PME

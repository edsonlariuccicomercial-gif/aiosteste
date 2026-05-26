# Task: Run GEO Audit

## Metadata
- **id:** run-audit
- **agent:** geo-seo-chief
- **elicit:** false
- **mode:** interactive

## Description
Executar auditoria GEO completa num URL.

## Inputs
| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| url | yes | — | URL do site a auditar |

## Execution Steps

### Step 1: Crawl (paralelo)
Executar em paralelo com WebFetch e WebSearch:

```
1. WebFetch {url} — extrair: title, meta, headings, schema JSON-LD, links, content, images alt, tech stack
2. WebFetch {url}/robots.txt — AI bot rules, crawl-delay, sitemap URL
3. WebFetch {url}/llms.txt — exists or 404
4. WebFetch sitemap URL — page count, categories
5. WebSearch "{brand}" reviews — presença externa
6. Se e-commerce: WebFetch 1 product page — Product schema check
```

### Step 2: Analyse (por módulo)
Para cada módulo, aplicar o framework do agente correspondente:

| Módulo | Agente | O que verificar |
|--------|--------|-----------------|
| Entity Identity | jason-barnard | Organization schema, Entity Home, Knowledge Graph, sameAs, corroboration |
| Entity & Schema | dixon-jones | Todos os schemas, Product/Offer, FAQ, BreadcrumbList, Review, LocalBusiness |
| LLM Readability | olaf-kopp | Chunk quality, fact density, structure, AI crawler access, llms.txt |
| Technical Relevance | mike-king | Page count, H1, meta desc, alt text, internal links, freshness |
| Audience Presence | rand-fishkin | Brand mentions, directories, social, reviews, competitor visibility |

### Step 3: Score
Calcular GEO Score:

```
GEO Score = (LLM Readability × 0.25) + (Entity Identity × 0.20) +
            (Schema × 0.15) + (Technical × 0.15) +
            (AI Crawler × 0.10) + (Audience × 0.15)
```

Classificação:
- 0-25: Crítico
- 26-45: Fraco
- 46-65: Médio
- 66-80: Bom
- 81-100: Excelente

### Step 4: Report
Gerar relatório HTML completo:
- Score + sub-scores por componente
- Pontos positivos (o que está bem)
- Problemas detectados com severidade e soluções
- Análise detalhada por framework
- Schema JSON-LD sugerido (copy-paste ready)
- Plano de acção 30/60/90 dias
- Recomendações técnicas

### Step 5: Save
```
squads/geo-seo/outputs/audit-{domain}.html
```

## Veto Conditions
- URL inválido ou inacessível → ABORT
- Site retorna 403/captcha → avisar utilizador, tentar sem JS
- Menos de 3 módulos com dados → relatório incompleto, avisar

## Completion Criteria
- [ ] Relatório HTML gerado e guardado
- [ ] Score coerente com findings
- [ ] Pontos positivos incluídos
- [ ] Soluções específicas para cada problema
- [ ] Plano de acção incluído

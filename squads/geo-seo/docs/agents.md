# GEO/SEO Squad — Agentes

## Tabela de Agentes

| Nome | ID | Tier | Papel | Faz | Não Faz | Handoffs |
|------|------|------|-------|-----|---------|----------|
| GEO Commander | geo-seo-chief | Chief | Orquestrador | Coordena audit flow, agrega scores, gera relatórios | Análise especializada | Recebe de todos, envia para Aleyda |
| Aleyda | aleyda-solis | 0 | AI Search Auditor | Checklist 8 áreas, score global, roadmap, priorização | Análise técnica profunda | Recebe sub-scores, produz relatório final |
| King | mike-king | 1 | Relevance Engineer | Technical SEO, content quality, embeddings, relevance | Schema markup, entity identity | Envia Technical Relevance Score |
| Kopp | olaf-kopp | 1 | GEO Strategist | LLM Readability, chunk quality, AI crawler access, citability | Brand SERP, internal linking | Envia LLM Readability Score |
| Barnard | jason-barnard | 1 | Brand Identity Architect | Knowledge Graph, Brand SERP, Entity Home, corroboration | Content optimization, technical SEO | Envia Entity Identity Score |
| Fishkin | rand-fishkin | 1 | Audience Strategist | Zero-click, competitor AI visibility, audience mapping | Technical implementation | Envia Audience Presence Score |
| Jones | dixon-jones | 2 | Entity SEO Systematizer | Schema audit, entity extraction, internal linking, JSON-LD | Brand strategy, audience analysis | Envia Entity & Schema Score + JSON-LD |

## Quando Cada Agente Entra em Acção

- **Aleyda Solis** — SEMPRE. Primeira a correr (Tier 0 diagnosis) e última a agregar
- **Mike King** — Quando precisamos de análise técnica profunda (Core Web Vitals, relevance scoring)
- **Olaf Kopp** — Quando o foco é "o conteúdo é citável por LLMs?"
- **Jason Barnard** — Quando queremos saber "a IA conhece esta marca?"
- **Rand Fishkin** — Quando queremos contexto competitivo e presença de audiência
- **Dixon Jones** — Quando precisamos de schema markup concreto e entity mapping

# GEO/SEO Squad — Interacções

## Dependências Internas

```
                    geo-seo-chief
                    (Orchestrador)
                         │
            ┌────────────┼────────────┐
            │            │            │
            ▼            ▼            ▼
      ┌──────────┐ ┌──────────┐ ┌──────────┐
      │ Barnard  │ │  Kopp    │ │  King    │
      │ Entity   │ │  LLM     │ │ Technical│
      │ Identity │ │ Readabil.│ │ Relevance│
      └────┬─────┘ └────┬─────┘ └────┬─────┘
           │             │            │
      ┌────┴─────┐ ┌────┴─────┐      │
      │  Jones   │ │ Fishkin  │      │
      │  Schema  │ │ Audience │      │
      └────┬─────┘ └────┬─────┘      │
           │             │            │
           └──────┬──────┘────────────┘
                  │
                  ▼
           ┌──────────┐
           │  Solis   │
           │ Aggregate│
           │ + Report │
           └──────────┘
```

## Interacções com Outros Squads

| De | Para | O que recebe | O que envia |
|----|------|-------------|-------------|
| GEO/SEO Squad | **CMO / Marketing** | Briefs estratégicos, prioridades | Relatórios GEO, scores, action plans |
| GEO/SEO Squad | **Instagram Brand** | — | Recomendações de SEO para conteúdo social |
| GEO/SEO Squad | **Dev (@dev)** | — | Schema JSON-LD para implementar, technical fixes |
| GEO/SEO Squad | **DevOps (@devops)** | — | robots.txt changes, llms.txt deployment |
| **Clientes** | GEO/SEO Squad | URL para audit | Relatório completo |

## Pontos de Escalamento

| Situação | Escalar para |
|----------|-------------|
| Implementação técnica necessária | @dev (Dex) |
| Deploy de alterações (robots.txt, llms.txt) | @devops (Gage) |
| Decisão estratégica de negócio | Rui |
| Schema complexo (custom post types) | @data-engineer (Dara) |

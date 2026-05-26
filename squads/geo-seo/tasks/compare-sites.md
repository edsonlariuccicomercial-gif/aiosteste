# Task: Compare Sites

## Metadata
- **id:** compare-sites
- **agent:** geo-seo-chief
- **elicit:** false
- **command:** `*compare {url1} {url2}`

## Description
Comparar GEO Score de dois sites lado a lado. Ideal para mostrar ao lead como se posiciona face ao concorrente.

## Execution Steps

### Step 1: Audit Both
Executar auditoria completa para ambos os URLs (em paralelo).

### Step 2: Compare Table
Gerar tabela comparativa:

```
| Métrica              | {{SITE_1}}  | {{SITE_2}}  | Vencedor |
|----------------------|:-----------:|:-----------:|:--------:|
| GEO Score            | {{S1_TOTAL}}| {{S2_TOTAL}}| {{WIN}}  |
| LLM Readability      | {{S1_LLM}}  | {{S2_LLM}}  | {{WIN}}  |
| Entity Identity      | {{S1_ENT}}  | {{S2_ENT}}  | {{WIN}}  |
| Schema               | {{S1_SCH}}  | {{S2_SCH}}  | {{WIN}}  |
| Technical SEO        | {{S1_TECH}} | {{S2_TECH}} | {{WIN}}  |
| AI Crawler Access    | {{S1_AI}}   | {{S2_AI}}   | {{WIN}}  |
| Audience Presence    | {{S1_AUD}}  | {{S2_AUD}}  | {{WIN}}  |
```

### Step 3: Highlights
Identificar:
- Onde site1 ganha (vantagens a manter)
- Onde site1 perde (oportunidades de melhoria)
- Diferenças críticas (>20 pontos de gap)

### Step 4: Report
Gerar HTML com dois score circles lado a lado + tabela comparativa.

Incluir secção: "O que {{SITE_2}} faz que {{SITE_1}} não faz" — lista de diferenças accionáveis.

## Output
```
squads/geo-seo/outputs/compare-{domain1}-vs-{domain2}.html
```

```
- "O seu concorrente tem GEO Score {{X}} — o seu tem {{Y}}"
- "{{COMPETITOR}} aparece nas respostas IA em {{N}} queries onde a sua marca não aparece"
- "{{COMPETITOR}} tem {{N}} schemas que o seu site não tem"
```

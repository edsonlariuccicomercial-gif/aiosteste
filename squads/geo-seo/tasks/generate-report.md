# Task: Generate GEO Report

## Metadata
- **id:** generate-report
- **agent:** aleyda-solis
- **elicit:** false

## Description
Gerar relatório HTML visual (Apple-style) a partir dos dados de auditoria.

## Inputs
| Input | Required | Description |
|-------|----------|-------------|
| domain | yes | Domínio auditado |
| geo_score | yes | Score global (0-100) |
| sub_scores | yes | 6 sub-scores |
| positives | yes | Lista de pontos positivos |
| issues | yes | Lista de problemas com severidade |
| impact_numbers | yes | 3 métricas de impacto |
| callout_query | yes | Query IA que demonstra invisibilidade |

## Template: Apple-Style v2

### Design Tokens
```
Background: #fafafa
Surface: #ffffff
Border: #e5e5e5
Text Primary: #1d1d1f
Text Secondary: #6e6e73
Text Tertiary: #aeaeb2
Red: #ff3b30
Orange: #ff9500
Yellow: #ffcc00
Green: #34c759
Font: Inter
Max-width: 720px
Border-radius: 12-20px
```

### Estrutura do HTML
```
1. Header (eyebrow + h1 domain + date + divider)
2. Score Hero (circle SVG + badge + headline + desc)
3. Metrics Grid (6 cells, 3 cols)
4. Positives Section (dot green + tag OK)
5. Issues Section (dot red/orange/yellow + tag severity)
6. Impact Row (3 cards)
7. Callout (query + answer)
8. CTA (dark bg + pills + button)
9. Footer (brand + credits)
```

### Regras do Full
- Secção "Como Corrigir" por issue
- Schema JSON-LD em code blocks
- Plano 30/60/90 dias com checkboxes
- Análise competitiva

## Output
```
squads/geo-seo/outputs/audit-{mode}-{domain}.html
```

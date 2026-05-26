# GEO/SEO Squad — Guia de Instalação

## O que é

Squad de agentes IA especializados em **GEO (Generative Engine Optimization)** e SEO. Audita a visibilidade de qualquer site nas pesquisas de IA generativa (ChatGPT, Perplexity, Google AI Overviews, Gemini, Claude) e pesquisa tradicional.

Usa frameworks reais de 6 especialistas de elite mundial com Voice DNA clonado.

## Requisitos

- **AIOS** (Synkra AIOS ou AIOX) instalado e funcional
- **Claude Code** com acesso a ferramentas `WebFetch` e `WebSearch`

## Instalação

### 1. Copiar a pasta para o teu AIOS

```bash
cp -R geo-seo/ /caminho/para/o/teu/aios/squads/geo-seo/
```

### 2. Verificar a estrutura

```
squads/geo-seo/
├── agents/           # 7 agentes (chief + 6 especialistas)
│   ├── geo-seo-chief.md
│   ├── aleyda-solis.md
│   ├── mike-king.md
│   ├── olaf-kopp.md
│   ├── jason-barnard.md
│   ├── rand-fishkin.md
│   └── dixon-jones.md
├── data/
│   ├── strategy.md   # Estratégia do squad
│   ├── context.md    # Dados de mercado GEO 2026
│   └── minds/        # Voice DNA dos 6 especialistas (YAML)
├── tasks/            # 5 tasks executáveis
├── workflows/        # Workflow de auditoria
├── checklists/       # Checklist de qualidade
├── templates/        # Template HTML do relatório
└── docs/             # Documentação completa
```

### 3. Activar

```
@geo-seo-chief
```

### 4. Primeira auditoria

```
*audit https://o-teu-site.com
```

## Comandos Disponíveis

| Comando | O que faz |
|---------|-----------|
| `*audit {url}` | Auditoria GEO completa |
| `*score {url}` | Apenas o GEO Score (0-100) |
| `*action-plan {url}` | Plano de acção 30/60/90 dias |
| `*shopify-audit {url}` | Auditoria específica para Shopify |
| `*compare {url1} {url2}` | Comparar dois sites |
| `*help` | Todos os comandos |

## GEO Score

O score é calculado com 6 componentes ponderados:

| Componente | Peso | Especialista |
|-----------|------|--------------|
| LLM Readability | 25% | Olaf Kopp |
| Entity Identity | 20% | Jason Barnard |
| Schema/Structured Data | 15% | Dixon Jones |
| Technical SEO | 15% | Mike King |
| AI Crawler Access | 10% | Olaf Kopp |
| Audience Presence | 15% | Rand Fishkin |

## Output

Relatório HTML completo com:
- GEO Score global e por componente
- Problemas detectados com severidade e soluções
- Schema JSON-LD sugerido (copy-paste ready)
- Plano de acção prioritizado 30/60/90 dias
- Análise competitiva

## Registar no Dashboard (opcional)

Se usas o dashboard IARA, adiciona ao `dashboard/routes/squads.js` no array `handleSquadsDocs()`:

```javascript
{
  id: 'geo-seo',
  name: 'GEO/SEO Squad',
  icon: 'search',
  command: '@geo-seo-chief',
  readme: read('squads/geo-seo/docs/README.md'),
  agents_count: 7,
  status: 'active'
}
```

---

*Squad criado com AIOS — 6 mentes de elite clonadas com Voice DNA real.*

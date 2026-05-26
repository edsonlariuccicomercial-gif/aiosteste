# Task: Generate Action Plan

## Metadata
- **id:** action-plan
- **agent:** aleyda-solis
- **elicit:** false
- **command:** `*action-plan {url}`
- **mode:** interactive

## Description
Gerar plano de acção prioritizado 30/60/90 dias a partir dos resultados de uma auditoria GEO. 

## Pre-requisite
Auditoria completa já executada (`*audit {url}` em modo full).

## Execution Steps

### Step 1: Collect Issues
Recolher todas as issues dos 5 módulos com severidade e esforço estimado.

### Step 2: Prioritize
Usar matriz impacto × esforço:

```
                    BAIXO ESFORÇO    ALTO ESFORÇO
ALTO IMPACTO     │  FAZER JÁ (30d)  │ PLANEAR (60d)
                 │  Quick Wins       │ Projectos
─────────────────┼──────────────────┼───────────────
BAIXO IMPACTO    │  PREENCHER (90d) │ IGNORAR
                 │  Nice-to-have    │ Não prioritário
```

### Step 3: Structure Plan

#### Primeiros 30 dias — Quick Wins
Issues de alto impacto e baixo esforço. Tipicamente:
- Corrigir robots.txt (permitir AI bots, remover crawl-delay excessivo)
- Criar /llms.txt
- Adicionar Organization schema à homepage
- Corrigir H1 duplicados
- Actualizar copyright year
- Adicionar sameAs links ao schema existente
- Corrigir alt text das imagens principais

**Esforço estimado:** 1-2 dias de trabalho técnico

#### 30-60 dias — Fundação
Issues de alto impacto que requerem mais trabalho:
- Implementar Product schema em todas as PDP (se e-commerce)
- Criar FAQPage schema nas páginas com FAQ-like content
- Implementar Review/AggregateRating schema
- Criar BreadcrumbList schema
- Adicionar Person schema para fundadores/equipa
- Criar/optimizar meta descriptions para todas as páginas
- Configurar LocalBusiness schema (se lojas físicas)

**Esforço estimado:** 3-5 dias de trabalho técnico

#### 60-90 dias — Escala
Estratégia de conteúdo e presença:
- Criar blog com 5-10 artigos pilares do sector (topic clusters)
- Registar em directórios e listas do sector
- Solicitar reviews em Trustpilot / Google Business
- Criar páginas de "Sobre Nós" e "Equipa" com E-E-A-T signals
- Implementar content strategy para LLM readability
- Monitorar Brand SERP e Knowledge Graph

**Esforço estimado:** Ongoing, 2-4h/semana

### Step 4: Schema Deliverables
Para o modo full, incluir JSON-LD pronto a implementar:

```json
// Organization schema (copy-paste para homepage)
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "{{BRAND}}",
  "url": "{{URL}}",
  "logo": "{{LOGO_URL}}",
  "sameAs": [{{SOCIAL_URLS}}],
  "contactPoint": {...},
  "address": {...}
}
```

```json
// Product schema (template para cada PDP)
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "{{PRODUCT_NAME}}",
  "brand": {"@type": "Brand", "name": "{{BRAND}}"},
  "offers": {
    "@type": "Offer",
    "price": "{{PRICE}}",
    "priceCurrency": "EUR",
    "availability": "https://schema.org/InStock"
  }
}
```

```markdown
# llms.txt (ficheiro para raiz do site)
# {{BRAND}} — {{TAGLINE}}

## About
{{BRAND_DESCRIPTION}}

## Key Pages
- [Homepage]({{URL}})
- [Products]({{URL}}/products)
- [About]({{URL}}/about)
- [Contact]({{URL}}/contact)

## Topics
{{TOPIC_LIST}}
```

### Step 5: Render
Incluir no relatório HTML (modo full):
- Secção `.plan` com 3 fases
- Cada acção com checkbox + estimativa de esforço
- Schema JSON-LD em code blocks
- llms.txt template

## Output Format
Integrado no relatório HTML full:
```html
<div class="plan">
  <h3>Plano de accao</h3>
  <div class="plan-phase">
    <div class="plan-phase-label">Primeiros 30 dias — Quick Wins</div>
    <div class="plan-item">
      <div class="checkbox"></div>
      Criar /llms.txt na raiz do site
      <span class="effort">30 min</span>
    </div>
    ...
  </div>
</div>
```

## Completion Criteria
- [ ] Todas as issues classificadas em matriz impacto × esforço
- [ ] Plano dividido em 3 fases (30/60/90 dias)
- [ ] Cada acção com estimativa de esforço
- [ ] Schema JSON-LD pronto a implementar (mínimo: Organization + Product se ecommerce)
- [ ] Template llms.txt incluído
- [ ] Integrado no relatório HTML

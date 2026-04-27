# Epic 11 — GDP Visual Refresh: Pedidos

## Objetivo

Modernizar a apresentacao visual da secao Pedidos do modulo GDP, adotando o estilo flat de tabela (inspirado no ERP Olist) em substituicao ao estilo card atual. Foco exclusivo em aparencia — nenhuma funcionalidade sera alterada.

## Contexto

A secao de Pedidos do GDP apresenta os itens dentro de um container com estilo de "card" (background, border, border-radius), o que reduz a densidade visual e faz a interface parecer pesada. O estilo de referencia (Olist ERP) usa tabelas flat com separadores finos, tabs de status com indicadores coloridos e maior densidade de informacao por viewport.

## Documentos de Referencia

| Documento | Autor | Path |
|-----------|-------|------|
| Referencia Visual Olist | @analyst (Atlas) | `docs/reference/olist-pedidos-visual-reference.md` |
| Avaliacao Arquitetural | @architect (Aria) | `docs/architecture/gdp-visual-refresh-assessment.md` |
| Screenshots Olist | @analyst (Atlas) | `.playwright-mcp/olist-pedidos-*.png` |

## Classificacao

| Dimensao | Score |
|----------|-------|
| Scope | 2 |
| Integration | 1 |
| Infrastructure | 1 |
| Knowledge | 1 |
| Risk | 1 |
| **Total** | **6 — SIMPLE** |

## Stories

| Story | Titulo | Prioridade | Status |
|-------|--------|------------|--------|
| 11.1 | GDP Visual Refresh — Tabela Flat de Pedidos | Alta | Draft |

## Criterios de Sucesso do Epic

- [ ] Pedidos exibidos em tabela flat sem container card
- [ ] Status tabs com indicadores dot coloridos + contadores
- [ ] Search bar ampliado (40px) com icone de lupa
- [ ] Rodape de totais alinhado com colunas da tabela
- [ ] Nenhuma regressao funcional
- [ ] Todas as funcionalidades de pedidos preservadas (CRUD, bulk actions, filtros)

---

*Epic criado por @pm (Morgan) em 2026-04-27*

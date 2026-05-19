# EPIC-14: Sync Cross-Machine & Performance

## Contexto

Investigação do @analyst (Atlas) em 2026-05-19 identificou dois problemas críticos no portal escolar e dashboard GDP:

1. **Sync quebrado entre máquinas** — Alterações feitas em uma máquina não replicam para outras com o mesmo login
2. **Lentidão em máquinas com mais dados** — Sem paginação, todo dataset carregado em memória

## Causa Raiz (Análise Completa)

### Problema 1: Sync Cross-Machine
- `getSyncUserId()` em `app-sync.js:40-43` deriva identidade do `localStorage`, que varia entre máquinas
- `getEmpresaId()` em `gdp-api.js:30-35` tem lógica similar com fallback para "LARIUCCI"
- **Sem realtime subscriptions** — dados puxados apenas 1x no boot
- **Sem polling** — nenhum mecanismo de pull contínuo
- Resultado: Máquina A salva como `user_id="CEOPEE"`, Máquina B lê como `user_id="LARIUCCI"`

### Problema 2: Performance
- `gdp-core.js:720-759` carrega TODOS os dados em memória sem paginação
- `gdp-api.js:157-163` `.list()` retorna todas as linhas do Supabase
- `gdp-pedidos.js:49-67` renderiza tabela inteira a cada mudança
- `app-sync.js:65-82` faz fetch sequencial (não paralelo) de candidatos

## Stories

| Story | Título | Owner | Prioridade | Depende de |
|-------|--------|-------|------------|------------|
| 14.1 | Fix identidade sync + empresa_id consistente | @dev | P0-Critical | — |
| 14.2 | Supabase Realtime + polling fallback | @dev | P0-Critical | 14.1 |
| 14.3 | Paginação API + lazy loading frontend | @dev | P1-High | 14.1 |
| 14.4 | Deploy produção + validação cross-machine | @devops | P0-Critical | 14.1, 14.2, 14.3 |

## Validação @pm — APROVADO (2026-05-19)

- [x] Stories cobrem 100% das causas raiz identificadas
- [x] Critérios de aceitação são verificáveis
- [x] Dependências entre stories estão corretas
- [x] Priorização reflete impacto no usuário
- [x] Escopo não inclui features inventadas (Art. IV Constitution)

**Veredicto: GO 5/5 — @pm (Morgan)**

## Métricas de Sucesso

- Alteração em Máquina A visível em Máquina B em < 5 segundos
- Tempo de carregamento inicial < 3 segundos (com 500+ contratos)
- Zero perda de dados durante sync cross-machine

---
*Epic criado por @analyst (Atlas) — 2026-05-19*

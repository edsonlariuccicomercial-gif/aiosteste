# EPIC-18 — Como Começar (Ponto de Retomada)

> **Este é o seu "botão de play".** Quando decidir iniciar a frente multi-tenant, abra este arquivo e use o texto da seção "O QUE COLAR PARA COMEÇAR". Tudo está versionado no git — você pode fechar tudo e voltar daqui a semanas sem perder nada.

**Criado:** 2026-06-08 (@pm Morgan)
**Fonte:** `docs/stories/EPIC-18-MULTI-TENANT-SAAS.md` + `docs/architecture/FASE-0-MULTI-TENANT-AUTH-RLS.md`

---

## Resumo de 30 segundos

- **Objetivo:** tornar o Caixa Escolar multi-tenant (vender por assinatura, cada empresa isolada).
- **Decisão:** Caminho B (multi-tenant real). Produção continua em uso e recebendo ajustes em paralelo.
- **Regra inegociável:** a venda multi-tenant só libera com os gates de segurança PROVADOS (Story 18.8 — teste de penetração verde). É 100% ou não vende.
- **Risco ao seu uso atual:** ZERO durante a construção (feita em staging). Só a virada final (18.9) toca produção, com backup e rollback.

---

## Caminho crítico priorizado (o que destrava o quê)

A priorização não muda o destino (100%), mas mostra a sequência mais eficiente até o GATE de venda (18.8).

```
CAMINHO CRÍTICO (série — cada um destrava o próximo):
18.1 staging ──► 18.2 Auth ──► 18.3 Bearer ──► 18.4 RLS ──► 18.7 migração ──► 18.8 GATE penetração ──► 18.9 virada
 [risco 0]        [P0]          [P0 Alto]       [P0 Alto]     [P0 Alto]         [LIBERA VENDA]            [produção]

PODEM RODAR EM PARALELO (não bloqueiam o caminho crítico):
  • 18.4b config sensível  → junto/após 18.4 (mesmo dono: @data-engineer)
  • 18.5 cache tenant-aware → junto com 18.4 (@dev) — robustez
  • 18.6 remover LARIUCCI   → após 18.4 (@dev) — necessário p/ migração limpa
```

**Bloqueadores de venda (precisam estar 100%):** 18.1, 18.2, 18.3, 18.4, 18.4b, 18.7, 18.8, 18.9.
**Robustez (importantes, mas não são o elo de segurança):** 18.5, 18.6 — entram no caminho mas têm folga maior.

**Por onde começar com risco ZERO à produção:** **Story 18.1** (provisionar staging). Ela não toca o sistema que você usa.

---

## O QUE COLAR PARA COMEÇAR

Quando for iniciar, escolha conforme o que quer fazer:

### ▶️ Para COMEÇAR a construção do multi-tenant (primeira story, sem risco à produção):
```
@devops execute a Story 18.1 do EPIC-18 (provisionar staging + branch feature/multi-tenant). Consulte docs/stories/EPIC-18-MULTI-TENANT-SAAS.md e docs/architecture/FASE-0-MULTI-TENANT-AUTH-RLS.md.
```

### ▶️ Para CRIAR as stories detalhadas antes de implementar (recomendado — fatiar bem):
```
@sm crie as stories detalhadas (draft) do EPIC-18 a partir de docs/stories/EPIC-18-MULTI-TENANT-SAAS.md, começando pela 18.1. Depois @po valida.
```

### ▶️ Para continuar AJUSTANDO funções da produção (frente paralela, seu uso normal):
```
@dev preciso ajustar [descreva a função/erro]. É correção de produção (branch master), não relacionada ao multi-tenant. Lembre da regra de ouro do paralelo: não introduzir novo 'LARIUCCI' literal nem nova chave sync_data sem registrar.
```

### ▶️ Para RELEMBRAR onde parou (visão geral):
```
@pm me mostre o status do EPIC-18: o que já foi feito, o que falta, e qual a próxima story do caminho crítico. Consulte docs/stories/EPIC-18-MULTI-TENANT-SAAS.md.
```

---

## Mapa de progresso (atualize marcando [x] conforme avança)

- [ ] 18.1 Provisionar staging + branch
- [ ] 18.2 Migrar login → Supabase Auth
- [ ] 18.3 Bearer token nas chamadas REST
- [ ] 18.4 RLS estrita (tabelas + sync_data + audit_log)
- [ ] 18.4b Config sensível fora do sync_data + rotação
- [ ] 18.5 Cache tenant-aware
- [ ] 18.6 Remover LARIUCCI fixo + portais
- [ ] 18.7 Migração Lariucci → tenant nº 1
- [ ] 18.8 **GATE** — teste de penetração (2 tenants) ← LIBERA VENDA
- [ ] 18.9 **GATE FINAL** — virada produção + rollback

---

## Lembretes importantes

1. **Sempre staging primeiro.** Nenhuma story 18.x toca produção até a 18.9.
2. **Auth + RLS vão juntos** na virada (18.9) — separá-los foi o que quebrou o sync na migration 020.
3. **A venda só libera após a 18.8 passar.** Sem atalho seguro.
4. **Sua produção continua viva** — pode corrigir funções em `master` a qualquer momento, em paralelo.
5. Documentos de referência (no git): `EPIC-18-MULTI-TENANT-SAAS.md` (o quê) e `FASE-0-MULTI-TENANT-AUTH-RLS.md` (o porquê/como).

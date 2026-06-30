# Relatório de Sessão — Blindagem definitiva contra perda de dados (NF-e / boletos)

**Data:** 2026-06-30
**Fluxo:** @analyst → @architect → @data-engineer → @dev → @qa → @devops (com loop QA→dev→QA)
**Branch:** master | **Commits finais:** `8dbaa26c`, `e07d46c1`, `bb0e7ddc`, `1c4a2361`

---

## Como a sessão começou

A usuária (Angela) relatou, irritada e com razão: *"que palhaçada é essa que vocês estão fazendo? nesse sistema nada se corrige de verdade. as notas fiscais estão com o mesmo problema que relataram ter achado a causa raiz e resolvido definitivamente."* Sintomas: NF autorizada na SEFAZ aparece como Emitida e **regride para Pendente**; antes era recuperada, agora "nem isso"; boletos do Inter geram e **somem**.

## O que foi COMPROVADO (não suposto)

Via Playwright logado (usuária angela) + leitura de código + as **DANFEs físicas** que a usuária enviou:

1. **A SEFAZ autorizava de verdade.** As DANFEs (NF 1635 R$1.741,40 e NF 1636 R$2.234,80) tinham chave de 44 dígitos + protocolo de autorização impressos. **O sistema é que perdia a prova depois de recebê-la.**
   - 1635: sistema gravou a chave da tentativa REJEITADA (cStat 778/NCM) e jogou fora a chave da 2ª transmissão AUTORIZADA da DANFE. Status interno "rejeitada", protocolo vazio.
   - 1636: `rascunho_nf_real` sem chave/protocolo no sistema — mas autorizada na DANFE (protocolo 131267678366929).
2. **Causa-raiz comum (o "porquê" final):** as decisões de rebaixamento liam a **prova na RAM** (`notasFiscais[]`), que OSCILA no flicker de boot/realtime. A prova real (chave+protocolo) está no localStorage/Supabase e NÃO oscila. O sistema perguntava "tem prova?" para a fonte volátil.
3. **198/198 notas estavam SEM `updated_at`** no localStorage leve do cliente → a guarda de timestamp do realtime caía em `!lTs` e um eco atrasado sem chave sobrescrevia a nota autorizada.

## Correções entregues e DEPLOYADAS

### Lote 1 (commits 8dbaa26c, e07d46c1) — 3 bugs + relógio
- **FIX-1** `gdp-notas-fiscais.js`: grava o `ultNSU` que a SEFAZ devolve ANTES do break no cStat 656 → destrava a autocura DFe (estava em loop de 656 com NSU preso em "0").
- **FIX-2/3** `gdp-pedidos.js`: status fiscal e classificação por `temProvaAutorizacao()` real, nunca por substring "autoriz". Novo 3º estado **Transmitida** (azul).
- **FIX-4** `gdp-realtime.js`: prova durável local vence eco sem prova mesmo sem timestamp.
- **Migration 042** (aplicada no Supabase produção): trigger `updated_at` em `notas_fiscais` + backfill.
- **`_nfListaLeve`** (gdp-core.js): passou a preservar `updated_at` (o "ralo" do relógio — descoberto na validação pós-deploy, fix e07d46c1).

### Lote 2 (commits bb0e7ddc, 1c4a2361) — Blindagem imutável-para-baixo
Princípio arquitetural: **um dado PROVADO é imutável-para-baixo — nenhum caminho automático pode rebaixá-lo; e a prova é lida da fonte DURÁVEL (disco), não da RAM.**
- **PRIMITIVA 1** `_nfProvaDuravel(idNf)`: lê chave+protocolo do localStorage (cache 2s). Não oscila.
- **PRIMITIVA 3** `_formaCobrancaSoberana(pedido, nf, conta)`: forma com precedência clara; default só sem nenhuma escolha.
- **BL-1** `reconciliarCobrancasOrfas`: `temProva` usa prova durável → **cobrança PIX de NF autorizada NUNCA mais vira `aguardando_nf`** (causa do "boleto/cobrança some"). Antes a blindagem só cobria boleto Inter.
- **BL-2** `_ultraLightNf`: preserva prova+forma+relógio no fallback de quota.
- **BL-3** forma soberana nos 4 pontos de cascata (`:381`, `:1563-1564`, `buildReceivableFromInvoice`) → **PIX escolhido nunca vira boleto** (bug: pedido.pagamento `{}` vazio → default boleto).
- **BL-4** `gdp-realtime.js` INSERT/DELETE/forceReconcile: dado provado não é re-inserido inferior, não é removido por DELETE sem soft-delete real nem rebaixado no reconcile.
- **QA-B3 fix** `gdp-api.js sbDelete` + guard DELETE: registra a INTENÇÃO de exclusão (`window._gdpDeletesIntencionais`, expira 60s) → exclusão legítima do usuário passa; eco/race fantasma é barrado. Evita trocar "some sozinha" por "não consigo excluir".

## Estado em produção (validado pós-deploy)
- Versões servidas: `gdp-api v27`, `gdp-core v63`, `gdp-notas-fiscais v63`, `gdp-realtime v19`, `gdp-init v61`, `gdp-pedidos v33`.
- Functions `/api/*` vivas. Primitivas `_nfProvaDuravel`/`_formaCobrancaSoberana` ativas.
- Notas 1635/1636/1637 autorizadas, com prova, NÃO regridem. Cobrança da 1637 presente.

## Ações manuais feitas na tela (recuperação de incidente, NÃO recorrente)
- NF 1635/1636 restauradas com os dados reais das DANFEs (chave+protocolo+número), marcadas autorizadas, persistidas no Supabase. Cobranças geradas. Backup em `localStorage gdp.nf-restauracao-backup.20260630`.
- NSU corrigido para `000000000001775` (valor que a SEFAZ devolveu).

## Decisões e limites da usuária (RESPEITAR)
- **"Não quero recuperar cobranças."** As 2 contas legadas em `aguardando_nf` (CR-...62813 NF1615 R$436; CR-...83824 NF1609 R$4.779,30) NÃO foram recuperadas a pedido da usuária. Têm boleto real + prova durável, mas ficam como estão. NÃO mexer sem novo pedido.
- A blindagem é **preventiva** (impede perda em NOVAS emissões). Não força recuperação retroativa.

## Pendências / follow-ups para a próxima sessão
- **Validação na tela pós-deploy (não concluída):** emitir uma NF nova escolhendo PIX e confirmar que (a) nasce PIX, não boleto; (b) não pisca; (c) a cobrança permanece. Era o teste final V1/V2 do gate `docs/qa/gates/blindagem-imutavel-20260630.yml` (decisão PASS, validação dinâmica pendente).
- A reconciliação NÃO reverteu automaticamente as 2 contas legadas (`revertidas: 0`) — a reversão exige `conta._orfa === true`; investigar se vale ajustar o critério de reversão (BAIXA prioridade; a usuária não quer recuperar).
- Limpar `window._gdpDeletesIntencionais` em sessões longas (já expira em 60s por entrada — risco baixo).

## Handoffs desta sessão
- `handoff-analyst-CAUSARAIZ-nf-3bugs-20260630.yaml`
- `handoff-architect-to-dev-nf-correcao-definitiva-20260630.yaml`
- `handoff-data-engineer-to-dev-nf-relogio-20260630.yaml`
- `handoff-dev-to-qa-nf-correcao-20260630.yaml`
- `handoff-devops-DEPLOY-nf-correcao-20260630.yaml`
- `handoff-analyst-BLINDAGEM-perda-dados-20260630.yaml`
- `handoff-architect-BLINDAGEM-to-dev-20260630.yaml`
- `handoff-dev-to-qa-BLINDAGEM-20260630.yaml`
- Gate: `docs/qa/gates/blindagem-imutavel-20260630.yml` (PASS)

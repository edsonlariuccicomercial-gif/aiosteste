# Registro Definitivo de Bugs Resolvidos — Sessão 2026-06-25 (noite)

> Empresa: **LARIUCCI** · URL: https://painel-caixa-escolar.vercel.app
> Protocolo: fluxo `@analyst → @architect → @data-engineer → @dev → @qa → @devops`, validação SEMPRE via Playwright logado (banco íntegro, validar a TELA), deploy SEMPRE `npx vercel --prod --force --yes`.

Este documento registra **cada bug** tratado nesta sessão: sintoma, causa-raiz, correção, validação e arquivos. Ordem cronológica.

---

## BUG 1 — NF autorizada na SEFAZ aparecia como PENDENTE (e sem a chave, não dava para recuperar)

**Sintoma:** notas autorizadas na SEFAZ apareciam como pendentes/rascunho no sistema. Pior caso: a nota autorizava mas o sistema **nunca capturava a chave** (timeout na volta) — então a reconsulta por chave não tinha o que consultar. O usuário precisava mandar foto da DANFE para reconciliar manualmente.

**Causa-raiz:** a transmissão à SEFAZ às vezes perde a resposta. Sem a chave de acesso, não havia como o sistema descobrir sozinho que a nota foi autorizada.

**Correção (commit `d00c9aa6`):** implementada a **Distribuição DFe** (`NFeDistribuicaoDFe`), webservice **nacional** da SEFAZ que lista TODAS as NF-e autorizadas de um CNPJ por `ultNSU` — **retornando as chaves**, sem precisar da chave antes.
- **Backend** `server-lib/nfe-sefaz-client.js`: `distribuicaoDFe(ultNSU)` + `postSoapXmlBinary` (o `docZip` vem em **gzip+base64**; o `postSoapXml` em utf8 corromperia o binário) + `gunzipDocZip`/`parseDfeDoc`/`parseDistDFeResponse`. Endpoint produção `https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx`. Reaproveita o certificado A1.
- **Action** `api/gdp-integrations.js`: `nfe-sefaz-distribuicao-dfe` (cStat 137/138 = OK).
- **Frontend** `gdp-notas-fiscais.js`: `_recuperarViaDistribuicaoDFe()` — lê `ultNSU` (`gdp.nfe.ultNSU.v1`), throttle 1×/hora (`gdp.nfe.dfe.lastRun.v1`), pagina até 5×, cruza os documentos autorizados × notas pendentes por **número (nNF) + valor (vNF)**, completa para autorizada com chave+protocolo reais e dispara o email. Acionada no fim de `recoverNfsTransmissaoOrfas` (boot).
- **Regra inegociável:** NUNCA marca autorizada sem `cSitNFe=1` / `cStat 100/150` da própria SEFAZ + protocolo presente.

**Validação:** action em produção retornou `httpStatus 200`, `ultNSU` real `000000000001740`, CNPJ `36802147000142` (certificado A1 aceito). Parser validado isoladamente (gzip → chave 44 díg + nNF + vNF + nProt). `cStat 656` (consumo indevido < 1h) tratado: aborta gracioso.

**Versões:** `gdp-notas-fiscais v51`, `gdp-init v58`.

---

## BUG 2 — Produtos da Central fora de ordem

**Sintoma:** produtos na Central apareciam por ordem de inserção/migração, não alfabética.

**Correção (commit `5b6359ab`):** sort por descrição com `localeCompare('pt-BR', { sensitivity: 'base', numeric: true })` (ignora acento/maiúscula, ordena números embutidos) em `renderEstoque` (Central estoque-intel) e `renderBancoProdutos`. Só apresentação — não altera id/sku/vínculos.

**Validação:** Central renderiza em ordem A→C→E→G→S (abacaxi → ABOBORA → Açafrão → acelga → açúcar).

**Versões:** `gdp-estoque-intel v18`, `gdp-banco-produtos v16`.

---

## BUG 3 — Central poluída com 457 produtos do banco de preços (BANK-*) que o usuário não usa

**Sintoma:** a Central mostrava 671 produtos, mas só 214 (catálogo de licitação, SKU `LICT-*`) eram realmente usados. Os outros 457 (SKU `BANK-*`) vieram da migração do banco de preços do IntelPreços — que o usuário não usa.

**Causa-raiz:** a migração consolidadora (ADR-002 Fase 2) absorveu o banco de preços para dentro da Central.

**Correção (operação de DADOS, não de código):**
- Validado que os 457 `BANK-*` tinham **0 vínculos** (0 contratos, 0 pedidos apontavam para eles).
- **Backup** em `docs/architecture/data-snapshots/bank-produtos-backup-20260625.json`.
- Removidos os 457 `BANK-*` da tabela Supabase `produtos` (via `gdpApi.produtos.remove`, guard de segurança abortaria se algum tivesse vínculo).
- Deletado o blob `sync_data` legado `gdp.produtos.v1` (de 16/jun) que re-enchia o local com BANK.

**Validação:** Supabase 214 (0 BANK), 690/690 vínculos com nome preenchido (nada quebrou).

---

## BUG 4 — SKU aparecia BANK-* mesmo após a limpeza (regenerado a cada boot)

**Sintoma:** após a limpeza do BUG 3, a Central **ainda** mostrava SKUs `BANK-*` (ex.: `BANK-001-FEIJ-PRET-TIPO`) em vez do real `LICT-*`, mesmo o Supabase tendo os `LICT-*` corretos. Voltava por mais que se limpasse.

**Causa-raiz (commit `481508a1`):** `sanitizeBancoProduto` (`gdp-banco-produtos.js:54`) chamava `normalizeInternalSku("BANK", item, idx)` que **SEMPRE** regenerava o SKU como `BANK-<idx>` via `buildAutoSku`, **destruindo o SKU real** (`LICT-*`) a cada `loadBancoProdutos` (todo boot). Os "457 BANK" eram duplicatas geradas por esse mesmo mecanismo. **Bug independente da limpeza — sempre reescreveu os SKUs ao carregar.**

**Correção:** preservar o SKU existente quando válido (não-vazio e não-`isLegacyExternalSku`). Só gerar SKU automático quando NÃO há SKU. Protege os vínculos (`skuVinculado === produto.sku`) e mantém a tabela `produtos` como fonte de verdade.

**Validação:** após boot completo em produção, Central mostra SKUs `LICT-*` (LICT-0325, LICT-0218...) e o BANK **não volta mais**. Confirmado com `loadBancoProdutos()` chamado manualmente: 214 LICT, 0 BANK.

**Versões:** `gdp-banco-produtos v17`.

---

## BUG 5 — Produto saía na NF com texto do contrato (descrição/unidade erradas), não da Central

**Sintoma (relato do usuário):** "os produtos têm de sair na nota como estão na Central de Produtos, **inclusive as unidades** — não no contrato; e estão erradas também. Ao associar com um produto cadastrado na Central tem de puxar **todos** os dados do produto vinculado."

**Causa-raiz:** ao gerar pedido/NF a partir do contrato, o item copiava `descricao`/`sku`/`unidade` do **texto livre do contrato** (ex.: "Açafrao 500 gr - Pachá", unidade UN errada) em vez de buscar o produto na Central e usar os dados oficiais dele. `buildNfePayloadFromPedido` usa `item.descricao`/`item.unidade` direto do pedido.

**Correção (commit `06b94de6`):**
- `gdp-pedidos.js`: helper `_resolverProdutoCentralParaItem(item)` resolve o item → produto da Central (por `skuVinculado`, depois `produtoVinculado`/descrição com match acento-insensível). Aplicado em `selecionarProdutoContratoParaPedido` e na adição de item `fonte=contrato`. **Quantidade e preço da venda são preservados** (só os dados do PRODUTO vêm da Central).
- `gdp-notas-fiscais.js`: **rede de segurança final** em `gerarNotaFiscalPedido` — logo antes de transmitir, reescreve cada item do pedido com descrição/unidade/SKU/NCM da Central. Cobre pedidos antigos.
- Comportamento seguro: só puxa quando o match é inequívoco; senão mantém o texto do contrato (sem risco de vincular errado).

**Validação:** helper real em produção (v52) sobre itens reais — ex.: contrato "Aveia 500 gr" unidade **UN** → NF sai "aveia" unidade **KG** + NCM 1104.12.00 (corrigiu a unidade). Casos sem match inequívoco mantêm o contrato (sem risco).

**Versões:** `gdp-pedidos v32`, `gdp-notas-fiscais v52`.

---

## BUG 6 — Vínculos dos contratos com SKU dessincronizado da Central

**Sintoma:** divergências que o usuário sentia mas não conseguia apontar. Os contratos vinculavam por SKU antigo (ex.: item "Mussarela" → `LICT-0102`) que **não existia** mais na Central (o produto Mussarela real é `LICT-0256`). O vínculo "funcionava" pelo nome, mas o SKU não batia — então a NF não puxava da Central (BUG 5).

**Causa-raiz:** os SKUs dos produtos foram **renumerados** em alguma migração, mas os `skuVinculado` gravados nos contratos mantiveram o número antigo.

**Correção (operação de DADOS, com backup):**
- **Backup** dos 145 contratos em `docs/architecture/data-snapshots/contratos-backup-pre-revinculo-20260625.json`.
- De-para gerado com matcher robusto (acento-insensível + remove medidas/marca). Aplicadas **115 re-vinculações inequívocas** (74 por match exato, 41 por núcleo): `skuVinculado`/`sku`/`produtoVinculado` atualizados para o produto correto da Central.
- **NÃO** tocados: 36 ambíguos (nome casa com vários) + 216 sem-match exato (nome do contrato mais detalhado) — ficam para revisão manual futura, listados em `docs/architecture/data-snapshots/auditoria-vinculos-contratos-20260625.json` e `de-para-skus-contratos-20260625.json`.

**Validação:** cobertura de vínculo por SKU subiu de **323 → 438** de 690. Ex.: Mussarela passou de `LICT-0102` (inexistente) para `LICT-0256` (resolve na Central). 0 erros na gravação.

---

## Pendências conhecidas (registradas, não resolvidas nesta sessão)

- **252 itens de contrato** ainda não resolvem por SKU (36 ambíguos + 216 com nome divergente). Revisão manual ou matching mais inteligente numa próxima etapa. Relatórios em `docs/architecture/data-snapshots/`.
- **5 vínculos** a SKUs manuais inexistentes (`DESI-CONC-2L`, `ABSO-DESC-TRIP`, `AGUA-SANI-GL`, `CERA-INCO-LIQU`, `AGUA-SANI-LITR` — 11 itens): produtos nunca cadastrados na Central.
- **ITEM 5 (padronizar SKU/ID)**: o usuário queria SKUs em padrão consistente. Hoje há `LICT-*` (214). Renomear exige de-para que preserve os vínculos (mesma técnica do BUG 6).
- **Carimbão de clientes / conciliação / fornecedores** (pendências antigas do handoff MESTRE).

## Commits da sessão
- `d00c9aa6` — BUG 1 (Distribuição DFe)
- `5b6359ab` — BUG 2 (ordenação alfabética)
- `481508a1` — BUG 4 (preservar SKU LICT)
- `06b94de6` — BUG 5 (NF puxa da Central)
- BUG 3 e BUG 6 — operações de dados (Supabase), backups versionados em `docs/architecture/data-snapshots/`.

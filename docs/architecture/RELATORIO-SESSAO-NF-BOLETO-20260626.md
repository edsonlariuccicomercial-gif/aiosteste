# Relatório de Sessão — Cura definitiva: Emissão de NF-e e Boletos Inter

**Data:** 2026-06-26 (noite)
**Empresa:** LARIUCCI
**Branch:** master
**Fluxo de agentes:** @analyst → @architect → @data-engineer → @dev → @qa → @devops
**Produção:** https://painel-caixa-escolar.vercel.app

---

## Sumário Executivo

Foram diagnosticados e corrigidos **5 problemas**, todos com **causa raiz comprovada** (não chute),
validados em produção via Playwright, e deployados. Os bugs se concentravam em dois temas:

1. **NF-e que autorizava mas o sistema não refletia** (nascia pendente, ou regredia depois).
2. **Boleto Inter que "sumia"** da cobrança e não reemitia.

Os bugs compartilhavam um **padrão de causa raiz comum**: o sistema perdia a "prova" durável
(chave+protocolo da NF, ou providerChargeId do boleto) por causa de **ecos atrasados do realtime**,
**respostas perdidas na volta** das APIs, e **falta de guardas de idempotência**.

**Commits no ar (master):**

| Commit | Título |
|--------|--------|
| `c7617f59` | parser SEFAZ extrai chave/protocolo com namespace + atributos |
| `79b1cb62` | recovery de notas presas em transmissao_em_preparo via re-transmissão 539 |
| `b840ad7b` | REGRESSÃO autorizada→pendente — guarda 'prova durável > timestamp' no realtime |
| `155db114` | boleto Inter nunca some — guarda contas_receber + lock + recuperar-antes-de-criar |
| `05857c6d` | reemissão de boleto vencido sempre gera boleto NOVO |

**Versões em produção:** `gdp-notas-fiscais v59`, `gdp-realtime v16`.

---

## Problema 1 — NF autoriza na SEFAZ mas nasce "pendente"

### Sintoma
Ao emitir, a SEFAZ autorizava (DANFE real existia), mas o sistema deixava a nota em "pendente"
sem chave. Acontecia com "muitas" notas, de forma sistemática.

### Causa raiz (comprovada com XML real capturado em produção)
O parser da resposta da SEFAZ (`parseSefazAutorizacaoResponse`, `server-lib/nfe-sefaz-client.js`)
usava regex `<tag>...</tag>` que **NÃO casava tags com atributos** (`<protNFe versao="4.00">`) nem
**prefixo de namespace** (`<ns2:chNFe>`). Quando a SEFAZ MG respondia com a tag contendo atributo
(que é o caso real — `<protNFe versao="4.00"><infProt><chNFe>...`), a chave saía **vazia** →
a nota nascia sem prova de autorização → ficava pendente apesar de autorizada.

Evidência: o parser da Distribuição DFe (`parseDfeDoc`), que **funciona em produção**, usava
`<tag[^>]*>` (tolerava atributos). A diferença entre os dois parsers era exatamente essa.

### Solução (`c7617f59`)
Tornar o parser tolerante a prefixo de namespace e atributos:
```js
const tagRe = (tag, flags) => new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, flags);
```
Validado com 4 variantes (tags puras, com atributos, com namespace, assíncrono cStat 103) +
XML real capturado em produção. Regra preservada: nunca marca autorizada sem cStat 100/150 +
chave 44 díg + protocolo reais.

---

## Problema 2 — NF autorizada que o sistema "perdeu" (sem chave capturada)

### Sintoma
Nota presa em estado intermediário `transmissao_em_preparo`, sem chave e sem recibo — não
recuperável pelos mecanismos existentes (consulta por chave ou por recibo).

### Causa raiz
A janela entre marcar `transmissao_em_preparo` (antes do fetch) e gravar o resultado tem awaits
longos (transmissão + reconsulta + cobrança + email). Se a thread morre nesse intervalo (aba
fechada, reload, rede), a nota não passa pelo `catch` e fica órfã. O recovery de boot só tratava
notas COM chave (consulta protocolo) ou COM recibo (consulta recibo). Notas SEM ambos ficavam
presas para sempre.

### Solução (`79b1cb62`)
Adicionado um "Caso 4" no `recoverNfsTransmissaoOrfas`: para notas órfãs sem chave/recibo,
**re-transmite** a mesma numeração para provocar cStat 539 (Duplicidade) — a SEFAZ devolve a chave
real no `xMotivo`. Reutiliza `_recuperarPorDuplicidade539` para confirmar o protocolo e completar.
Se a nota nunca foi autorizada, a re-transmissão a autoriza legitimamente (sem duplicidade fiscal).
Throttle de 5 re-transmissões por boot (evita cStat 656 — consumo indevido). Validado em produção:
nota órfã forçada → recuperada via `recovery_retransmit_539`.

---

## Problema 3 — NF autoriza, vai para "Emitidas", e REGRIDE para "pendente" minutos depois

### Sintoma (relatado pelo usuário há dias)
A nota nasce pendente → autoriza → vai para Emitidas (correto) → e **DEPOIS DE MINUTOS regride
sozinha para Pendentes**. O problema era a **regressão** de uma nota que já estava correta.

### Causa raiz (PROVADA com evidência em produção)
No realtime (`gdp-realtime.js`, `handleEntityChange`), a decisão de sobrescrever a nota local por
um eco entrante era feita **só por timestamp**. Porém a nota local na RAM **não tinha `updated_at`
na raiz** (ele morava em `audit.updatedAt`). Resultado: a comparação `rTs > lTs` tinha `lTs` vazio
→ a condição `!lTs` era sempre verdadeira → **qualquer eco antigo (sem chave) sobrescrevia a nota
autorizada** → ela regredia para pendente.

Evidência: NF 1623 em produção — `local.updated_at` AUSENTE, `cloud.updated_at` presente.

### Solução (`b840ad7b`)
Princípio: **PROVA DURÁVEL > TIMESTAMP**. Uma NF autorizada (chave+protocolo) ou cancelada é estado
terminal fiscal — a SEFAZ nunca "desautoriza". Guarda em duas camadas:
- **Camada A:** registro terminal nunca é rebaixado por eco sem prova igual/superior.
- **Camada B:** timestamp passa a usar `audit.updatedAt` como fallback (corrige o `lTs` vazio).

Validado com o código servido em produção: o eco que antes derrubava a nota agora é bloqueado;
cancelamento legítimo e sync normal continuam passando.

---

## Problema 4 — Boleto Inter "some" da cobrança

### Sintoma
Boleto gerado no Inter, mas desaparecia da cobrança: a tela mostrava "Boleto não emitido no banco"
mesmo tendo emitido. Ao reemitir, o Inter recusava por duplicidade ("acabou de emitir"), e o
vínculo nunca se gravava → loop infinito.

### Causa raiz (mesma raiz do Problema 3, agora em contas_receber)
A guarda anti-regressão criada no Problema 3 cobria **apenas notas_fiscais**. `contas_receber` ficou
**desprotegida**: um eco antigo do realtime SEM o `providerChargeId` sobrescrevia a conta que já
tinha o boleto vinculado → o ID sumia → "Boleto não emitido no banco". Somavam-se: (B) falta de lock
entre cliques (2 creates simultâneos → boletos órfãos) e (C) recuperação limitada (busca só "hoje",
só primeiro hit).

### Solução (`155db114`) — três frentes
- **P1 (guarda):** generalizada `_podeSobrescreverRegistro(table, ...)` — conta com boleto real
  (providerChargeId/nossoNumero/bankSlipUrl/linhaDigitavel) NUNCA é rebaixada por eco sem boleto.
- **P2 (lock):** lock idempotente por conta (`_crOpsEmAndamento`) via wrapper com `try/finally` —
  clique duplo não dispara 2 creates.
- **P3 (recuperar-antes-de-criar):** antes de criar um boleto, o sistema PERGUNTA ao Inter se já
  existe (find-by-seu). Se existe, re-vincula em vez de duplicar. Backend: janela ampliada de "hoje"
  para 30 dias + multi-hit preferindo boleto ativo.

**Validação @data-engineer:** `providerChargeId` persiste corretamente no Supabase (coluna `cobranca`
jsonb), upsert idempotente por `id`, `_stripContaHeavy` preserva o ID. Bug era de aplicação, não de
banco. **Validação @qa:** find-by-seu (30d) encontrou boleto de 19/jun (`found:true`) — antes (só
hoje) não acharia. Loop fechado.

---

## Problema 5 — Reemissão de boleto VENCIDO (ressalva do usuário)

### Sintoma antecipado pelo usuário
"Para boletos vencidos precisarei reemitir" — o usuário identificou que a correção P3 (recuperar-
antes-de-criar) poderia re-vincular o boleto **vencido** em vez de gerar um novo, deixando-o preso.

### Causa raiz (3 fatores)
1. A action era decidida só por `providerChargeId` presente → reemitir caía em `sync` do vencido.
2. O P3 acharia o vencido (situação `A_RECEBER` mesmo vencido) e re-vincularia.
3. O `seuNumero` era sempre `conta.id.slice(-15)` → boleto novo colidiria com o antigo e o Inter
   recusaria por duplicidade.

### Contexto do fluxo (esclarecido pelo usuário)
- A **1ª emissão** do boleto é automática, na geração da NF.
- O modal "Emitir/Reemitir Boleto" (menu "...") é usado para contas manuais e para **reemitir**.
- O modal sempre informa um **novo vencimento** — essa é a intenção explícita de boleto NOVO.

### Solução (`05857c6d`)
A presença de `options.vencimento` (que SÓ vem do modal de reemissão) marca a intenção de boleto
novo. Nesse caso:
- Força `action = create` (boleto novo com a data nova), ignorando o `providerChargeId` antigo.
- **Pula** o P3 (não recupera o vencido).
- Gera um `seuNumero` **único** de ≤15 chars: núcleo numérico da conta (7 díg, preserva
  rastreabilidade para o find-by-seu) + `R` + carimbo h/m/s. Ex.: `2609372R143052`.
- Backend (`buildPayload`/`createInterCharge`/handler) aceita `seuNumero` override no body.

A 1ª emissão automática e contas manuais sem boleto seguem inalteradas. Decisão de negócio do
usuário: reemitir pelo modal SEMPRE gera novo (o boleto antigo vencido fica no Inter, mas deixa de
ser o cobrado).

---

## Princípios arquiteturais consolidados nesta sessão

1. **Prova durável > timestamp.** Estado terminal (NF autorizada/cancelada, conta com boleto real)
   nunca é rebaixado por um eco sem prova igual/superior — independente de qual chegou "por último".
2. **Recuperar antes de criar.** Antes de criar um recurso externo (boleto), perguntar ao provedor
   se já existe — evita duplicidade e fecha loops de "criou mas perdeu o vínculo".
3. **Idempotência com lock.** Operações de emissão têm lock por entidade — clique duplo não duplica.
4. **Intenção explícita do usuário tem precedência.** Reemitir com novo vencimento = boleto novo,
   não recuperação do antigo.
5. **Nunca marcar autorizado/emitido sem prova real** do provedor (SEFAZ: cStat 100/150 + chave +
   protocolo; Inter: providerChargeId).

---

## Validação

Todos os fixes foram validados em **produção** via Playwright (login angela), com o **código
realmente servido** (não só local):
- Emissão real da NF 1624: nasceu pendente → autorizou → Emitidas → permaneceu (não regrediu),
  sobrevivendo a um eco de realtime aos 3 min.
- Guardas testadas com fixtures dos cenários de bug + regressão.
- find-by-seu (30d) confirmado encontrando boleto antigo.
- Funções serverless vivas (bank-charge, gdp-integrations) após cada deploy.

---

*Gerado ao final da sessão de 2026-06-26 para registro permanente.*

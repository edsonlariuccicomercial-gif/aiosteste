# EPIC-22: Módulos por Cliente — habilitar/desabilitar módulos vendáveis (Fase 1 da separação de produtos)

## Contexto

Decisão estratégica do stakeholder (Edson): **simplificar o produto para vender o GDP isoladamente em breve**, tratando **Radar** e **Intel Preços** como **produtos separados** (a serem redesenvolvidos) com **integração futura via API**.

Discovery por evidência de código pelo **@analyst (Atlas)**: `docs/stories/DISCOVERY-EPIC22-MODULOS-POR-CLIENTE.md` (2026-06-21).

**Insight-chave:** o sistema **já possui** o mecanismo certo para a Fase 1 — um toggle em **Configurações → Módulos** (`nexedu.modulos.acesso`) que define quais módulos ficam disponíveis por cliente. Ele está **bugado**: o ocultamento não persiste na navegação nem na tela do GDP. Consertá-lo entrega a separação de produtos como **feature configurável** (habilita por cliente só o que ele comprou) — reversível, granular, sem deletar código. Superior a "esconder via código".

## Objetivo

Fazer o toggle de **Módulos por cliente** funcionar de forma **consistente e persistente** em **toda navegação** e em **todas as telas** (`index.html`, `dashboard-home.html`, `gdp-contratos.html`), com **qualquer módulo opcional** (inclusive GDP) — permitindo vender qualquer combinação (só GDP, só Radar, GDP+Intel, etc.). Isto destrava a venda do GDP isolado já.

## Decisões do Stakeholder (Edson — 2026-06-21)

- **Fase 1 = consertar o toggle existente.** NÃO esconder via código, NÃO deletar Radar/Intel, NÃO separar repositório agora.
- **Qualquer módulo** deve ser ligável/desligável por cliente (inclusive GDP), para vender qualquer combinação.
- **Aplicar a visibilidade em TODAS as telas** (index, dashboard-home, gdp-contratos) — comportamento consistente; módulo oculto some em todo lugar.
- **Núcleo comum** (`product-store` + matching de NCM) deve virar **serviço/API** consumido por GDP, Radar e Intel — a "ponte" de integração. **(Fase 2 — @architect, não bloqueante.)**

## Bug central (causa-raiz — evidência de código)

A seleção **persiste corretamente** em `localStorage` (`nexedu.modulos.acesso`, shape `{radar, intelPrecos, gdp}`). A falha é que `aplicarAcessoSidebar()` **não é re-executado** em alguns caminhos de render:

```
Desmarcar módulo        ✅  app-utils.js:295-304 (salvarModulos → aplicarAcessoSidebar)
Boot index.html         ✅  app.js:75-76
Boot dashboard-home     ✅  dashboard-home.html:505
Navegar entre módulos   ❌  app-config.js:33-91 (switchModule só troca .active; não reaplica)   ← bug 1
Boot gdp-contratos.html ❌  gdp-init.js nunca aplica a config (sidebar :232-267)                 ← bug 2
Nav. do dashboard-home  ⚠️  onclick inline não passa por switchModule                            ← bug 3 (menor)
```

**Causa de fundo:** visibilidade aplicada por DOM (`btn.style.display='none'`) e **não reaplicada** em todo render/navegação — só persiste em reload das páginas que chamam a função no boot.

## Arquitetura Atual (AS-IS)

```
Storage:    nexedu.modulos.acesso → { radar, intelPrecos, gdp } (gdp forçado true)
Leitura:    getAcessoModulos() (app-utils.js:284-293)
Aplicação:  aplicarAcessoSidebar() (app-utils.js:313-321) → btn.style.display por data-module
Salvar:     salvarModulos() (app-utils.js:295-304) → salva + aplica (na hora)
Boot:       index.html ✅ (app.js:75-76); dashboard-home ✅ (:505); gdp-contratos ❌ (falta)
Navegação:  switchModule() (app-config.js:33-91) → só .active, sem reaplicar
GDP fixo:   gdp sempre true (não desmarcável)
```

## Arquitetura Proposta (TO-BE)

```
aplicarAcessoSidebar()  reaplicada em TODO caminho: salvar, boot das 3 telas, e switchModule.
switchModule()          chama aplicarAcessoSidebar() ao final.
gdp-contratos.html      aplica a config no boot (função disponível no contexto do GDP).
dashboard-home          navegação reaplica visibilidade (ou roteia via switchModule).
Modelo                  qualquer módulo opcional (sem hardcode gdp=true); default seguro:
                        sem config → todos visíveis (não trava ninguém).
Storage/shape           único e consistente entre as 3 páginas (sem shapes divergentes).
```

## Tabela Sintoma → Causa → Story

| Sintoma (stakeholder) | Causa-raiz (evidência) | Story |
|-----------------------|------------------------|-------|
| Módulo desmarcado reaparece ao navegar entre módulos | `switchModule()` (`app-config.js:33-91`) não chama `aplicarAcessoSidebar()` | **22.1** |
| Na tela do GDP o módulo oculto sempre aparece | `gdp-contratos.html`/`gdp-init.js` nunca aplica a config no boot | **22.1** |
| Não dá para vender combinações (GDP fixo) | hardcode `gdp: true` em `getAcessoModulos`/`salvarModulos` | **22.1** |

---

## STORY 22.1 — Toggle de Módulos por cliente: consistente em todas as telas e navegação

**Prioridade:** P1 (destrava venda do GDP) · **Risco:** BAIXO-MÉDIO (toca o shell/sidebar das 3 páginas) · **Complexidade:** M

### Descrição
O toggle de Configurações → Módulos deve definir, por cliente, quais módulos ficam visíveis — e essa visibilidade deve **persistir em toda a navegação e em todas as telas**. Hoje, ao desmarcar um módulo ele some, mas reaparece ao navegar entre módulos (o `switchModule` não reaplica) e nunca é aplicado na tela do GDP (`gdp-contratos.html`). Além disso, o GDP é forçado visível; deve passar a ser opcional como os demais, para permitir vender qualquer combinação.

### Requisitos Funcionais
- **FR-22.1.1:** `switchModule()` (`app-config.js:33-91`) deve chamar `aplicarAcessoSidebar()` ao final, reaplicando a visibilidade persistida a cada troca de módulo.
- **FR-22.1.2:** O boot de `gdp-contratos.html` (via `gdp-init.js`) deve aplicar a config de módulos (`aplicarAcessoSidebar()`), garantindo que a função e a leitura do storage estejam disponíveis no contexto do GDP (incluir/portar de `app-utils.js` sem duplicar shape).
- **FR-22.1.3:** A navegação a partir de `dashboard-home.html` deve reaplicar a visibilidade (rotear via `switchModule` ou chamar a função após navegar), evitando que módulos ocultos reapareçam.
- **FR-22.1.4:** Generalizar o modelo para **qualquer módulo opcional** (remover o hardcode `gdp: true` em `getAcessoModulos`/`salvarModulos`), permitindo desabilitar inclusive o GDP.
- **FR-22.1.5:** **Default seguro:** se não houver config salva (cliente novo / primeiro acesso), **todos os módulos ficam visíveis** — nunca travar o usuário fora de tudo.
- **FR-22.1.6:** Storage key e shape únicos e consistentes entre as 3 páginas (`nexedu.modulos.acesso`); sem shapes divergentes entre `app-utils.js` e `dashboard-home.html`.
- **FR-22.1.7:** A UI de checkboxes (`index.html:1071-1090`) deve refletir o estado real e permitir marcar/desmarcar qualquer módulo (inclusive GDP).

### Critérios de Aceitação
- **AC1:** *Given* um módulo desmarcado nas Configurações, *When* navego clicando em outro módulo, *Then* o módulo desmarcado **permanece oculto** (não reaparece).
- **AC2:** *Given* um módulo desmarcado, *When* abro a tela do GDP (`gdp-contratos.html`), *Then* o módulo desmarcado **não aparece** na sidebar do GDP.
- **AC3:** *Given* um módulo desmarcado, *When* recarrego qualquer das 3 telas, *Then* ele continua oculto (persistência consistente).
- **AC4:** *Given* a config de módulos, *When* desmarco o GDP, *Then* o GDP também pode ser ocultado (qualquer combinação é possível).
- **AC5:** *Given* um cliente sem config salva, *When* acessa o sistema, *Then* todos os módulos aparecem (default seguro — ninguém fica travado).
- **AC6:** *Given* marco/desmarco módulos nas Configurações, *When* salvo, *Then* a sidebar reflete imediatamente e o estado persiste em todas as telas e navegação.

### Escopo
- **IN:** consistência e persistência da visibilidade de módulos no shell/sidebar das 3 telas; qualquer módulo opcional; default seguro.
- **OUT:** deletar código/HTML de Radar/Intel; separar repositório; criar a API do núcleo comum (Fase 2); redesenhar a UI das Configurações além do necessário para o toggle funcionar.

### Arquivos
- `app-utils.js:282` (key), `:284-293` (`getAcessoModulos`), `:295-304` (`salvarModulos`), `:313-321` (`aplicarAcessoSidebar`)
- `app-config.js:2` (`MODULE_STORAGE_KEY`), `:33-91` (`switchModule` — FR-22.1.1)
- `app.js:75-76` (boot index — referência), `:1998-2001` (bind)
- `index.html:40-70` (sidebar), `:1071-1090` (checkboxes — FR-22.1.7)
- `dashboard-home.html:148` (key), `:180-196` (função), `:505` (boot — FR-22.1.3)
- `gdp-contratos.html:232-267` (sidebar GDP), `js/gdp-init.js` (boot — FR-22.1.2)

### Notas de implementação (não-normativas)
- Centralizar a leitura/aplicação numa única fonte para as 3 páginas (evitar a duplicação atual entre `app-utils.js` e `dashboard-home.html`).
- Bump `?v=N` nos scripts alterados em `gdp-contratos.html` e nas demais páginas que carregam os JS tocados; deploy `npx vercel --prod --force`; orientar Ctrl+Shift+R.

---

## Definition of Done (Epic — Fase 1)

- Story 22.1 implementada com AC1–AC6 verificados.
- Módulo desmarcado permanece oculto em **todas as 3 telas** e em **toda navegação**, persistindo em reload.
- Qualquer módulo (inclusive GDP) é opcional; default seguro (sem config → tudo visível).
- Sem regressão no funcionamento dos módulos visíveis nem na navegação.
- Bump `?v=N` dos scripts alterados; deploy `npx vercel --prod --force`; validação em produção.

## Follow-up (não bloqueia a Fase 1)

- **Fase 2 (@architect):** desenhar a separação em 3 produtos vendáveis + estratégia de **API de integração** com o núcleo comum (`product-store` + matching de NCM) como serviço.
- **Fase 3:** redesenvolver Radar e Intel como produtos próprios consumindo o GDP/núcleo via API.

## Validação PO (Pax — 2026-06-21)

Status: **Draft → Ready** — Story 22.1 com verdito **GO (10/10)** no checklist de 10 pontos.

| Story | Score | Verdito | Observação |
|-------|-------|---------|------------|
| 22.1 | 10/10 | GO | Ver pontos de atenção abaixo |

### Pontos de atenção do PO (não bloqueiam o início)

1. **FR-22.1.2 — maior cuidado técnico:** `aplicarAcessoSidebar()` vive em `app-utils.js`, que **não é carregado** por `gdp-contratos.html`. O @dev precisa portar/disponibilizar a função + leitura do storage no contexto do GDP, **sem duplicar shape divergente** (FR-22.1.6). Recomenda-se uma fonte única compartilhada.
2. **FR-22.1.5 — default seguro é crítico:** QA deve validar explicitamente "cliente sem config salva → todos os módulos visíveis". Um erro aqui travaria um cliente novo fora de tudo.

### Sequência de implementação recomendada (PO)

1. Centralizar leitura/aplicação numa fonte única (evita a duplicação atual `app-utils.js` × `dashboard-home.html`).
2. `switchModule()` reaplica (FR-22.1.1) → boot do GDP aplica (FR-22.1.2) → navegação do hub reaplica (FR-22.1.3).
3. Generalizar para qualquer módulo + default seguro (FR-22.1.4/5).
4. Bump `?v=N` nos scripts alterados; deploy `npx vercel --prod --force`; validar em produção os 6 ACs (com foco em AC1, AC2 e AC5).

## Dev Agent Record (Dex) — Story 22.1

### Implementação (2026-06-21)
- **Fonte única criada:** `modulos-acesso.js` — `getAcessoModulos`/`setAcessoModulos`/`aplicarAcessoSidebar` canônicos. Qualquer módulo opcional (sem hardcode `gdp=true`); default seguro (sem config ou JSON corrompido → tudo visível). Carregado por `index.html`, `dashboard-home.html` e `gdp-contratos.html`. (FR-22.1.4/5/6)
- **FR-22.1.1:** `switchModule()` (`app-config.js`) agora chama `aplicarAcessoSidebar()` ao final — módulo oculto não reaparece ao navegar.
- **FR-22.1.2:** `gdp-init.js` (`initGDP`, após `renderAll()`) chama `aplicarAcessoSidebar()`; `gdp-contratos.html` carrega `modulos-acesso.js` antes do init. A sidebar do GDP já tinha `data-module` (radar/intel-precos/gdp).
- **FR-22.1.7:** `app-utils.js` — `salvarModulos()` lê os 3 checkboxes (inclusive `mod-gdp`); `carregarModulosConfig()` não desabilita mais o GDP (`g.disabled=false`). Removidas as cópias locais de `getAcessoModulos`/`aplicarAcessoSidebar`.
- **FR-22.1.6:** removida a cópia divergente em `dashboard-home.html` (usava shape sem `!==false`); agora usa a fonte única.
- **Versões:** `app-utils v1→v2`, `app-config v1→v2` (index.html); `gdp-init v32→v33` (gdp-contratos.html); `modulos-acesso.js?v=1` nas 3 páginas.
- **Validações:** `node --check` em todos os JS → OK. Simulação end-to-end da lógica (sem config / desmarcar radar / desmarcar GDP / reativar / JSON corrompido) → todos os cenários corretos, incluindo default seguro. CodeRabbit não rodou (WSL sem distro — limitação de ambiente).

#### File List (Story 22.1)
- `modulos-acesso.js` (novo — fonte única)
- `app-config.js` (switchModule reaplica)
- `app-utils.js` (bindings de UI; GDP opcional; remoção de cópia)
- `dashboard-home.html` (usa fonte única; remoção de cópia)
- `index.html` (carrega modulos-acesso.js; bump app-utils/app-config)
- `gdp-contratos.html` (carrega modulos-acesso.js; bump gdp-init)
- `js/gdp-init.js` (aplica no boot do GDP)

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-06-21 | @analyst (Atlas) | Discovery do toggle de Módulos + estratégia de produtos separados (root-cause por código) |
| 2026-06-21 | @pm (Morgan) | EPIC-22 criado com Story 22.1 (Fase 1); Fase 2/3 sinalizadas como follow-up |
| 2026-06-21 | @po (Pax) | Validação 10 pontos — 22.1 GO (10/10); Draft → Ready; 2 pontos de atenção registrados |
| 2026-06-21 | @dev (Dex) | Story 22.1 implementada (fonte única modulos-acesso.js; switchModule + boot GDP reaplicam; qualquer módulo opcional + default seguro); node --check OK; lógica simulada; Ready for Review → handoff @devops |
| 2026-06-21 | @devops (Gage) | Push + PR #21 + merge em master (5b87304); deploy prod `--force`; validado em produção (Playwright/fetch): modulos-acesso servido, gdp-init v33 aplica no boot, switchModule reaplica, 3 telas usam a fonte única (sem cópia divergente) — todos confirmados |

---

*EPIC-22 criado por Morgan (@pm) a partir do discovery de Atlas (@analyst) — 2026-06-21.*

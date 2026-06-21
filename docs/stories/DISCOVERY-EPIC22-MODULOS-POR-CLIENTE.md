# DISCOVERY — Módulos por Cliente (toggle de Configurações) + Estratégia de Produtos Separados

> Investigação por **@analyst (Atlas)** — 2026-06-21. Root-cause por evidência de código (`file:line`).

## Contexto estratégico (stakeholder — Edson)

Objetivo de negócio: **simplificar o produto para vender o GDP isoladamente em breve**, e tratar **Radar** e **Intel Preços** como **produtos separados** a serem redesenvolvidos ("não ficaram bons"), com **possível integração futura via API**.

- **GDP** — quase pronto, prioridade de venda imediata.
- **Radar / Intel Preços** — redesenvolver depois, vender avulso ou integrado.
- **Núcleo comum** (`product-store` + matching de NCM) — decisão de produto: virar **serviço/API** consumido por GDP, Radar e Intel (a "ponte" de integração). *(Fase 2 — @architect.)*

## Insight-chave

O sistema **já possui** a funcionalidade necessária para a Fase 1: um toggle em **Configurações → Módulos** que define quais módulos ficam disponíveis por cliente (`nexedu.modulos.acesso`). **Ela está bugada** — consertá-la entrega a separação de produtos como **feature configurável** (habilitar por cliente o que ele comprou), sem deletar código, reversível e granular. **Muito superior** a "esconder via código".

## Bug reportado

Ao **desmarcar** um módulo nas Configurações, o nome some do menu — mas ao **clicar em outro módulo** (navegar), o módulo oculto **reaparece**.

## Root-cause (3 lacunas) — evidência de código

A seleção persiste corretamente em `localStorage` (`nexedu.modulos.acesso`, shape `{radar, intelPrecos, gdp}`). O problema é que `aplicarAcessoSidebar()` **não é re-executado** em alguns caminhos de render:

| Caminho | Aplica visibilidade? | Evidência |
|---------|----------------------|-----------|
| Desmarcar módulo | ✅ | `app-utils.js:295-304` (`salvarModulos` → `aplicarAcessoSidebar`) |
| Definição/leitura/aplicação | — | `app-utils.js:282` (key), `:284-293` (`getAcessoModulos`), `:313-321` (`aplicarAcessoSidebar`) |
| Boot `index.html` | ✅ | `app.js:75-76` |
| Boot `dashboard-home.html` | ✅ | `dashboard-home.html:505` (+ função `:180-196`) |
| **Navegar entre módulos** | ❌ **bug 1** | `app-config.js:33-91` (`switchModule`) só troca `.active` (`:40-43`); **nunca chama** `aplicarAcessoSidebar()` |
| **Boot `gdp-contratos.html`** | ❌ **bug 2** | `gdp-init.js` **não chama** `aplicarAcessoSidebar()`; sidebar em `gdp-contratos.html:232-267` |
| Navegação a partir de `dashboard-home.html` | ⚠️ **bug 3 (menor)** | usa `onclick` inline, não passa por `switchModule` |

**Causa única de fundo:** a visibilidade é aplicada por manipulação direta de DOM (`btn.style.display='none'`) e **não é reaplicada** em todo render/navegação — só persiste em reload das páginas que chamam a função no boot.

## Limitação atual a corrigir (decisão do stakeholder)

- Hoje o GDP é forçado `gdp: true` (não desmarcável). **Decisão:** tornar **qualquer módulo** ligável/desligável por cliente (inclusive GDP) → permite vender qualquer combinação (só GDP, só Radar, GDP+Intel, etc.).
- **Decisão:** aplicar o toggle em **todas** as telas (`index.html`, `dashboard-home.html`, `gdp-contratos.html`) para comportamento consistente.

## Escopo proposto — Fase 1 (vendável já, baixo risco)

**Objetivo:** o toggle de Módulos por cliente funcionar de forma consistente e persistente em toda a navegação e em todas as telas, com qualquer módulo opcional.

Pontos de correção (evidência acima):
1. `switchModule()` (`app-config.js`) deve chamar `aplicarAcessoSidebar()` ao final.
2. Boot de `gdp-contratos.html` (via `gdp-init.js`) deve chamar `aplicarAcessoSidebar()` — exige a função estar disponível nessa página (hoje vive em `app-utils.js`/`dashboard-home.html`; avaliar incluir/portar para o contexto do GDP).
3. Navegação a partir do `dashboard-home.html` deve reaplicar a visibilidade (ou rotear via `switchModule`).
4. Generalizar o modelo para qualquer módulo opcional (remover o hardcode `gdp` sempre true), mantendo um default seguro (todos visíveis se não houver config).
5. Garantir que a função e o storage key estejam acessíveis/consistentes nas 3 páginas (não duplicar shape divergente).

**Fora de escopo (Fase 1):** deletar código de Radar/Intel; separar repositório; criar a API do núcleo comum.

## Fases seguintes (não-Fase 1)

- **Fase 2 (@architect):** desenhar a separação em 3 produtos vendáveis + estratégia de **API de integração** com o núcleo comum (`product-store` + matching de NCM) como serviço.
- **Fase 3:** redesenvolver Radar e Intel como produtos próprios consumindo o GDP/núcleo via API.

## Arquivos relevantes (mapa)

- `app-utils.js:282` (key `nexedu.modulos.acesso`), `:284-293` (`getAcessoModulos`), `:295-304` (`salvarModulos`), `:313-321` (`aplicarAcessoSidebar`)
- `app-config.js:2` (`MODULE_STORAGE_KEY`), `:33-91` (`switchModule` — bug 1)
- `app.js:75-76` (boot index aplica), `:1998-2001` (bind switchModule)
- `index.html:40-70` (sidebar), `:1071-1090` (UI de checkboxes dos módulos)
- `dashboard-home.html:148` (key), `:180-196` (função), `:505` (boot aplica)
- `gdp-contratos.html:232-267` (sidebar GDP), `:239/243/267` (botões Radar/Intel/Config)
- `gdp-init.js` (boot do GDP — falta a chamada — bug 2)

---
*Discovery por Atlas (@analyst) — 2026-06-21. Próximo: @pm criar story de Fase 1.*

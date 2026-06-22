# P4 — Visibilidade de módulos só persiste localmente (precisa ser online)

**Severidade:** HIGH · **Tipo:** mudança de design (não é bug de save) · **Risco:** médio/alto
**Reportado por:** usuário (2026-06-22) · **Diagnóstico:** @analyst (Atlas)
**Fluxo recomendado:** Spec Pipeline (@pm/@architect/@data-engineer) → depois SDC

## Comportamento esperado
Marcar um módulo como disponível/oculto (ex.: "deixar só o GDP") deve valer
**online para qualquer navegador, computador ou usuário** — não só na máquina local.

## Comportamento atual
A mudança feita ontem só refletiu no navegador do próprio usuário. Demais
navegadores/máquinas continuaram com a config antiga.

## Causa raiz
A config de acesso a módulos é salva **apenas em `localStorage`**. Não há nenhuma
escrita no Supabase. Foi assim por design (Story 22.1, "fonte ÚNICA de controle de
acesso por módulo" — porém local). Logo, é **mudança arquitetural**, não correção de bug.

## Evidências (file:line)
- `modulos-acesso.js:10` — `MODULOS_KEY = "nexedu.modulos.acesso"` (localStorage)
- `modulos-acesso.js:19-32` — `getAcessoModulos`: lê só `localStorage.getItem`
- `modulos-acesso.js:35-44` — `setAcessoModulos`: grava só `localStorage.setItem`
- `modulos-acesso.js:47-55` — `aplicarAcessoSidebar`: aplica visibilidade na sidebar via `data-module`
- Módulos conhecidos: `radar`, `intelPrecos`, `gdp` (`modulos-acesso.js:12-16`)

## Mudança proposta (alto nível — requer decisão de @architect/@data-engineer)
1. **Persistência no Supabase**: gravar a config de acesso por **empresa_id**
   (decidir: tabela nova `empresa_modulos` vs coluna JSON em config de empresa já existente).
2. **Granularidade**: confirmar com o usuário/@pm — config por **empresa** (default)
   ou também por **usuário**? (O relato diz "qualquer usuário" → provavelmente por empresa.)
3. **Leitura no init**: `getAcessoModulos()` passa a ler do `gdpApi` (Supabase) com
   fallback ao localStorage/cache; manter "default seguro: tudo visível".
4. **Escrita**: `setAcessoModulos()` → `gdpApi.<...>.save()` com `_markSelfEcho`
   (mesmo padrão de supressão de eco já usado nos demais saves).
5. **Realtime**: propagar mudanças para sessões abertas (re-aplicar `aplicarAcessoSidebar`).
6. **RLS**: política por `empresa_id` (delegar a @data-engineer).

## Dependências / blockers
- Decisão de schema (tabela vs coluna) e granularidade (empresa vs usuário) — @architect/@po.
- RLS e migration — @data-engineer.

## Critérios de aceite
- [ ] Alterar visibilidade em um navegador reflete em todos os outros (após reload/realtime).
- [ ] Vale para qualquer usuário/máquina da mesma empresa.
- [ ] Default seguro mantido (sem config → tudo visível; nunca travar cliente novo fora de tudo).
- [ ] Fallback gracioso se Supabase indisponível (usa último cache local).

## Por que NÃO juntar com P1-P3
P1-P3 são fixes pontuais de front-end. P4 envolve schema, RLS, init e realtime —
merece spec dedicada para não acoplar risco fiscal/sync a uma mudança de config.

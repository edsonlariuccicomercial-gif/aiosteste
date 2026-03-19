# Avaliacao de Debito Tecnico — DRAFT

**Fase:** Brownfield Discovery — Fase 4 (Consolidacao Inicial)
**Agente:** @architect (Aria)
**Data:** 2026-03-09
**Status:** DRAFT — Pendente validacao de especialistas

---

## 1. Debitos de Sistema (Fonte: system-architecture.md)

### 1.1 Debitos Arquiteturais

| ID | Debito | Severidade | Impacto |
|----|--------|-----------|---------|
| SYS-1 | **app.js monolito com 2546 linhas** — toda logica frontend em um unico arquivo sem modularizacao | ALTO | Impossivel testar, dificil manter, alto risco de regressao |
| SYS-2 | **Sem testes automatizados** — zero cobertura de testes unitarios, integracao ou e2e | ALTO | Qualquer mudanca pode quebrar funcionalidades sem deteccao |
| SYS-3 | **7 paginas HTML com logica inline duplicada** — CSS e JS repetido em cada pagina GDP | MEDIO | Manutencao custosa, inconsistencias visuais crescentes |
| SYS-4 | **JSON flat files sem validacao de schema** — dados nao validados em nenhum ponto | MEDIO | Dados malformados propagam silenciosamente |
| SYS-5 | **Sem error handling padronizado** — mix de try/catch, console.warn e alert() | MEDIO | Experiencia ruim em falhas, dificuldade de debug |
| SYS-6 | **Sem logging estruturado** — logs nao padronizados, sem niveis, sem rotacao | MEDIO | Impossivel monitorar e diagnosticar problemas em producao |
| SYS-7 | **Dependencias via CDN sem lock de versao** — SheetJS e PDF.js carregados sem versao fixa | BAIXO | Breaking changes silenciosas em atualizacoes CDN |
| SYS-8 | **Sem CI/CD pipeline** — deploy manual via Netlify | ALTO | Sem gates de qualidade, deploys arriscados |
| SYS-9 | **Sem health monitoring em producao** — nenhum alerta de falha | MEDIO | Problemas so detectados quando usuario reporta |
| SYS-10 | **PWA entregador incompleta** — manifest ausente, SW nao registrado, sem offline-first | BAIXO | App nao instalavel, dados perdidos offline |

### 1.2 Debitos de Seguranca (Nivel Sistema)

| ID | Debito | Severidade | Impacto |
|----|--------|-----------|---------|
| SEC-1 | **Login client-side com SHA-256 hardcoded** — senha `lariucci2026` no comentario de auth.js | CRITICO | Qualquer pessoa com acesso ao codigo entra no dashboard |
| SEC-2 | **localStorage armazena dados sensiveis** — pre-cotacoes, credenciais SGD, banco de precos | ALTO | Dados acessiveis via DevTools do browser |
| SEC-3 | **Netlify Functions sem autenticacao** — apenas CORS, sem token/session | ALTO | Qualquer cliente pode chamar APIs de envio SGD e Tiny |
| SEC-4 | **CNPJ/senha em plaintext no .env** — sem rotacao, sem vault | MEDIO | Risco se .env vazar |
| SEC-5 | **escolas-credentials.json commitado no repositorio** — senhas em texto plano de 5 escolas | CRITICO | Acesso nao autorizado a contas de escolas no SGD |
| SEC-6 | **Sem rate limiting nas APIs** — nenhuma protecao contra abuso | MEDIO | Vulneravel a brute force e DDoS |
| SEC-7 | **Sem validacao de input nas propostas** — dados malformados chegam ao SGD | MEDIO | Propostas invalidas, possivel rejeicao pelo SGD |

---

## 2. Debitos de Dados (Fonte: data-audit.md)

### 2.1 Debitos Criticos de Dados

| ID | Debito | Severidade | Impacto |
|----|--------|-----------|---------|
| D-01 | **Senhas em texto plano em escolas-credentials.json** commitado no repo | CRITICO | Acesso nao autorizado a contas escolares |
| D-02 | **Senha do dashboard no comentario de auth.js** (`lariucci2026`) | CRITICO | Bypass total da autenticacao |
| D-03 | **APIs Express sem autenticacao** — submit, order, scan abertos | CRITICO | Envio nao autorizado de propostas e pedidos |
| D-04 | **CNPJ real no .env.example** commitado | ALTO | Exposicao de dado cadastral |

### 2.2 Debitos de Integridade

| ID | Debito | Severidade | Impacto |
|----|--------|-----------|---------|
| D-05 | **Sem backup automatico dos JSON files** | ALTO | Perda total de dados em falha |
| D-06 | **Escrita nao-atomica (writeFileSync)** — crash corrompe arquivo | ALTO | Corrupcao de orcamentos.json |
| D-07 | **Nenhuma validacao de schema** nos dados recebidos/escritos | ALTO | Dados malformados propagam silenciosamente |
| D-08 | **Scan SGD sequencial** — 2 requests/orcamento, ~120 requests para 60 budgets | ALTO | Scan leva 5-10 minutos |
| D-09 | **Fuzzy match de itens no submit** — includes bidirecional + fallback indice | ALTO | Mapeamento incorreto pode enviar precos errados |

### 2.3 Debitos de Qualidade de Dados

| ID | Debito | Severidade | Impacto |
|----|--------|-----------|---------|
| D-10 | **Sem versionamento de dados** — nenhum updatedAt nos orcamentos | MEDIO | Impossivel auditar alteracoes |
| D-11 | **readFileSync sincrono** bloqueia event loop | MEDIO | Degrada performance sob carga |
| D-12 | **Dois mecanismos de coleta duplicados** — Playwright + REST | MEDIO | Confusao operacional, dados inconsistentes |
| D-13 | **Estimativa de custo baseada em hash do idBudget** — ficticias | MEDIO | Precos sugeridos sem base real |
| D-14 | **Nearest-match para expense groups** — threshold 30 | MEDIO | Grupo de despesa errado em redes diferentes |
| D-15 | **Sem paginacao no dashboard** — carrega JSON inteiro | MEDIO | Problemas com >500 orcamentos |
| D-16 | **Dados ARP hardcoded** em JSON estatico | BAIXO | Atualizacao manual a cada mudanca de ARP |
| D-17 | **Sem indices ou cache** para buscas frequentes | BAIXO | Performance O(n) |
| D-18 | **Log rotativo apenas no sync** — demais sem rotacao | BAIXO | Crescimento ilimitado |

### 2.4 Debitos de Conformidade (LGPD)

| ID | Debito | Severidade | Impacto |
|----|--------|-----------|---------|
| D-19 | **PII de responsaveis de escolas** — nomes, telefones, emails em JSON commitado | ALTO | Violacao LGPD — requer consentimento |
| D-20 | **Emails comerciais pessoais** em lariucci-arp-2025.json | MEDIO | Exposicao de dados pessoais |

---

## 3. Debitos de Frontend/UX (Fonte: frontend-spec.md)

### 3.1 Debitos Criticos de UX

| ID | Debito | Severidade | Impacto |
|----|--------|-----------|---------|
| UX-01 | **Autenticacao insegura client-side** — hash SHA-256 hardcoded, credenciais visiveis no source | CRITICO | Seguranca nula |
| UX-02 | **Dois design systems incompativeis** — painel verde vs GDP azul, tokens diferentes | ALTO | Experiencia fragmentada, parece dois produtos |
| UX-03 | **7 paginas independentes sem layout compartilhado** — 200-400 linhas CSS inline cada | ALTO | Manutencao impossivel |
| UX-04 | **Zero acessibilidade (a11y)** — nenhum aria-*, role, focus management | ALTO | Inacessivel, problema legal em sistema educacional publico |
| UX-05 | **app.js monolitico 2546 linhas** — sem modularizacao | ALTO | Impossivel testar e manter |

### 3.2 Debitos de UX Medio

| ID | Debito | Severidade | Impacto |
|----|--------|-----------|---------|
| UX-06 | **innerHTML para renderizacao** — risco XSS, escapeHtml inconsistente | MEDIO | Seguranca e manutencao |
| UX-07 | **Sem loading states** — nenhum indicador de carregamento global | MEDIO | Confusao do usuario |
| UX-08 | **Sem error boundaries** — erros via console.warn ou alert() | MEDIO | Experiencia ruim em falhas |
| UX-09 | **PWA incompleta** — manifest, icons, SW ausentes | MEDIO | App entregador nao instalavel |
| UX-10 | **Dados demo hardcoded** no gdp-entregador.html | BAIXO | Confusao em producao |
| UX-11 | **Sem paginacao** — tabelas renderizam tudo de uma vez | MEDIO | Performance degradada |
| UX-12 | **localStorage como unico storage** — risco perda dados | ALTO | Pre-orcamentos perdidos em limpeza de cache |
| UX-13 | **Credenciais SGD em localStorage** em plain text | ALTO | CNPJ e senha expostos |

### 3.3 Debitos de UX Menor

| ID | Debito | Severidade | Impacto |
|----|--------|-----------|---------|
| UX-14 | **prompt() para credenciais SGD** — UX primitiva | BAIXO | Experiencia ruim |
| UX-15 | **Sem animacoes de transicao** entre abas | BAIXO | Transicao abrupta |
| UX-16 | **Feedback visual insuficiente** — apenas toast | BAIXO | Falta confirmacao antes de acoes destrutivas |
| UX-17 | **Sem undo/redo** — acoes irreversiveis | MEDIO | Risco de erro do usuario |
| UX-18 | **Emoji como icones** em vez de icon library | BAIXO | Renderizacao inconsistente |

---

## 4. Matriz Preliminar de Debitos

### 4.1 Legenda

- **Severidade:** CRITICO (5), ALTO (4), MEDIO (3), BAIXO (2)
- **Esforco:** P (2-4h), M (4-8h), G (8-16h), XG (16-40h)
- **Prioridade:** Calculada = Severidade x Urgencia / Esforco

### 4.2 Matriz Consolidada

| # | ID | Debito | Area | Sev. | Esforco | Prioridade |
|---|-----|--------|------|------|---------|-----------|
| 1 | SEC-5/D-01 | Credenciais de escolas commitadas no repo | Seguranca/Dados | CRITICO | P (2h) | P0 - IMEDIATO |
| 2 | SEC-1/D-02/UX-01 | Login hardcoded + senha no comentario | Seguranca | CRITICO | M (4-8h) | P0 - IMEDIATO |
| 3 | D-04 | CNPJ real no .env.example | Seguranca | ALTO | P (0.5h) | P0 - IMEDIATO |
| 4 | SEC-3/D-03 | APIs Express/Netlify sem autenticacao | Seguranca/Backend | CRITICO | M (4h) | P0 - IMEDIATO |
| 5 | D-19 | PII de escolas em JSON commitado (LGPD) | Conformidade | ALTO | M (4h) | P1 - URGENTE |
| 6 | D-06 | Escrita nao-atomica de JSON | Dados | ALTO | M (3h) | P1 - URGENTE |
| 7 | D-05 | Sem backup automatico | Dados | ALTO | M (4h) | P1 - URGENTE |
| 8 | D-07/SYS-4 | Sem validacao de schema | Dados/Sistema | ALTO | G (8h) | P1 - URGENTE |
| 9 | SEC-2/UX-13 | Dados sensiveis em localStorage | Seguranca/UX | ALTO | G (8-12h) | P1 - URGENTE |
| 10 | SYS-8 | Sem CI/CD pipeline | DevOps | ALTO | G (8-16h) | P1 - URGENTE |
| 11 | SYS-2 | Sem testes automatizados | Qualidade | ALTO | XG (24-40h) | P2 - ALTO |
| 12 | SYS-1/UX-05 | app.js monolito (2546 linhas) | Frontend | ALTO | XG (16-24h) | P2 - ALTO |
| 13 | UX-04 | Zero acessibilidade (a11y) | UX | ALTO | XG (16-24h) | P2 - ALTO |
| 14 | UX-02 | Dois design systems incompativeis | UX | ALTO | G (16-24h) | P2 - ALTO |
| 15 | UX-03/SYS-3 | Paginas independentes sem layout compartilhado | Frontend/UX | MEDIO | XG (24-40h) | P2 - ALTO |
| 16 | D-09 | Fuzzy match incorreto no submit SGD | Dados | ALTO | M (6h) | P2 - ALTO |
| 17 | D-12 | Dois mecanismos de coleta duplicados | Dados/Ops | MEDIO | G (8h) | P2 - ALTO |
| 18 | D-08 | Scan SGD sequencial (lento) | Performance | ALTO | M (4h) | P3 - MEDIO |
| 19 | D-13 | Estimativa de custo ficticia | Dados | MEDIO | M (6h) | P3 - MEDIO |
| 20 | SEC-6 | Sem rate limiting | Seguranca | MEDIO | M (4h) | P3 - MEDIO |
| 21 | SEC-7/SYS-5 | Sem validacao de input/error handling | Backend | MEDIO | M (4-8h) | P3 - MEDIO |
| 22 | SYS-6 | Sem logging estruturado | Ops | MEDIO | M (4-8h) | P3 - MEDIO |
| 23 | SYS-9 | Sem health monitoring producao | Ops | MEDIO | M (4-8h) | P3 - MEDIO |
| 24 | D-10 | Sem versionamento de dados | Dados | MEDIO | M (4h) | P3 - MEDIO |
| 25 | D-11 | readFileSync sincrono | Performance | MEDIO | P (2h) | P3 - MEDIO |
| 26 | D-14 | Nearest-match expense groups fragil | Dados | MEDIO | M (3h) | P3 - MEDIO |
| 27 | D-15/UX-11 | Sem paginacao no dashboard | Performance/UX | MEDIO | M (4h) | P3 - MEDIO |
| 28 | UX-06 | innerHTML com risco XSS | Seguranca/UX | MEDIO | G (8-12h) | P3 - MEDIO |
| 29 | UX-07 | Sem loading states | UX | MEDIO | P (2h) | P4 - BAIXO |
| 30 | UX-08 | Sem error boundaries | UX | MEDIO | M (4h) | P4 - BAIXO |
| 31 | UX-09 | PWA incompleta | UX | MEDIO | M (4h) | P4 - BAIXO |
| 32 | UX-12 | localStorage como unico storage | UX/Dados | ALTO | G (16-24h) | P3 - MEDIO |
| 33 | UX-17 | Sem undo/redo | UX | MEDIO | G (8h) | P4 - BAIXO |
| 34 | D-20 | Emails pessoais em JSON (LGPD) | Conformidade | MEDIO | P (2h) | P3 - MEDIO |
| 35 | SYS-7 | Dependencias CDN sem versao fixa | Frontend | BAIXO | P (2-4h) | P4 - BAIXO |
| 36 | SYS-10/UX-09 | PWA entregador incompleta | Frontend | BAIXO | G (8-16h) | P4 - BAIXO |
| 37 | D-16 | ARP hardcoded em JSON | Dados | BAIXO | G (8h) | P4 - BAIXO |
| 38 | D-17 | Sem indices/cache para buscas | Performance | BAIXO | P (2h) | P4 - BAIXO |
| 39 | D-18 | Sem rotacao de logs | Ops | BAIXO | P (2h) | P4 - BAIXO |
| 40 | UX-10 | Dados demo hardcoded | UX | BAIXO | P (1h) | P4 - BAIXO |
| 41 | UX-14 | prompt() para credenciais | UX | BAIXO | P (3h) | P4 - BAIXO |
| 42 | UX-15 | Sem animacoes de transicao | UX | BAIXO | P (2h) | P4 - BAIXO |
| 43 | UX-16 | Feedback visual insuficiente | UX | BAIXO | P (2h) | P4 - BAIXO |
| 44 | UX-18 | Emoji como icones | UX | BAIXO | P (2h) | P4 - BAIXO |

### 4.3 Resumo por Prioridade

| Prioridade | Quantidade | Esforco Total Estimado |
|-----------|-----------|----------------------|
| P0 - IMEDIATO | 4 | 10-14h |
| P1 - URGENTE | 6 | 35-47h |
| P2 - ALTO | 7 | 94-162h |
| P3 - MEDIO | 12 | 47-71h |
| P4 - BAIXO | 15 | 50-82h |
| **TOTAL** | **44 debitos** | **236-376h** |

---

## 5. Perguntas para Especialistas

### Para @data-engineer (Dara):

1. **Migracao de storage:** Qual a melhor abordagem para migrar de JSON flat files? SQLite local, Supabase, ou outra opcao? Considerando que o deploy e Netlify (serverless).
2. **Backup strategy:** Qual a melhor estrategia de backup para JSON files no contexto Netlify? Netlify Blobs ja e usado — pode ser a solucao?
3. **Schema validation:** Zod ou JSON Schema? Qual priorizar considerando que o projeto e Vanilla JS sem TypeScript?
4. **Fuzzy match (D-09):** Confirma que o matching por `includes` bidirecional e arriscado? Qual seria a melhor alternativa?
5. **Estimativa de custo (D-13):** A formula `4000 + ((idBudget % 1000) * 17)` e realmente ficticia? Existe uma fonte de dados real para precos de referencia?
6. **LGPD (D-19):** Alem de remover do repo, que medidas adicionais sao necessarias para conformidade LGPD?

### Para @ux-design-expert (Uma):

1. **Design system unificado:** Recomenda manter o tema escuro ou migrar para algo mais neutro? Qual direcao para unificacao?
2. **Framework frontend:** Continuar com Vanilla JS ou migrar para framework leve? Qual o impacto na curva de aprendizado do time?
3. **Acessibilidade:** Qual o nivel minimo de WCAG aceitavel para um sistema educacional publico? WCAG 2.1 AA?
4. **PWA:** Vale investir em PWA completa para o entregador ou considerar React Native/Flutter para app mobile?
5. **Componentizacao:** Web Components nativos ou Lit/Stencil? Qual a melhor abordagem sem framework pesado?
6. **Prioridade UX:** Dos debitos UX-01 a UX-18, quais 5 teriam maior impacto na experiencia do usuario se resolvidos primeiro?

---

*Gerado por @architect (Aria) — Brownfield Discovery Fase 4*
*Pendente validacao de @data-engineer e @ux-design-expert*

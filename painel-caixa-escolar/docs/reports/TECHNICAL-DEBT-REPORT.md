# Relatorio Executivo — Debito Tecnico
## LicitIA / Painel Caixa Escolar MG

**Fase:** Brownfield Discovery — Fase 9
**Agente:** @analyst (Alex)
**Data:** 2026-03-09
**Destinatario:** Stakeholders e Gestao
**Classificacao:** Confidencial

---

## 1. Resumo Executivo

O sistema LicitIA Painel Caixa Escolar MG e a plataforma que automatiza a operacao de fornecimento para caixas escolares de Minas Gerais — coletando oportunidades de orcamento do sistema governamental SGD, sugerindo precos e enviando propostas. O sistema esta **funcional e em producao**, mas apresenta **riscos criticos de seguranca e conformidade legal** que requerem atencao imediata.

Uma avaliacao tecnica completa identificou **55 debitos tecnicos**, dos quais **8 sao criticos** e exigem correcao nas proximas 1-2 semanas. Os principais riscos sao:

1. **Credenciais de escolas publicas expostas no codigo** — senhas de acesso ao sistema governamental estao visiveis no repositorio
2. **Sistema sem autenticacao real** — qualquer pessoa com acesso ao link pode operar o sistema
3. **Risco de envio de precos incorretos ao governo** — o mapeamento de itens usa um metodo impreciso que pode resultar em propostas com valores errados
4. **Nao conformidade com LGPD** — dados pessoais de responsaveis de escolas estao expostos
5. **Nao conformidade com lei de acessibilidade** — sistema educacional publico sem suporte a pessoas com deficiencia

O investimento estimado para resolver todos os debitos e de **R$ 43.500 a R$ 51.000**, distribuido em **12 semanas**. O retorno e a eliminacao de riscos legais, operacionais e reputacionais que podem custar muito mais se nao tratados.

---

## 2. Numeros-Chave

| Indicador | Valor |
|-----------|-------|
| Total de problemas identificados | 55 |
| Problemas criticos (requerem acao imediata) | 8 |
| Problemas altos (requerem acao em 4 semanas) | 16 |
| Horas totais estimadas para correcao | 290-340 horas |
| Custo estimado (R$ 150/hora) | R$ 43.500 - R$ 51.000 |
| Timeline recomendada | 12 semanas (3 meses) |
| Credenciais expostas no codigo | 7+ (senhas de escolas, admin, fornecedor) |
| Cobertura de testes automatizados | 0% |
| Score de acessibilidade estimado | 30-40/100 (meta: 90+) |

---

## 3. Analise de Custo: Corrigir vs. Nao Corrigir

### 3.1 Custo de Correcao

| Fase | Escopo | Horas | Custo |
|------|--------|-------|-------|
| Semana 1 | Seguranca emergencial | 10.5h | R$ 1.575 |
| Semana 2-3 | Integridade de dados | 37h | R$ 5.550 |
| Semana 4-5 | Infraestrutura (CI/CD, testes, design) | 44h | R$ 6.600 |
| Semana 6-7 | Refatoracao frontend | 56h | R$ 8.400 |
| Semana 8-9 | Autenticacao + acessibilidade | 56h | R$ 8.400 |
| Semana 10 | Consolidacao | 28h | R$ 4.200 |
| Semana 11-12 | Finalizacao | 48h | R$ 7.200 |
| **Total** | | **~280h** | **R$ 42.000** |

### 3.2 Custo de NAO Corrigir

| Risco | Probabilidade | Custo Potencial | Base |
|-------|--------------|----------------|------|
| **Multa LGPD** (dados pessoais expostos) | Alta | R$ 50.000 a R$ 50.000.000 | Lei 13.709/2018, Art. 52 — multa de 2% do faturamento ate R$ 50M |
| **Acesso nao autorizado ao SGD** (credenciais expostas) | Alta | Indeterminado | Perda de credenciamento, bloqueio no SGD |
| **Proposta com precos errados ao governo** (fuzzy match) | Media | R$ 10.000 - R$ 100.000 | Irregularidade em licitacao — multa + impedimento |
| **Acao judicial por inacessibilidade** (Lei 13.146) | Media | R$ 5.000 - R$ 50.000 | Estatuto da Pessoa com Deficiencia |
| **Perda de dados operacionais** (sem backup) | Media | R$ 20.000 - R$ 50.000 | Retrabalho + perda de historico de cotacoes |
| **Reputacao + perda de clientes** | Baixa | Inestimavel | Confianca de escolas e governo |
| **Total potencial** | | **R$ 85.000 - R$ 50.250.000** | |

### 3.3 Relacao Custo-Beneficio

```
Custo de correcao:     R$   42.000 (certo)
Custo de NAO corrigir: R$   85.000 a R$ 50.250.000 (probabilistico)

Relacao minima: 1 : 2.0   (melhor caso — "so" o dobro)
Relacao maxima: 1 : 1.196  (pior caso — mais de 1000x)

CONCLUSAO: Investimento se paga na primeira multa evitada.
```

---

## 4. Impacto no Negocio

### 4.1 Performance

| Aspecto | Situacao Atual | Apos Correcao | Impacto |
|---------|---------------|---------------|---------|
| Varredura SGD | 5-10 minutos | < 2 minutos | Mais oportunidades capturadas a tempo |
| Dashboard com muitos dados | Lento (sem paginacao) | Rapido (paginacao) | Melhor experiencia do operador |
| Deploy de atualizacoes | Manual, arriscado | Automatizado com testes | Menor tempo de inatividade |

### 4.2 Seguranca

| Aspecto | Situacao Atual | Apos Correcao | Impacto |
|---------|---------------|---------------|---------|
| Credenciais de escolas | Expostas no codigo | Em vault seguro, criptografadas | Confianca restaurada |
| Autenticacao | Hash no client-side | Server-side com Supabase Auth | Acesso controlado por role |
| APIs | Abertas a qualquer pessoa | Protegidas com token | Operacoes autorizadas apenas |
| Auditoria | Inexistente | Log completo de operacoes | Rastreabilidade total |

### 4.3 Experiencia do Usuario

| Aspecto | Situacao Atual | Apos Correcao | Impacto |
|---------|---------------|---------------|---------|
| Visual | Dois sistemas visuais diferentes | Design unificado, profissional | Percepcao de produto solido |
| Acessibilidade | Inacessivel (score 30/100) | WCAG AA (score 90+) | Inclusao + conformidade legal |
| Navegacao | Paginas desconectadas | Shell unificado com navegacao | Eficiencia operacional |
| App entregador | Nao instalavel | PWA completa | Entregas mais eficientes |

### 4.4 Manutencao

| Aspecto | Situacao Atual | Apos Correcao | Impacto |
|---------|---------------|---------------|---------|
| Codigo frontend | 2546 linhas em 1 arquivo | Modulos de ~300 linhas | Mudancas 3x mais rapidas |
| Testes | 0% cobertura | 60%+ cobertura | Menos regressoes, confianca para evoluir |
| Deploy | Manual, sem verificacao | CI/CD com 6 verificacoes | Deploys seguros e rapidos |
| CSS | 70% duplicado entre paginas | Design tokens compartilhados | Mudancas visuais em 1 lugar |

---

## 5. Timeline Recomendada

### Fase 1: Quick Wins — Seguranca Imediata (Semana 1)

**Custo: R$ 1.575 | Risco eliminado: CRITICO**

- Remover credenciais expostas do repositorio
- Remover senhas hardcoded do codigo
- Corrigir arquivo de exemplo com dados reais

> **Este investimento de R$ 1.575 elimina o risco de multa LGPD (ate R$ 50M)
> e acesso nao autorizado ao SGD governamental.**

### Fase 2: Fundacao — Integridade e Protecao (Semana 2-5)

**Custo: R$ 12.150 | Risco eliminado: ALTO**

- Proteger todas as APIs com autenticacao
- Corrigir mapeamento de precos (evitar envio errado ao SGD)
- Validar todos os dados antes de salvar
- Implementar backup automatico
- Configurar pipeline de qualidade automatizado
- Escrever testes para fluxos criticos

> **Apos esta fase, o sistema estara seguro e testado. Risco de dados corrompidos ou propostas
> erradas eliminado.**

### Fase 3: Otimizacao — Qualidade e Experiencia (Semana 6-12)

**Custo: R$ 28.200 | Beneficio: manutencao, UX, performance**

- Unificar experiencia visual (design system unico)
- Modularizar codigo para manutencao facil
- Implementar acessibilidade (conformidade legal)
- Implementar autenticacao segura com roles
- Otimizar performance e PWA
- Melhorias de usabilidade

> **Apos esta fase, o sistema estara pronto para escalar: mais escolas, mais SREs,
> mais funcionalidades.**

---

## 6. Analise de ROI

### 6.1 ROI por Fase

| Fase | Investimento | Retorno Estimado | ROI | Prazo Retorno |
|------|-------------|-----------------|-----|---------------|
| Quick Wins | R$ 1.575 | Evita multa minima R$ 50.000 | **3.074%** | Imediato |
| Fundacao | R$ 12.150 | Evita perda de dados R$ 20.000 + irregularidade R$ 10.000 | **147%** | 1-3 meses |
| Otimizacao | R$ 28.200 | Reducao 50% tempo manutencao (economiza ~R$ 18.000/ano) | **64%/ano** | 6-12 meses |

### 6.2 ROI Consolidado

```
Investimento total:        R$ 42.000
Retorno ano 1:             R$ 80.000+ (multas evitadas + economia manutencao)
Retorno acumulado 3 anos:  R$ 134.000+ (economia crescente com base solida)

ROI ano 1: 90%+
ROI 3 anos: 219%+
```

### 6.3 Custo de Oportunidade

Sem a correcao, cada **nova funcionalidade** custa **2-3x mais** para implementar devido a:
- Codigo monolitico dificil de modificar
- Sem testes = cada mudanca e arriscada
- CSS duplicado = mudar visual requer editar 7 arquivos
- Sem auth = impossivel adicionar features multi-usuario

---

## 7. Proximos Passos

### Imediato (esta semana)

- [ ] **Aprovar orcamento** para Sprint 0 (Seguranca) — R$ 1.575
- [ ] **Comunicar escolas** sobre rotacao de credenciais (necessario antes de remover do codigo)
- [ ] **Auditar propostas ja enviadas** — verificar se houve mapeamento incorreto de precos
- [ ] **Designar responsavel tecnico** para executar as sprints

### Curto prazo (proximas 2 semanas)

- [ ] **Aprovar orcamento** completo (R$ 42.000) ou fase-a-fase
- [ ] **Definir prioridade** entre Fase 2 (Fundacao) e Fase 3 (Otimizacao) — Recomendacao: ambas, nesta ordem
- [ ] **Criar conta Supabase** para o projeto (free tier e suficiente)
- [ ] **Configurar repositorio GitHub** com branch protection e PR reviews

### Medio prazo (proximo mes)

- [ ] **Iniciar Epic de Debito Tecnico** — stories ja definidas no planejamento
- [ ] **Definir cadencia de sprints** — recomendado: sprints de 2 semanas
- [ ] **Estabelecer metricas de sucesso** — dashboard de qualidade com Lighthouse CI

---

## Apendice — Glossario

| Termo | Significado |
|-------|-----------|
| SGD | Sistema de Gestao Descentralizada — portal governamental de MG para caixas escolares |
| LGPD | Lei Geral de Protecao de Dados (Lei 13.709/2018) |
| WCAG | Web Content Accessibility Guidelines — padrao internacional de acessibilidade web |
| CI/CD | Integracao e Deploy Continuo — automacao de testes e deploy |
| Fuzzy match | Correspondencia aproximada de texto — metodo impreciso de mapeamento |
| Supabase | Plataforma open-source de backend (banco de dados, autenticacao, storage) |
| PWA | Progressive Web App — aplicacao web que pode ser instalada como app nativo |
| ARP | Ata de Registro de Precos — contrato publico com precos registrados |
| SRE | Superintendencia Regional de Ensino |

---

*Gerado por @analyst (Alex) — Brownfield Discovery Fase 9*
*Alex, insights que transformam decisoes*

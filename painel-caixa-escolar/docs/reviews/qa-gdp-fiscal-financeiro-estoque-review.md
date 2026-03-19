# QA Review — GDP Fiscal / Financeiro / Estoque

**Fase:** Pos-licitacao GDP Evolution  
**Agente:** @qa  
**Data:** 2026-03-19  
**Documentos revisados:**
- `docs/strategy/PDR-PRD-LicitIA-MG.md`
- `docs/stories/4.18.story.md`
- `docs/stories/4.19.story.md`
- `docs/stories/4.20.story.md`
- `docs/stories/4.21.story.md`
- `docs/architecture/gdp-fiscal-financeiro-estoque-architecture.md`

---

## 1. Gate Status

### **APROVADO COM RESSALVAS**

O direcionamento esta coerente e executavel, mas ainda exige endurecimento antes de integracao real com SEFAZ e banco.

---

## 2. Findings

| # | Finding | Severidade | Acao Requerida |
|---|---------|-----------|----------------|
| Q-1 | Fluxo fiscal ainda depende de validacao local no frontend | ALTO | Mover validacoes criticas para backend antes de emissao real |
| Q-2 | Persistencia em `localStorage` nao e suficiente para trilha fiscal definitiva | ALTO | Planejar camada server-side para auditoria e nao repudio |
| Q-3 | Conciliação bancaria ainda esta so no modelo, sem contrato de integracao | MEDIO | Definir schema de retorno bancario e reconciliacao |
| Q-4 | Estoque por bipagem pode divergir do estoque fiscal se nao houver regra de prioridade | MEDIO | Definir politica de reconciliacao entre modo fiscal e modo bipagem |
| Q-5 | WhatsApp/e-mail automaticos exigem politica de retentativa e opt-out | MEDIO | Definir regra de automacao e logs de disparo |

### 2.1 Findings da implementacao atual

| # | Finding | Severidade | Evidencia | Acao Requerida |
|---|---------|-----------|----------|----------------|
| I-1 | Emissao de NF, baixa financeira e baixa de contas a pagar ainda ocorrem apenas via acao de UI, sem trilha de operador | MEDIO | `gdp-contratos.html` — handlers `gerarNotaFiscalPedido`, `registrarBaixaRecebimento`, `registrarBaixaContaPagar` | Incluir operador, timestamp expandido e motivo em eventos criticos |
| I-2 | A conciliacao bancaria e criada como `pendente_api_bancaria`, mas nao ha reconciliacao reversa ou erro bancario | MEDIO | `registrarBaixaRecebimento()` | Definir estados `retorno_ok`, `retorno_divergente`, `falha_conciliacao` |
| I-3 | Estoque negativo e apenas exibido no KPI/tabela, sem bloqueio operacional | MEDIO | `renderEstoque()` | Decidir se saldo negativo deve bloquear faturamento ou apenas gerar alerta |
| I-4 | Formas `pix`, `ted` e `incluir` estao modeladas, mas sem campos especificos do instrumento financeiro | BAIXO | modal NF + contas a receber | Definir metadados minimos por forma de cobranca |

---

## 3. Riscos

### 3.1 Riscos Criticos

- Emissao fiscal duplicada para o mesmo pedido
- Baixa financeira sem conciliacao confirmada
- Estoque negativo silencioso em operacao parcial
- Dados fiscais incompletos aceitos na camada de UI

### 3.2 Mitigacoes recomendadas

- Idempotencia por `pedido_id`
- Backend para autorizacao fiscal e bancaria
- Auditoria de estoque por referencia
- Regra de bloqueio para campos fiscais obrigatorios

---

## 4. Testes Requeridos

| Tipo | Cenario |
|------|---------|
| Unitario | Pedido sem CNPJ/endereco nao pode gerar NF |
| Unitario | Pedido com NF existente nao pode gerar segunda NF |
| Integracao | Gerar NF cria conta a receber vinculada |
| Integracao | Autorizar NF atualiza status fiscal e cobranca |
| Integracao | NF gera saida de estoque |
| Integracao | Movimento por bipagem atualiza saldo corretamente |
| E2E | Operador gera NF a partir do pedido |
| E2E | NF aparece na aba `Notas Fiscais` |
| E2E | Conta a receber aparece apos gerar NF |
| E2E | Conta manual a pagar e estoque manual funcionam sem reload |
| E2E | Alterar forma de cobranca na NF sincroniza com conta a receber |
| E2E | Filtros de financeiro e estoque nao quebram os contadores/KPIs |
| E2E | Salvar dados fiscais do pedido e depois gerar NF preserva os campos revisados |

---

## 5. Veredicto

### Aprovado para continuar com `@dev`

A base de produto e arquitetura esta consistente para evolucao incremental no GDP. Antes de producao fiscal/financeira real, o sistema precisa de backend confiavel, auditoria forte e testes automatizados para os fluxos criticos.

---

*Revisado por @qa — qualidade antes de integracao real*

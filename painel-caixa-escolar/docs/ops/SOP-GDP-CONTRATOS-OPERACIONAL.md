# SOP-GDP-002: Operação do Pipeline de Contratos GDP

---

## 1. HEADER & METADATA

| Campo | Valor |
|-------|-------|
| **SOP ID** | SOP-GDP-002 |
| **Título** | Operação do Pipeline de Contratos — Importação, Pedidos e NF-e |
| **Versão** | 1.0.0 |
| **Data efetiva** | 2026-03-18 |
| **Departamento** | GDP — Gestão de Pedidos Pós-Licitação |
| **Área** | Contratos e Faturamento |
| **Autor** | Gerber (SOP Creator) — baseado em SOP-GDP-001 (Ohno) |
| **Revisor** | Pendente |
| **Aprovador** | Pendente |
| **Classificação** | Interno |
| **Próxima revisão** | 2026-06-18 (trimestral) |

---

## 2. PURPOSE

Este SOP garante que todo contrato de licitação importado no sistema GDP resulte em pedidos corretos no Tiny ERP, com SKU, unidade de medida e NCM (Nomenclatura Comum do Mercosul) validados **antes** da emissão de Nota Fiscal eletrônica (NF-e).

Erros nestes campos causam irregularidades fiscais perante a SEFAZ-MG, com risco de autuação conforme Ajuste SINIEF 07/2005 e Manual de Integração NF-e v4.0.

---

## 3. SCOPE

**Em escopo:**
- Importação de Mapas de Apuração (Word, Excel, PDF)
- Criação de contratos com itens ganhos
- Sincronização de produtos com o Tiny ERP
- Criação de pedidos e envio ao Tiny
- Validação de SKU, unidade e NCM antes do envio

**Fora de escopo:**
- Emissão manual de NF-e dentro do Tiny ERP (processo do financeiro)
- Gestão de entregas e provas de entrega
- Cadastro de escolas/clientes (SOP separado)
- Configuração de ambiente Vercel/Supabase (responsabilidade DevOps)

**Aplicabilidade:**
- Operadores GDP com acesso ao dashboard GDP Contratos
- Responsáveis pelo faturamento de licitações de Caixas Escolares

---

## 4. DEFINITIONS & ABBREVIATIONS

| Termo | Definição |
|-------|-----------|
| **ARP** | Ata de Registro de Preços — documento de licitação |
| **Banco de Produtos** | Cache local de produtos sincronizado com o Tiny ERP |
| **GDP** | Gestão de Pedidos — módulo de pós-licitação |
| **Mapa de Apuração** | Documento oficial com resultados da licitação (itens, preços, fornecedor vencedor) |
| **NCM** | Nomenclatura Comum do Mercosul — código de 8 dígitos para classificação fiscal de mercadorias |
| **NF-e** | Nota Fiscal eletrônica — documento fiscal obrigatório para transações comerciais |
| **SEFAZ** | Secretaria de Estado de Fazenda — órgão regulador fiscal |
| **SKU** | Stock Keeping Unit — código numérico que identifica o produto no Tiny ERP |
| **Tiny ERP** | Sistema de gestão empresarial (ERP) usado para cadastro de produtos, pedidos e emissão de NF-e |
| **Unidade** | Unidade de medida do produto (UN, KG, LT, CX, PCT, etc.) |

---

## 5. ROLES & RESPONSIBILITIES (RACI)

| Atividade | Operador GDP | Coordenador GDP | DevOps | Financeiro |
|-----------|:---:|:---:|:---:|:---:|
| Importar Mapa de Apuração | **R** | I | - | - |
| Selecionar fornecedor vencedor | **R** | **A** | - | - |
| Criar contrato | **R** | I | - | - |
| Verificar sincronização com Tiny | **R** | **A** | C | - |
| Corrigir SKU/NCM/unidade divergentes | **R** | C | - | - |
| Criar e enviar pedido ao Tiny | **R** | I | - | I |
| Emitir NF-e no Tiny | - | - | - | **R/A** |
| Resolver erros de API/timeout | C | I | **R/A** | - |

**Escalação:**
- Erros de API persistentes (>15 min) → DevOps
- Divergência de dados contábeis → Coordenador GDP
- Problema fiscal (NF-e rejeitada pela SEFAZ) → Financeiro + Coordenador

---

## 6. PREREQUISITES & MATERIALS

**Antes de iniciar, confirme:**

- [ ] Acesso ao GDP Contratos (URL do dashboard Vercel)
- [ ] Mapa de Apuração disponível (.docx, .xlsx ou .pdf)
- [ ] Token do Tiny ERP configurado (variável `TINY_API_TOKEN` no Vercel)
- [ ] Conexão com internet estável (chamadas à API Tiny)
- [ ] Banco de Produtos atualizado (aba "Banco de Produtos ERP" com importação recente do Tiny)

**Ferramentas necessárias:**
- Navegador web (Chrome, Edge ou Firefox atualizado)
- Acesso ao painel Tiny ERP (para verificação manual quando necessário)

---

## 7. PROCEDURE (STEP-BY-STEP)

### 7.1 — IMPORTAR MAPA DE APURAÇÃO

| Passo | Ação | Duração |
|-------|------|---------|
| 7.1.1 | Acesse o GDP Contratos e selecione a aba **Contratos**. | 10s |
| 7.1.2 | Clique na **zona de upload** (área tracejada) ou arraste o arquivo do Mapa de Apuração. | 10s |
| 7.1.3 | Aguarde o sistema parsear o arquivo. Um **preview** será exibido com a lista de itens e fornecedores. | 5-30s |
| 7.1.4 | **[VERIFY]** Confirme que o número de itens e fornecedores no preview corresponde ao mapa original. | 30s |

### 7.2 — SELECIONAR FORNECEDOR VENCEDOR

| Passo | Ação | Duração |
|-------|------|---------|
| 7.2.1 | No grid de fornecedores, clique no **card do fornecedor vencedor**. O card ficará com borda verde. | 5s |
| 7.2.2 | **[VERIFY]** Confirme na tabela de preview que os itens ganhos estão corretos (descrição, quantidade, preço unitário). | 1-2min |
| 7.2.3 | **[DECISION]** Se os dados estão corretos → prossiga para 7.3. Se há erros → corrija o Mapa original e reimporte (volte a 7.1.2). | - |

### 7.3 — CRIAR CONTRATO

| Passo | Ação | Duração |
|-------|------|---------|
| 7.3.1 | Clique no botão **"Criar Contrato"**. | 5s |
| 7.3.2 | Aguarde a mensagem de confirmação: "Contrato CTR-XXXXXXXX criado com N itens!" | 2s |
| 7.3.3 | O sistema inicia automaticamente o **cadastro no Tiny ERP** em background. Um toast mostrará o progresso. | 30s-5min |
| 7.3.4 | **[VERIFY]** Aguarde a mensagem final: "X/Y itens cadastrados no ERP com SKU". Anote quantos foram cadastrados. | - |
| 7.3.5 | **[CRITICAL]** Se a mensagem diz "Erro ao cadastrar no ERP" → clique no contrato criado e use o botão **"Sync Tiny"** para retentar. | - |

### 7.4 — VERIFICAR SINCRONIZAÇÃO DE PRODUTOS

| Passo | Ação | Duração |
|-------|------|---------|
| 7.4.1 | Clique no contrato recém-criado para abrir os detalhes. | 5s |
| 7.4.2 | **[CRITICAL]** Para cada item, verifique que as 3 colunas estão preenchidas: **SKU**, **Unidade**, **NCM**. | 2-5min |
| 7.4.3 | **[DECISION]** Se algum item tem SKU vazio → clique em "Sync Tiny" no contrato. | - |
| 7.4.4 | **[DECISION]** Se algum item tem unidade "UN" mas deveria ser KG, LT, CX, etc. → acesse a aba **Banco de Produtos ERP** e corrija a unidade do produto correspondente. | - |
| 7.4.5 | **[DECISION]** Se algum item tem NCM vazio → o sistema tentará classificar automaticamente via IA. Se persistir, pesquise o NCM correto no portal SISCOMEX e edite manualmente no banco de produtos. | - |

### 7.5 — CRIAR PEDIDO

| Passo | Ação | Duração |
|-------|------|---------|
| 7.5.1 | Acesse a aba **Pedidos**. | 5s |
| 7.5.2 | Localize o pedido associado ao contrato recém-criado. | 10s |
| 7.5.3 | Marque o checkbox do pedido para selecioná-lo. | 5s |
| 7.5.4 | **[VERIFY]** Antes de enviar, confirme que não há avisos amarelos de "unidade divergente" na lista. | 30s |
| 7.5.5 | Clique no botão **"Enviar ao Tiny"** (ou "Gerar Lista de Compras" para múltiplos pedidos). | 5s |

### 7.6 — ENVIAR PEDIDO AO TINY ERP

| Passo | Ação | Duração |
|-------|------|---------|
| 7.6.1 | Aguarde o processamento. O sistema resolverá SKUs e enviará ao Tiny. | 30s-3min |
| 7.6.2 | **[VERIFY]** Confirme a mensagem de sucesso: "Pedido XXXX enviado ao Olist: TINY-XXXX". | - |
| 7.6.3 | **[DECISION]** Se a mensagem indica erro → veja seção 8 (Error Handling). | - |
| 7.6.4 | **[CRITICAL]** Se a resposta inclui `ncmWarning` → abra o Tiny ERP e corrija o NCM dos itens indicados **antes** de emitir a NF-e. | - |
| 7.6.5 | **[CRITICAL]** Se a resposta inclui `unitWarnings` → abra o Tiny ERP e corrija a unidade dos itens indicados **antes** de emitir a NF-e. | - |

### 7.7 — CONFIRMAR NO TINY ERP

| Passo | Ação | Duração |
|-------|------|---------|
| 7.7.1 | Acesse o painel do Tiny ERP. | 10s |
| 7.7.2 | Localize o pedido recém-criado pelo número retornado na etapa 7.6.2. | 30s |
| 7.7.3 | **[VERIFY]** Confira: cliente correto, itens com SKU válido, unidades corretas, NCM preenchido em todos os itens. | 2-5min |
| 7.7.4 | **[CRITICAL]** Somente após confirmar que TODOS os campos estão corretos, autorize a emissão da NF-e (ou encaminhe ao financeiro). | - |

---

## 8. ERROR HANDLING & TROUBLESHOOTING

### 8.1 — Erros Comuns

| Erro | Sintoma | Ação Imediata | Escalação |
|------|---------|---------------|-----------|
| **"TINY_API_TOKEN nao configurado"** | Pedido falha com erro 500 | Verificar variáveis de ambiente no Vercel | DevOps |
| **"Tiny API (429)"** | Rate limit excedido | Aguardar 2 minutos e retentar | - |
| **Timeout (pedido grande)** | Nenhuma resposta após 60 segundos | Dividir o pedido em lotes menores (max 20 itens) | - |
| **"SKU vazio para item: X"** | Warning no console | Abrir Banco de Produtos → localizar item → preencher SKU | - |
| **Unidade "UN" incorreta** | Toast amarelo no dashboard | Abrir contrato → editar item → corrigir unidade | - |
| **NCM vazio** | `ncmAlerts` na resposta | Pesquisar NCM no SISCOMEX → editar no banco de produtos | - |
| **Produto duplicado no Tiny** | "Codigo ja existe" | Ignorar — produto já está cadastrado | - |

### 8.2 — Rollback

Se um pedido foi enviado com dados incorretos ao Tiny:

1. Acesse o Tiny ERP.
2. Localize o pedido pelo número.
3. **NÃO emita NF-e** com dados incorretos.
4. Cancele o pedido no Tiny.
5. Corrija os dados no GDP (banco de produtos ou contrato).
6. Reenvie o pedido corrigido.

### 8.3 — Escalação

| Situação | Prazo | Contato |
|----------|-------|---------|
| API do Tiny fora do ar >15 min | Imediato | DevOps (@devops) |
| Dados fiscais incorretos em NF-e já emitida | Urgente | Financeiro + Coordenador GDP |
| Dashboard GDP inacessível | 15 min | DevOps — verificar Vercel |
| Supabase offline (dados não sincronizam) | 30 min | DevOps |

---

## 9. QUALITY CONTROLS & METRICS

### 9.1 — Critérios de Sucesso por Pedido

| Critério | Aceitável | Não aceitável |
|----------|-----------|---------------|
| SKU preenchido em todos os itens | 100% | Qualquer item sem SKU |
| Unidade válida (no mapa normalizeUnit) | 100% | Unidade truncada ou desconhecida |
| NCM preenchido | ≥ 95% dos itens | < 95% |
| Pedido aceito pelo Tiny sem erro | Sim | Não |

### 9.2 — KPIs do Pipeline

| KPI | Meta | Como medir |
|-----|------|------------|
| Taxa de acerto de SKU na importação | > 90% | Itens com status "existente" / total |
| Pedidos sem NCM alerts | > 95% | Pedidos sem `ncmWarning` / total |
| Tempo médio importação → pedido | < 15 min | Timestamp de criação vs envio |
| Pedidos rejeitados pelo Tiny | < 5% | Erros / total de envios |

### 9.3 — Verificação Final

Antes de autorizar a NF-e, o operador ou coordenador deve confirmar:

- [ ] Todos os itens têm SKU no Tiny
- [ ] Todas as unidades estão corretas (KG, LT, UN, CX, etc.)
- [ ] Todos os itens têm NCM preenchido
- [ ] Dados do cliente (CNPJ, endereço) estão corretos
- [ ] Valor total do pedido confere com o contrato

---

## 10. REFERENCES & RELATED DOCUMENTS

| Documento | Localização | Notas |
|-----------|------------|-------|
| SOP-GDP-001 (Blueprint técnico) | `docs/ops/SOP-GDP-CONTRATOS-PIPELINE.md` | Referência técnica com código-fonte |
| ADR-001 (Source of Truth) | `docs/architecture/ADR-001-PRODUCT-SOURCE-OF-TRUTH.md` | Decisão: Tiny = master de produtos |
| SOP-INCIDENT-RECOVERY | `docs/ops/SOP-INCIDENT-RECOVERY.md` | Procedimentos P1-P4 de recuperação |
| Story 4.15 (Banco de Produtos) | `docs/stories/4.15.story.md` | Refactoring do banco de produtos |
| Story 4.16 (Sync na criação) | `docs/stories/4.16.story.md` | Modal de sincronização (pendente) |
| Manual NF-e v4.0 | Portal Nacional NF-e | Legislação fiscal aplicável |
| Ajuste SINIEF 07/2005 | CONFAZ | Regulamentação NF-e |
| Portal SISCOMEX NCM | portalunico.siscomex.gov.br | Consulta de códigos NCM |

**Retenção:** Este SOP e registros associados devem ser mantidos por 5 anos conforme exigência fiscal.

---

## 11. REVISION HISTORY

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0.0 | 2026-03-18 | Gerber (SOP Creator) | Criação inicial a partir de SOP-GDP-001 (blueprint técnico do Ohno). Versão operacional com 11 seções FDA/GMP. |

**Próxima revisão programada:** 2026-06-18

**Aprovações pendentes:**
- [ ] Revisor: ___________________ Data: ___/___/______
- [ ] Aprovador: ________________ Data: ___/___/______

---

*Criado por Gerber (SOP Creator) | SOP Factory v1.0 | "Your business is a prototype for 5,000 more just like it."*

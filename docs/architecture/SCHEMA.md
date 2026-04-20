# SCHEMA.md -- Documentacao do Banco de Dados GDP

**Projeto:** Painel Caixa Escolar (GDP - Gestao de Pedidos)
**SGBD:** PostgreSQL via Supabase
**Instancia:** `mvvsjaudhbglxttxaeop.supabase.co`
**Data:** 2026-04-20

---

## 1. Visao Geral do Banco

O banco de dados do GDP e hospedado no **Supabase** (PostgreSQL gerenciado) e serve como fonte unica de dados para o sistema de gestao de pedidos de caixas escolares. A arquitetura segue um modelo **multi-tenant** onde cada empresa fornecedora possui seus dados isolados via `empresa_id`.

### Camadas de Dados

| Camada | Descricao | Tabelas |
|--------|-----------|---------|
| **Operacional** | Tabelas principais do negocio | empresas, clientes, contratos, pedidos, notas_fiscais, contas_receber, contas_pagar, entregas |
| **Controle** | Contadores e sequencias | nf_counter |
| **Analitica** | Dados historicos e resultados | resultados_orcamento, preco_historico |
| **Infraestrutura** | Backup e auditoria | data_snapshots, audit_log |
| **Legacy** | Tabelas de sincronizacao (pre-migracao) | sync_data, nexedu_sync |

### Estrategia de Multi-tenancy

- **Isolamento via coluna:** Todas as tabelas possuem `empresa_id TEXT NOT NULL`
- **RLS (Row Level Security):** Habilitado apenas em `resultados_orcamento` e `preco_historico`
- **Identificacao:** Empresa identificada por `current_setting('app.current_empresa_id', true)`

---

## 2. Diagrama ER

```mermaid
erDiagram
    empresas ||--o{ clientes : "possui"
    empresas ||--o{ contratos : "possui"
    empresas ||--o{ pedidos : "possui"
    empresas ||--o{ notas_fiscais : "possui"
    empresas ||--o{ contas_receber : "possui"
    empresas ||--o{ contas_pagar : "possui"
    empresas ||--o{ entregas : "possui"
    empresas ||--|| nf_counter : "contador"
    empresas ||--o{ resultados_orcamento : "possui"
    empresas ||--o{ preco_historico : "possui"

    contratos ||--o{ pedidos : "gera"
    pedidos ||--o{ notas_fiscais : "fatura"
    pedidos ||--o{ contas_receber : "cobra"
    pedidos ||--o{ entregas : "entrega"
    contratos ||--o{ notas_fiscais : "vincula"

    empresas {
        TEXT id PK
        TEXT nome
        TEXT nome_fantasia
        TEXT razao_social
        TEXT cnpj UK
        TEXT ie
        TEXT crt
        JSONB endereco
        JSONB config_fiscal
        JSONB config_bancaria
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    clientes {
        TEXT id PK
        TEXT empresa_id FK
        TEXT nome
        TEXT cnpj
        TEXT ie
        TEXT uf
        TEXT cep
        TEXT sre
        TEXT email
        TEXT telefone
        JSONB endereco
        TEXT_ARRAY contratos_vinculados
        JSONB dados_extras
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    contratos {
        TEXT id PK
        TEXT empresa_id FK
        TEXT escola
        TEXT processo
        TEXT edital
        TEXT objeto
        TEXT status
        TEXT fornecedor
        JSONB vigencia
        TEXT observacoes
        TEXT data_apuracao
        JSONB itens
        JSONB cliente_snapshot
        JSONB dados_extras
        TIMESTAMPTZ deleted_at
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    pedidos {
        TEXT id PK
        TEXT empresa_id FK
        TEXT contrato_id FK
        TEXT escola
        DATE data
        TEXT status
        NUMERIC valor
        TEXT obs
        JSONB itens
        JSONB fiscal
        JSONB cliente
        JSONB pagamento
        TEXT marcador
        JSONB audit
        JSONB dados_extras
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    notas_fiscais {
        TEXT id PK
        TEXT empresa_id FK
        TEXT pedido_id FK
        TEXT contrato_id FK
        TEXT numero
        TEXT serie
        NUMERIC valor
        TEXT status
        TEXT tipo_nota
        TEXT origem
        TIMESTAMPTZ emitida_em
        DATE vencimento
        JSONB cliente
        JSONB itens
        JSONB sefaz
        JSONB cobranca
        JSONB documentos
        JSONB parametros
        JSONB integracoes
        TEXT xml_autorizado
        TEXT chave_acesso
        TEXT protocolo
        JSONB audit
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    contas_receber {
        TEXT id PK
        TEXT empresa_id FK
        TEXT pedido_id FK
        TEXT origem_id
        TEXT descricao
        NUMERIC valor
        TEXT status
        TEXT forma
        TEXT categoria
        DATE vencimento
        JSONB cliente
        JSONB cobranca
        JSONB automacao
        JSONB audit
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    contas_pagar {
        TEXT id PK
        TEXT empresa_id FK
        TEXT descricao
        NUMERIC valor
        TEXT status
        TEXT forma
        TEXT categoria
        DATE vencimento
        JSONB fornecedor
        JSONB audit
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    entregas {
        TEXT id PK
        TEXT empresa_id FK
        TEXT pedido_id FK
        TEXT escola
        DATE data_entrega
        TEXT status_entrega
        TEXT recebedor
        TEXT obs
        TEXT foto
        TEXT assinatura
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    nf_counter {
        TEXT empresa_id PK_FK
        INTEGER counter
        TIMESTAMPTZ updated_at
    }

    resultados_orcamento {
        TEXT id PK
        TEXT empresa_id FK
        TEXT orcamento_id
        TEXT resultado
        DATE data_resultado
        NUMERIC valor_proposta
        NUMERIC valor_vencedor
        TEXT fornecedor_vencedor
        TEXT motivo_perda
        NUMERIC delta_total_percent
        TEXT escola
        TEXT municipio
        TEXT sre
        TEXT grupo
        TEXT objeto
        TEXT sku
        JSONB itens
        JSONB contrato
        TEXT observacoes
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    preco_historico {
        TEXT id PK
        TEXT empresa_id FK
        TEXT sku
        TEXT escola
        TEXT sre
        TEXT tipo
        NUMERIC valor
        NUMERIC custo_base
        NUMERIC margem_pct
        TEXT fonte
        JSONB metadata
        TIMESTAMPTZ created_at
    }

    data_snapshots {
        BIGSERIAL id PK
        TEXT empresa_id
        TEXT tabela
        JSONB snapshot
        INTEGER registros
        TEXT motivo
        TIMESTAMPTZ created_at
    }

    audit_log {
        BIGSERIAL id PK
        TEXT empresa_id
        TEXT tabela
        TEXT registro_id
        TEXT acao
        JSONB dados_antes
        JSONB dados_depois
        TEXT usuario
        TIMESTAMPTZ created_at
    }
```

---

## 3. Tabelas

### 3.1. `empresas`

**Proposito:** Tabela raiz multi-tenant. Cada empresa fornecedora que opera no sistema.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT gen_random_uuid()::text | Identificador unico |
| nome | TEXT | NOT NULL | Nome de exibicao |
| nome_fantasia | TEXT | | Nome fantasia |
| razao_social | TEXT | | Razao social |
| cnpj | TEXT | UNIQUE NOT NULL | CNPJ da empresa |
| ie | TEXT | | Inscricao estadual |
| crt | TEXT | DEFAULT '1' | Codigo de Regime Tributario |
| endereco | JSONB | DEFAULT '{}' | Endereco completo |
| config_fiscal | JSONB | DEFAULT '{}' | Configuracoes fiscais (cert, SEFAZ) |
| config_bancaria | JSONB | DEFAULT '{}' | Configuracoes bancarias (Asaas, PIX) |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Ultima atualizacao |

**Indices:** Nenhum adicional (PK + UNIQUE em cnpj)
**RLS:** NAO habilitado
**Triggers:** `trg_updated_at` (BEFORE UPDATE)

---

### 3.2. `clientes`

**Proposito:** Escolas e caixas escolares atendidos pela empresa.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | TEXT | PK | Identificador unico |
| empresa_id | TEXT | NOT NULL, FK -> empresas(id) | Tenant |
| nome | TEXT | NOT NULL | Nome da escola/caixa |
| cnpj | TEXT | | CNPJ da escola |
| ie | TEXT | | Inscricao estadual |
| uf | TEXT | DEFAULT 'MG' | Estado |
| cep | TEXT | | CEP |
| sre | TEXT | | Superintendencia Regional de Ensino |
| email | TEXT | | Email de contato |
| telefone | TEXT | | Telefone |
| endereco | JSONB | DEFAULT '{}' | Endereco completo |
| contratos_vinculados | TEXT[] | DEFAULT '{}' | IDs de contratos vinculados |
| dados_extras | JSONB | DEFAULT '{}' | Campos adicionais |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Ultima atualizacao |

**Indices:**
- `idx_clientes_empresa` ON (empresa_id)
- `idx_clientes_cnpj` ON (cnpj)

**RLS:** NAO habilitado
**Triggers:** `trg_updated_at`, `trg_audit`

---

### 3.3. `contratos`

**Proposito:** Contratos ganhos em licitacao publica.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | TEXT | PK | Identificador unico |
| empresa_id | TEXT | NOT NULL, FK -> empresas(id) | Tenant |
| escola | TEXT | NOT NULL | Escola vinculada |
| processo | TEXT | | Numero do processo licitatorio |
| edital | TEXT | | Numero do edital |
| objeto | TEXT | | Objeto do contrato |
| status | TEXT | DEFAULT 'ativo' | Status (ativo, encerrado, etc.) |
| fornecedor | TEXT | | Fornecedor do contrato |
| vigencia | JSONB | DEFAULT '{}' | Datas de inicio/fim |
| observacoes | TEXT | | Observacoes gerais |
| data_apuracao | TEXT | | Data de apuracao |
| itens | JSONB | DEFAULT '[]' | Itens contratados |
| cliente_snapshot | JSONB | DEFAULT '{}' | Copia dos dados do cliente no momento |
| dados_extras | JSONB | DEFAULT '{}' | Campos adicionais |
| deleted_at | TIMESTAMPTZ | | Soft delete |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Ultima atualizacao |

**Indices:**
- `idx_contratos_empresa` ON (empresa_id)
- `idx_contratos_status` ON (status)
- `idx_contratos_escola` ON (escola)

**RLS:** NAO habilitado
**Triggers:** `trg_updated_at`, `trg_audit`

---

### 3.4. `pedidos`

**Proposito:** Pedidos de entrega gerados a partir dos contratos.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | TEXT | PK | Identificador unico |
| empresa_id | TEXT | NOT NULL, FK -> empresas(id) | Tenant |
| contrato_id | TEXT | FK -> contratos(id) | Contrato origem |
| escola | TEXT | NOT NULL | Escola destino |
| data | DATE | | Data do pedido |
| status | TEXT | DEFAULT 'em_aberto' | Status do pedido |
| valor | NUMERIC(12,2) | | Valor total |
| obs | TEXT | | Observacoes |
| itens | JSONB | DEFAULT '[]' | Itens do pedido |
| fiscal | JSONB | DEFAULT '{}' | Dados fiscais vinculados |
| cliente | JSONB | DEFAULT '{}' | Snapshot do cliente |
| pagamento | JSONB | DEFAULT '{}' | Dados de pagamento |
| marcador | TEXT | | Marcador/tag |
| audit | JSONB | DEFAULT '{}' | Trilha de auditoria inline |
| dados_extras | JSONB | DEFAULT '{}' | Campos adicionais |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Ultima atualizacao |

**Indices:**
- `idx_pedidos_empresa` ON (empresa_id)
- `idx_pedidos_status` ON (status)
- `idx_pedidos_contrato` ON (contrato_id)

**RLS:** NAO habilitado
**Triggers:** `trg_updated_at`, `trg_audit`

---

### 3.5. `notas_fiscais`

**Proposito:** NF-e emitidas via SEFAZ. Armazena XML autorizado e chave de acesso.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | TEXT | PK | Identificador unico |
| empresa_id | TEXT | NOT NULL, FK -> empresas(id) | Tenant |
| pedido_id | TEXT | FK -> pedidos(id) | Pedido vinculado |
| contrato_id | TEXT | FK -> contratos(id) | Contrato vinculado |
| numero | TEXT | NOT NULL | Numero da NF |
| serie | TEXT | DEFAULT '1' | Serie da NF |
| valor | NUMERIC(12,2) | | Valor total |
| status | TEXT | DEFAULT 'pendente' | Status (pendente, autorizada, cancelada) |
| tipo_nota | TEXT | DEFAULT 'nfe_real' | Tipo (nfe_real, simulacao, etc.) |
| origem | TEXT | DEFAULT 'pedido' | Origem da NF |
| emitida_em | TIMESTAMPTZ | | Data/hora de emissao |
| vencimento | DATE | | Data de vencimento |
| cliente | JSONB | DEFAULT '{}' | Dados do destinatario |
| itens | JSONB | DEFAULT '[]' | Itens da NF |
| sefaz | JSONB | DEFAULT '{}' | Retorno SEFAZ (status, motivo) |
| cobranca | JSONB | DEFAULT '{}' | Dados de cobranca |
| documentos | JSONB | DEFAULT '{}' | Documentos anexos |
| parametros | JSONB | DEFAULT '{}' | Parametros de emissao |
| integracoes | JSONB | DEFAULT '{}' | Status de integracoes externas |
| xml_autorizado | TEXT | | XML completo retornado pela SEFAZ |
| chave_acesso | TEXT | | 44 digitos - identificador SEFAZ |
| protocolo | TEXT | | Protocolo de autorizacao |
| audit | JSONB | DEFAULT '{}' | Trilha de auditoria inline |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Ultima atualizacao |

**Indices:**
- `idx_nfs_empresa` ON (empresa_id)
- `idx_nfs_numero` ON (numero)
- `idx_nfs_status` ON (status)
- `idx_nfs_chave` ON (chave_acesso)
- `idx_nfs_pedido` ON (pedido_id)

**RLS:** NAO habilitado
**Triggers:** `trg_updated_at`, `trg_audit`

---

### 3.6. `contas_receber`

**Proposito:** Cobrancas geradas a partir das notas fiscais.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | TEXT | PK | Identificador unico |
| empresa_id | TEXT | NOT NULL, FK -> empresas(id) | Tenant |
| pedido_id | TEXT | FK -> pedidos(id) | Pedido origem |
| origem_id | TEXT | | ID da nota/documento de origem |
| descricao | TEXT | | Descricao da cobranca |
| valor | NUMERIC(12,2) | | Valor a receber |
| status | TEXT | DEFAULT 'pendente' | Status (pendente, emitida, recebida) |
| forma | TEXT | | Forma de pagamento |
| categoria | TEXT | | Categoria financeira |
| vencimento | DATE | | Data de vencimento |
| cliente | JSONB | DEFAULT '{}' | Dados do cliente |
| cobranca | JSONB | DEFAULT '{}' | Dados de cobranca (boleto, PIX) |
| automacao | JSONB | DEFAULT '{}' | Configuracao de automacao |
| audit | JSONB | DEFAULT '{}' | Trilha de auditoria inline |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Ultima atualizacao |

**Indices:**
- `idx_cr_empresa` ON (empresa_id)
- `idx_cr_status` ON (status)

**RLS:** NAO habilitado
**Triggers:** `trg_updated_at`, `trg_audit`

---

### 3.7. `contas_pagar`

**Proposito:** Despesas e pagamentos a fornecedores.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | TEXT | PK | Identificador unico |
| empresa_id | TEXT | NOT NULL, FK -> empresas(id) | Tenant |
| descricao | TEXT | | Descricao da conta |
| valor | NUMERIC(12,2) | | Valor a pagar |
| status | TEXT | DEFAULT 'pendente' | Status (pendente, paga, atrasada) |
| forma | TEXT | | Forma de pagamento |
| categoria | TEXT | | Categoria financeira |
| vencimento | DATE | | Data de vencimento |
| fornecedor | JSONB | DEFAULT '{}' | Dados do fornecedor |
| audit | JSONB | DEFAULT '{}' | Trilha de auditoria inline |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Ultima atualizacao |

**Indices:**
- `idx_cp_empresa` ON (empresa_id)

**RLS:** NAO habilitado
**Triggers:** `trg_updated_at`, `trg_audit`

---

### 3.8. `entregas`

**Proposito:** Provas de entrega com foto e assinatura digital.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT gen_random_uuid()::text | Identificador unico |
| empresa_id | TEXT | NOT NULL, FK -> empresas(id) | Tenant |
| pedido_id | TEXT | FK -> pedidos(id) | Pedido entregue |
| escola | TEXT | | Escola destino |
| data_entrega | DATE | | Data efetiva da entrega |
| status_entrega | TEXT | DEFAULT 'pendente' | Status (pendente, entregue, devolvido) |
| recebedor | TEXT | | Nome de quem recebeu |
| obs | TEXT | | Observacoes |
| foto | TEXT | | URL/base64 da foto da entrega |
| assinatura | TEXT | | URL/base64 da assinatura digital |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Ultima atualizacao |

**Indices:**
- `idx_entregas_empresa` ON (empresa_id)
- `idx_entregas_pedido` ON (pedido_id)

**RLS:** NAO habilitado
**Triggers:** `trg_updated_at`, `trg_audit`

---

### 3.9. `nf_counter`

**Proposito:** Sequencia numerica de NF por empresa (evita conflito de numeracao).

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| empresa_id | TEXT | PK, FK -> empresas(id) | Empresa dona do contador |
| counter | INTEGER | DEFAULT 0 | Ultimo numero utilizado |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Ultima atualizacao |

**Indices:** PK
**RLS:** NAO habilitado
**Triggers:** `trg_updated_at`

---

### 3.10. `resultados_orcamento`

**Proposito:** Resultados de orcamentos (ganho/perdido/enviado) do SGD.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT gen_random_uuid()::text | Identificador unico |
| empresa_id | TEXT | NOT NULL, FK -> empresas(id) | Tenant |
| orcamento_id | TEXT | NOT NULL | ID do orcamento no SGD |
| resultado | TEXT | NOT NULL, CHECK IN ('ganho','perdido','enviado') | Resultado |
| data_resultado | DATE | | Data do resultado |
| valor_proposta | NUMERIC(12,2) | | Valor proposto pela empresa |
| valor_vencedor | NUMERIC(12,2) | | Valor do vencedor |
| fornecedor_vencedor | TEXT | | Quem venceu |
| motivo_perda | TEXT | | Motivo da perda |
| delta_total_percent | NUMERIC(5,1) | | Diferenca percentual |
| escola | TEXT | | Escola |
| municipio | TEXT | | Municipio |
| sre | TEXT | | SRE |
| grupo | TEXT | | Grupo/categoria |
| objeto | TEXT | | Objeto do orcamento |
| sku | TEXT | | SKU principal |
| itens | JSONB | DEFAULT '[]' | Itens do orcamento |
| contrato | JSONB | DEFAULT '{}' | Dados do contrato gerado |
| observacoes | TEXT | | Observacoes |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Ultima atualizacao |

**Indices:**
- `idx_resultados_empresa` ON (empresa_id)
- `idx_resultados_resultado` ON (resultado)
- `idx_resultados_orcamento_id` ON (orcamento_id)
- `idx_resultados_escola` ON (escola)
- `idx_resultados_created` ON (created_at DESC)
- `idx_resultados_unique` UNIQUE ON (empresa_id, orcamento_id)

**RLS:** HABILITADO
- Policy `resultados_empresa_policy`: ALL operations filtram por `empresa_id = current_setting('app.current_empresa_id', true)`

**Triggers:** `trg_resultados_updated_at` (usa funcao `set_updated_at`)

---

### 3.11. `preco_historico`

**Proposito:** Historico unificado de precos de todas as fontes (propostas, NFs, contratos).

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT gen_random_uuid()::text | Identificador unico |
| empresa_id | TEXT | NOT NULL, FK -> empresas(id) | Tenant |
| sku | TEXT | NOT NULL | Codigo do produto |
| escola | TEXT | | Escola associada |
| sre | TEXT | | SRE associada |
| tipo | TEXT | NOT NULL, CHECK IN ('proposta','ganho','perdido','contrato','nf_saida','nf_entrada') | Tipo de fonte |
| valor | NUMERIC(12,2) | NOT NULL | Valor unitario |
| custo_base | NUMERIC(12,2) | | Custo base |
| margem_pct | NUMERIC(5,2) | | Margem percentual |
| fonte | TEXT | | Fonte descritiva |
| metadata | JSONB | DEFAULT '{}' | Metadados adicionais |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |

**Indices:**
- `idx_preco_hist_empresa` ON (empresa_id)
- `idx_preco_hist_sku` ON (sku)
- `idx_preco_hist_tipo` ON (tipo)
- `idx_preco_hist_created` ON (created_at DESC)
- `idx_preco_hist_sku_sre` ON (sku, sre)

**RLS:** HABILITADO
- Policy `preco_historico_empresa_policy`: ALL operations filtram por `empresa_id = current_setting('app.current_empresa_id', true)`

**Triggers:** Nenhum (tabela append-only, sem updated_at)

---

### 3.12. `data_snapshots`

**Proposito:** Backup point-in-time de cada tabela (snapshots automaticos).

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | BIGSERIAL | PK | ID sequencial |
| empresa_id | TEXT | NOT NULL | Empresa |
| tabela | TEXT | NOT NULL | Nome da tabela fotografada |
| snapshot | JSONB | NOT NULL | Dados completos |
| registros | INTEGER | DEFAULT 0 | Quantidade de registros |
| motivo | TEXT | DEFAULT 'auto' | Motivo do snapshot |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data do snapshot |

**Indices:**
- `idx_snapshots_empresa` ON (empresa_id, tabela, created_at DESC)

**RLS:** NAO habilitado

---

### 3.13. `audit_log`

**Proposito:** Registro automatico de todas as mudancas (INSERT/UPDATE/DELETE).

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | BIGSERIAL | PK | ID sequencial |
| empresa_id | TEXT | NOT NULL | Empresa |
| tabela | TEXT | NOT NULL | Tabela afetada |
| registro_id | TEXT | | ID do registro |
| acao | TEXT | NOT NULL | INSERT, UPDATE ou DELETE |
| dados_antes | JSONB | | Estado anterior (UPDATE/DELETE) |
| dados_depois | JSONB | | Estado posterior (INSERT/UPDATE) |
| usuario | TEXT | | Usuario que fez a acao |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data da acao |

**Indices:**
- `idx_audit_empresa` ON (empresa_id, tabela, created_at DESC)

**RLS:** NAO habilitado

---

### 3.14. Tabelas Legacy (nao definidas em migracoes, pre-existentes)

#### `sync_data`
Tabela key-value usada como backend antes da normalizacao. Ainda referenciada pelo sistema como fallback.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| user_id | TEXT | Identificador do usuario/empresa |
| key | TEXT | Chave do dado (ex: `gdp.contratos.v1`) |
| data | JSONB | Dados completos |
| updated_at | TIMESTAMPTZ | Ultima atualizacao |

**Constraint:** UNIQUE (user_id, key)

#### `nexedu_sync`
Tabela key-value simples usada pelas serverless functions (Vercel).

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| key | TEXT | Chave unica do dado |
| value | TEXT | Valor serializado como JSON string |

---

## 4. Campos JSONB

### 4.1. `empresas.endereco`
```json
{
  "logradouro": "Rua X",
  "numero": "123",
  "complemento": "",
  "bairro": "Centro",
  "cidade": "Uberaba",
  "uf": "MG",
  "cep": "38000-000"
}
```

### 4.2. `empresas.config_fiscal`
```json
{
  "certificado": "base64...",
  "senha": "****",
  "ambiente": "producao|homologacao",
  "csc": "...",
  "cscId": "..."
}
```

### 4.3. `empresas.config_bancaria`
```json
{
  "asaasApiKey": "...",
  "asaasWalletId": "...",
  "pixChave": "...",
  "pixTipo": "cpf|cnpj|email|celular"
}
```

### 4.4. `clientes.endereco`
```json
{
  "logradouro": "...",
  "numero": "...",
  "bairro": "...",
  "cidade": "...",
  "uf": "MG",
  "cep": "..."
}
```

### 4.5. `clientes.dados_extras`
```json
{
  "telefone": "...",
  "endereco": { ... }
}
```

### 4.6. `contratos.vigencia`
```json
{
  "inicio": "2024-01-15",
  "fim": "2024-12-31",
  "prorrogavel": true
}
```

### 4.7. `contratos.itens`
```json
[
  {
    "id": "item-001",
    "descricao": "Arroz tipo 1 pacote 5kg",
    "sku": "ARROZ-5KG",
    "unidade": "PCT",
    "quantidade": 100,
    "valor_unitario": 25.90,
    "ncm": "10063021"
  }
]
```

### 4.8. `pedidos.itens`
```json
[
  {
    "id": "...",
    "descricao": "...",
    "sku": "...",
    "quantidade": 10,
    "valorUnitario": 25.90,
    "valorTotal": 259.00,
    "unidade": "PCT"
  }
]
```

### 4.9. `pedidos.fiscal`
```json
{
  "notaId": "...",
  "numero": "123",
  "status": "autorizada",
  "chaveAcesso": "..."
}
```

### 4.10. `pedidos.cliente`
```json
{
  "nome": "Caixa Escolar X",
  "cnpj": "12345678000100",
  "endereco": { ... }
}
```

### 4.11. `pedidos.pagamento`
```json
{
  "forma": "boleto",
  "parcelas": 1,
  "vencimento": "2024-03-15",
  "contaReceberId": "..."
}
```

### 4.12. `notas_fiscais.sefaz`
```json
{
  "chaveAcesso": "44 digitos",
  "protocolo": "...",
  "status": "100",
  "motivo": "Autorizado o uso da NF-e",
  "dataAutorizacao": "2024-02-01T10:30:00Z"
}
```

### 4.13. `notas_fiscais.itens`
```json
[
  {
    "descricao": "...",
    "ncm": "...",
    "cfop": "5102",
    "unidade": "UN",
    "quantidade": 10,
    "valorUnitario": 25.90,
    "valorTotal": 259.00,
    "icms": { ... },
    "pis": { ... },
    "cofins": { ... }
  }
]
```

### 4.14. `notas_fiscais.cobranca`
```json
{
  "duplicatas": [
    { "numero": "001", "vencimento": "2024-03-15", "valor": 259.00 }
  ],
  "forma": "boleto"
}
```

### 4.15. `contas_receber.cobranca`
```json
{
  "boletoUrl": "...",
  "pixCopiaECola": "...",
  "asaasPaymentId": "...",
  "status": "PENDING|RECEIVED"
}
```

### 4.16. `contas_receber.automacao`
```json
{
  "autoEmitirBoleto": true,
  "diasAntesFiltro": 5,
  "enviarEmail": true
}
```

### 4.17. `preco_historico.metadata`
```json
{
  "fornecedor": "Distribuidora X",
  "nf_numero": "12345",
  "ncm": "10063021",
  "descricao": "Arroz tipo 1 pct 5kg"
}
```

### 4.18. `resultados_orcamento.itens`
```json
[
  {
    "descricao": "...",
    "quantidade": 100,
    "unidade": "UN",
    "valorProposto": 25.90,
    "valorReferencia": 24.00,
    "delta": 7.9
  }
]
```

### 4.19. `resultados_orcamento.contrato`
```json
{
  "contratoId": "...",
  "processo": "001/2024",
  "escola": "..."
}
```

---

## 5. Funcoes e Triggers

### 5.1. `update_updated_at()`
- **Tipo:** TRIGGER FUNCTION
- **Descricao:** Atualiza `updated_at = now()` automaticamente em BEFORE UPDATE
- **Aplicada em:** empresas, clientes, contratos, pedidos, notas_fiscais, contas_receber, contas_pagar, entregas, nf_counter

### 5.2. `set_updated_at()`
- **Tipo:** TRIGGER FUNCTION (referenciada mas nao definida nas migracoes - provavelmente criada diretamente no Supabase)
- **Aplicada em:** resultados_orcamento

### 5.3. `audit_trigger()`
- **Tipo:** TRIGGER FUNCTION
- **Descricao:** Registra INSERT/UPDATE/DELETE na tabela `audit_log`
- **Aplicada em:** contratos, pedidos, notas_fiscais, clientes, contas_receber, contas_pagar, entregas
- **Usa:** `current_setting('app.current_user', true)` para identificar o usuario

### 5.4. `snapshot_table(p_empresa, p_tabela, p_motivo)`
- **Tipo:** FUNCTION
- **Retorna:** INTEGER (quantidade de registros)
- **Descricao:** Cria snapshot JSON de todos os registros de uma tabela para uma empresa

### 5.5. `snapshot_all(p_empresa, p_motivo)`
- **Tipo:** FUNCTION
- **Retorna:** TABLE(tabela TEXT, registros INTEGER)
- **Descricao:** Cria snapshot de todas as tabelas operacionais

---

## 6. Migracoes

| # | Arquivo | Descricao | Tipo |
|---|---------|-----------|------|
| 001 | `001_gdp_tables.sql` | Criacao de todas as tabelas operacionais (empresas, clientes, contratos, pedidos, notas_fiscais, contas_receber, contas_pagar, entregas, nf_counter), indices, trigger updated_at | DDL |
| 002 | `002_migrate_sync_data.sql` | Migracao de dados do sync_data (key-value) para tabelas normalizadas. Idempotente com ON CONFLICT DO NOTHING | DML |
| 003 | `003_backup_and_audit.sql` | Criacao de data_snapshots, audit_log, funcoes de snapshot e trigger de audit | DDL |
| 004 | `004_resultados_orcamento.sql` | Tabela de resultados de orcamentos SGD com RLS habilitado | DDL |
| 005 | `005_preco_historico.sql` | Tabela de historico de precos unificada com RLS habilitado | DDL |

---

## 7. Tabelas Referenciadas no Codigo (sem migracao formal)

O codigo-fonte referencia tabelas que nao possuem DDL nas migracoes:

| Tabela | Referenciada em | Proposito provavel |
|--------|----------------|--------------------|
| `radar_equivalencias` | radar-matcher.js | Cache de equivalencias de produtos (SKU matching) |
| `sync_data` | 002_migrate_sync_data.sql, gdp-integrations.js, app-sync.js | Tabela legacy key-value |
| `nexedu_sync` | sync-pedidos.js, sync-entregas.js, gdp-integrations.js | Key-value para serverless |

---

*Documento gerado automaticamente por @data-engineer (Dara) - Phase 2 Brownfield Discovery*

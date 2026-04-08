# SOP-RADAR-003: Sistema de Aprendizado — Memória de Vinculações

**Versão:** 1.0
**Status:** Draft
**Módulo:** Radar / Pré-Orçamento
**Pré-requisito:** SOP-RADAR-001, SOP-RADAR-002

---

## 1. OBJETIVO

O sistema deve memorizar toda vinculação feita (automática ou manual) para que descrições semelhantes de escolas diferentes sejam automaticamente resolvidas no futuro. O dicionário cresce com o uso e a taxa de auto-match melhora progressivamente.

## 2. FONTES DE APRENDIZADO

| Fonte | Quando | Confiança |
|-------|--------|-----------|
| **Vinculação manual** (SOP-002) | Usuário confirma no modal | `confirmado: true` |
| **Sugestão aceita** (SOP-001 Camada 2/3) | Usuário clica "Confirmar" na sugestão | `confirmado: true` |
| **Seed dos contratos GDP** | Boot do sistema, 1x | `confirmado: false, origem: "seed-contrato"` |
| **Matching exato repetido** | Auto-match acerta 3x seguidas | Promover para `confirmado: true` |

## 3. ESTRUTURA DO DICIONÁRIO

### Storage

| Camada | Local | Finalidade |
|--------|-------|-----------|
| **Primária** | Supabase tabela `radar_equivalencias` | Fonte de verdade, multi-máquina |
| **Cache** | localStorage `radar.equivalencias.v1` | Performance, offline |

### Schema Supabase

```sql
CREATE TABLE IF NOT EXISTS radar_equivalencias (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  chave_normalizada TEXT NOT NULL,
  sku TEXT NOT NULL,
  nome_banco TEXT NOT NULL,
  confirmado BOOLEAN DEFAULT false,
  origem TEXT DEFAULT 'manual',
  score NUMERIC(3,2),
  vezes_usado INTEGER DEFAULT 1,
  ncm TEXT,
  unidade TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, chave_normalizada)
);

CREATE INDEX IF NOT EXISTS idx_radar_eq_empresa ON radar_equivalencias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_radar_eq_chave ON radar_equivalencias(chave_normalizada);
CREATE INDEX IF NOT EXISTS idx_radar_eq_sku ON radar_equivalencias(sku);
```

### Formato do registro

```json
{
  "id": "eq-abc123",
  "empresa_id": "LARIUCCI",
  "chave_normalizada": "feijao carioquinha tipo 1 pct 1kg",
  "sku": "LICT-0067",
  "nome_banco": "Feijão Carioca",
  "confirmado": true,
  "origem": "manual",
  "score": 1.0,
  "vezes_usado": 7,
  "ncm": "0713.33.19",
  "unidade": "KG"
}
```

## 4. FLUXO DE NORMALIZAÇÃO DA CHAVE

A chave é gerada a partir do nome original do SGD:

```
Input:  "FEIJÃO CARIOQUINHA TIPO 1 PCT 1KG - MARCA BOA"

Passo 1 — Lowercase + remover acentos:
         "feijao carioquinha tipo 1 pct 1kg - marca boa"

Passo 2 — Remover noise words:
         [tipo, pct, marca, de, do, da, com, para, em, c/, un]
         → "feijao carioquinha 1 1kg boa"

Passo 3 — Remover marcas conhecidas (se banco de marcas existir):
         [boa, delta, pacha, kiflor, lunar, bonare, canto de minas]
         → "feijao carioquinha 1 1kg"

Passo 4 — Normalizar gramatura (extrair mas manter):
         "1kg" → manter como token
         → "feijao carioquinha 1 1kg"

Passo 5 — Aplicar sinônimos:
         carioquinha → carioca
         → "feijao carioca 1 1kg"

Passo 6 — Remover números soltos (não colados a unidade):
         "1" → remover
         → "feijao carioca 1kg"

Output: "feijao carioca 1kg"
```

## 5. SEED INICIAL — Extrair dos Contratos GDP

No primeiro boot (ou quando dicionário vazio):

```
Para cada contrato GDP com itens vinculados (skuVinculado existe):
  1. chave = normalizar(item.descricao)  // descrição do contrato
  2. Se chave não existe no dicionário:
     Inserir:
       sku = item.skuVinculado
       nome_banco = item.produtoVinculado
       confirmado = false
       origem = "seed-contrato"
       score = 0.8
       ncm = item.ncm
       unidade = item.unidade
```

**Estimativa:** ~95 equivalências do seed (dos 95 produtos com LICT-xxxx nos contratos)

## 6. CICLO DE VIDA DE UMA EQUIVALÊNCIA

```
                    seed-contrato
                    (confirmado=false)
                          │
                    ┌─────┴─────┐
                    │ Auto-match │
                    │ funciona?  │
                    └─────┬─────┘
                   SIM    │    NÃO
                    │     │     │
              vezes_usado++ │  (mantém false)
                    │     │
              3x acertou? │
                    │     │
               SIM  │     │
                    ▼     │
              confirmado=true
                          │
                    ┌─────┴─────┐
                    │  Usuário   │
                    │  confirma  │
                    │  ou corrige│
                    └─────┬─────┘
                          │
                    confirmado=true
                    origem="manual"
```

## 7. CONFLITO E CORREÇÃO

| Situação | Ação |
|----------|------|
| Mesmo item SGD, duas sugestões diferentes | Mostrar ambas, usuário escolhe, a outra é descartada |
| Usuário corrige uma equivalência existente | Atualizar sku + nome_banco, manter histórico |
| Produto removido do banco de preços | Marcar equivalência como `sku_invalido`, não excluir |
| Duas chaves normalizadas diferentes apontam pro mesmo SKU | OK — normal, múltiplas descrições → mesmo produto |

## 8. SINCRONIZAÇÃO

```
Boot do sistema:
  1. Carregar radar_equivalencias do Supabase
  2. Cachear em localStorage
  3. Se tabela vazia → executar seed dos contratos GDP

Após vinculação:
  1. Salvar no Supabase (fonte primária)
  2. Atualizar localStorage (cache)
  
Após varredura SGD:
  1. Para cada item matchado, incrementar vezes_usado
  2. Promover para confirmado=true se vezes_usado >= 3
```

## 9. MÉTRICAS DE APRENDIZADO

| Métrica | Como medir | Meta |
|---------|-----------|------|
| Tamanho do dicionário | COUNT(*) radar_equivalencias | Crescer 10%/semana |
| % confirmadas | confirmado=true / total | > 70% após 60 dias |
| Taxa de re-uso | AVG(vezes_usado) | > 3 |
| Falsos positivos | Correções manuais / auto-matches | < 5% |

## 10. INTEGRAÇÃO COM OUTROS MÓDULOS

| Módulo | Integração | Direção |
|--------|-----------|---------|
| **Radar** | Usa dicionário no matching | Leitura |
| **Pré-Orçamento** | Alimenta dicionário com vínculos | Escrita |
| **Banco de Preços** | Consulta custoBase/margem | Leitura |
| **Contratos GDP** | Seed inicial de equivalências | Leitura (1x) |
| **Intel Preços** | KPIs de matching melhoram | Leitura indireta |

---

**Autor:** Deming (SOP Factory)
**Pipeline:** SOP-RADAR-001 → SOP-RADAR-002 → SOP-RADAR-003
**Próximo passo:** Rotear para @dev implementar os 3 SOPs como código

# SOP-RADAR-001: Matching Automático de Itens SGD → Banco de Preços

**Versão:** 1.0
**Status:** Draft
**Módulo:** Radar / Pré-Orçamento
**Escopo:** ISOLADO do GDP — não altera contratos, NFs ou pedidos

---

## 1. OBJETIVO

Quando um orçamento do SGD é convertido em pré-orçamento, cada item deve ser automaticamente vinculado ao produto correspondente no Banco de Preços para que o preço sugerido já venha preenchido.

## 2. TRIGGER

- Usuário clica "Gerar Pré-Orçamento" em um ou mais orçamentos do Radar

## 3. DADOS DE ENTRADA

| Campo | Origem | Exemplo |
|-------|--------|---------|
| `item.nome` | SGD (escola) | "FEIJÃO CARIOQUINHA TIPO 1 PCT 1KG" |
| `item.descricao` | SGD (escola) | "Feijão tipo carioca, pacote de 1kg" |
| `item.unidade` | SGD | "Quilograma" |
| `item.quantidade` | SGD | 300 |

## 4. FLUXO DE MATCHING (3 camadas, em ordem)

### Camada 1 — Dicionário de Equivalências Radar (match exato)

```
Entrada: normalizar(item.nome) → chave
Busca:   radar_equivalencias[chave]
         Se encontrou E confirmado === true → MATCH DIRETO
         Retorna: { sku, nomeBanco, custoBase, margem }
```

**Storage:** `radar.equivalencias.v1` (localStorage) + tabela `radar_equivalencias` (Supabase)

**Formato do dicionário:**
```json
{
  "feijao carioquinha tipo 1 pct 1kg": {
    "sku": "LICT-0067",
    "nomeBanco": "Feijão Carioca",
    "confirmado": true,
    "criadoEm": "2026-04-08",
    "origem": "manual"
  }
}
```

### Camada 2 — Seed dos Contratos GDP (match por SKU existente)

Se Camada 1 não encontrou:
```
1. Buscar nos contratos GDP todos os itens que têm skuVinculado (LICT-xxxx)
2. Para cada item do contrato:
   a. Normalizar descricao do contrato
   b. Calcular similaridade com item.nome do SGD (Jaccard token ≥ 0.6)
3. Se match ≥ 0.6 → SUGESTÃO (não confirmada)
   Retorna: { sku, nomeBanco, score, sugestao: true }
```

**Dados disponíveis nos contratos:**
| Campo contrato | Uso |
|---------------|-----|
| `descricao` | "Feijao Carioca Da Casa" → tokenizar e comparar |
| `skuVinculado` | "LICT-0067" → link pro banco |
| `produtoVinculado` | "Feijão Carioca" → nome normalizado |
| `ncm` | "0713.33.19" → validar categoria |
| `unidade` | "KG" → validar compatibilidade |

### Camada 3 — Fuzzy Match no Banco de Preços

Se Camada 2 não encontrou:
```
1. Tokenizar item.nome → remover noise words
2. Buscar no Banco de Preços por overlap de tokens
3. Se score ≥ 0.5 → SUGESTÃO FRACA
4. Se score < 0.5 → SEM MATCH → item fica com preço R$ 0
```

**Noise words a remover:** TIPO, PCT, C/, UN, KG, GR, ML, LT, MARCA, DE, DO, DA, COM, PARA, EM, QUALIDADE, PRIMEIRA, SEGUNDA, PACOTE

**Sinônimos a normalizar:**
| Variante | Normalizado |
|----------|-------------|
| CARIOQUINHA, CARIOCA | carioca |
| PARBOILIZADO, PARBOLIZADO | parboilizado |
| MUSSARELA, MUÇARELA, MUZZARELA | mussarela |
| EXTRATO, EXTR | extrato |
| MACARRAO, MACARRÃO | macarrao |

## 5. DADOS DE SAÍDA

Para cada item do pré-orçamento:

| Campo | Valor | Origem |
|-------|-------|--------|
| `matchStatus` | "exato" / "sugestao" / "sem_match" | Camada que encontrou |
| `matchScore` | 0.0 a 1.0 | Similaridade calculada |
| `skuBanco` | "LICT-0067" ou null | SKU do banco de preços |
| `nomeBanco` | "Feijão Carioca" ou null | Nome normalizado |
| `custoBase` | 6.20 ou 0 | Do banco de preços |
| `margemPadrao` | 0.30 | Do banco de preços |
| `precoSugerido` | 8.06 ou 0 | custoBase * (1 + margem) |

## 6. INDICADORES VISUAIS NO PRÉ-ORÇAMENTO

| matchStatus | Badge | Cor | Ação |
|-------------|-------|-----|------|
| `exato` | "Vinculado" | Verde | Preço preenchido, sem ação necessária |
| `sugestao` | "Sugestão: Feijão Carioca?" | Amarelo | Botão Confirmar / Corrigir |
| `sem_match` | "Sem vínculo" | Vermelho | Botão "Vincular ao Banco" |

## 7. REGRAS DE NEGÓCIO

1. **NUNCA alterar dados do GDP** — este módulo é read-only nos contratos
2. **NUNCA alterar o Banco de Preços** automaticamente — só ler custoBase/margem
3. **SEMPRE salvar equivalência** quando usuário confirma sugestão ou vincula manualmente
4. **Gramatura é informativa** — extrair "1KG", "500g", "900ml" do nome e exibir, mas não usar como critério de match (mesmo produto pode ter gramaturas diferentes entre escolas)
5. **NCM como validação** — se contrato e SGD têm NCM, comparar pra evitar falsos positivos (feijão ≠ feijão verde)

## 8. PERFORMANCE

- Dicionário radar_equivalencias: cache em memória no boot
- Seed dos contratos: executar 1x no boot, cachear resultado
- Fuzzy match: máximo 50ms por item (tokenização é O(n))
- Total pré-orçamento 30 itens: < 2 segundos

---

**Autor:** Deming (SOP Factory) | **Solicitante:** @analyst (Atlas)
**Próximo:** SOP-RADAR-002 (Vinculação Manual)

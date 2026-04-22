# Epic 10 — Intel Preços v2

| Campo | Valor |
|-------|-------|
| **Status** | InProgress |
| **Data** | 2026-04-22 |
| **Origem** | Briefing @analyst (Atlas) |
| **Objetivo** | Reestruturar módulo Intel Preços: simplificar abas, revisão de unidades, central de preços integrada, margem global |

## Contexto

O SGD do estado evoluiu — agora mostra escola, cidade, filtros de status, e publica mapa de preços com unidade. O sistema precisa acompanhar essa evolução.

## Stories

| Story | Título | Prioridade | Status |
|-------|--------|-----------|--------|
| 10.1 | Reestruturar abas Intel Preços (4+1 abas) | Alta | Ready |
| 10.2 | Aba Revisão de Unidades | Alta | Ready |
| 10.3 | Aba Central de Preços (atalho) | Alta | Ready |
| 10.4 | Filtro por data + coluna cidade no Pré-Orçamento | Média | Ready |
| 10.5 | Histórico melhorado (fundido com Aprovados) | Média | Ready |
| 10.6 | Margem global + alertas de desvio | Alta | Ready |

## Navegação Resultante

```
Intel Preços (tabs):
  1. Pré-Orçamento (+ cidade, + filtro data, + margem global, + alertas)
  2. Enviados ao SGD
  3. Histórico (fundido: contratos + ganhos/perdidos + série temporal)
  4. Central de Preços (atalho para mesma fonte gdp.produtos.v1)
  5. Revisão de Unidades (validar unidade+descrição antes de cotar)
```

## Fluxo Operacional

```
Orçamento chega do SGD
    ↓
Revisão de Unidades (confirmar unidade + descrição)
    ↓
Pré-Orçamento (margem global + alertas + cidade)
    ↓
Enviados ao SGD
    ↓
Histórico (resultado + contratos + série temporal)
```

# ADR-001: Numeração Sequencial de NF-e — Peek vs Consumir

## Status: Aceita
## Data: 2026-05-19
## Autor: @architect (Aria), @fiscal-chief

## Contexto

A numeração de NF-e (Nota Fiscal Eletrônica) deve ser sequencial e sem buracos, conforme exigência SEFAZ. O sistema GDP tinha um problema recorrente: a numeração **pulava de 2 em 2** porque a mesma função `getProximoNumeroNf()` era chamada tanto na geração (preview) quanto na retransmissão, consumindo o número duas vezes.

### Problema original

```
Gerar NF pedido A → getProximoNumeroNf() → consome 1433, config vira 1434
NF rejeitada pela SEFAZ (NCM inválido, por exemplo)
Retransmitir NF → getProximoNumeroNf() → consome 1434, config vira 1435
NF transmitida como 1434 → PULOU 1433
```

### Tentativas anteriores (falharam)

1. **Supabase RPC `next_nf_number`** — RPC não existia no banco (404)
2. **Config `proximoNumero` na UI** — Desconectado do fluxo de emissão
3. **Fallback local `gdp.nf-counter`** — Inconsistente entre máquinas

## Decisão

Separar em 3 funções com responsabilidades distintas:

### Arquitetura final

```
peekProximoNumeroNf()
├── Retorna número SEM incrementar
├── Auto-detecta max(NFs existentes) + 1 se não configurado
└── Usado internamente por consumir

consumirProximoNumeroNf()
├── Chama peek → pega número
├── INCREMENTA proximoNumero na config
├── Salva em localStorage + Supabase nf_counter
└── Usado SOMENTE quando NF PRECISA de número novo

getProximoNumeroNf()
├── Alias para consumirProximoNumeroNf()
└── Chamado na GERAÇÃO de nova NF (linha 835)
```

### Regra de ouro

| Cenário | Função | Consome? |
|---------|--------|----------|
| Gerar NF nova para pedido | `getProximoNumeroNf()` | SIM — NF nova precisa de número novo |
| Retransmitir NF rejeitada | `nf.numero` (já atribuído) | NÃO — reutiliza número existente |
| Exibir próximo número na UI | `peekProximoNumeroNf()` | NÃO — apenas leitura |

### Fluxo correto

```
Geração: getProximoNumeroNf() → consome 1433, config vira 1434
    ↓
NF criada com numero=1433
    ↓
Rejeição SEFAZ (ex: NCM inválido)
    ↓
Usuário corrige NCM na tela da NF
    ↓
Retransmissão: nf.numero já é "1433" → NÃO consome → reutiliza
    ↓
SEFAZ aceita → NF 1433 autorizada
    ↓
Próxima NF: getProximoNumeroNf() → consome 1434
```

## Fonte de verdade

| Dado | Localização | Formato |
|------|-------------|---------|
| Próximo número | `localStorage["nexedu.config.notas-fiscais"].proximoNumero` | String numérica |
| Counter backup | `localStorage["gdp.nf-counter"]` | String numérica |
| Supabase sync | `nf_counter` tabela, campo `ultimo_numero` | Integer |

## Consequências

### Positivas
- Numeração sequencial garantida (sem pulos)
- Retransmissão de NF rejeitada não consome número
- Config do usuário respeitada como fonte primária
- Auto-detecção quando não configurado (max existente + 1)

### Negativas
- Depende de localStorage (se limpar, perde o counter — mitigado por auto-detecção)
- Supabase sync é fire-and-forget (pode dessincronizar — mitigado por auto-detecção local)

### Buracos existentes
- 1430: nunca emitida (pode inutilizar na SEFAZ ou usar manualmente)

## Arquivos afetados

| Arquivo | Funções |
|---------|---------|
| `js/gdp-notas-fiscais.js` | `peekProximoNumeroNf()`, `consumirProximoNumeroNf()`, `getProximoNumeroNf()`, `transmitirHomologacaoNota()` |
| `app-config.js` | `saveNotaFiscalConfig()` (preserva proximoNumero) |

## Referências

- SEFAZ MG: Numeração NF-e deve ser sequencial por série
- Manual de Integração NF-e v4.01: Campo nNF (1-999999999)
- Inutilização: Evento para declarar faixa de números não utilizados

---
*ADR documentada por @architect (Aria) — 2026-05-19*
*Validada por @fiscal-chief*

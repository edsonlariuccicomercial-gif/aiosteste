# Squad: Caixa Escolar MG

**ID:** caixa-escolar
**Version:** 1.0.0
**Created:** 2026-03-03
**Status:** Active

---

## MISSAO

Facilitar o trabalho de fornecedores no Sistema de Gestao Descentralizada (SGD) da SEE-MG, resolvendo os gaps criticos do portal oficial e automatizando o processo de triagem e envio de cotacoes para caixas escolares de Minas Gerais.

## CONTEXTO

A Secretaria de Educacao de MG implementou o portal SGD (caixaescolar.educacao.mg.gov.br) para compras descentralizadas das ~3.600 escolas estaduais. O sistema permite que escolas publiquem orcamentos e fornecedores enviem cotacoes.

**O problema:** O portal e funcional mas tem gaps criticos que dificultam o trabalho dos fornecedores:
- 10.300+ orcamentos sem filtro por SRE
- Sem resumo do objeto na listagem
- Sem cidade/SRE visivel
- Navegacao item-a-item inviavel no volume

**A solucao:** Este squad cria uma camada de inteligencia sobre o portal, com agentes especializados que triagem, classificam, resumem e facilitam o envio de cotacoes.

## AGENTES

| Agente | Role | Responsabilidade |
|--------|------|-----------------|
| **@ce-chief** | Orchestrator | Coordena o squad, prioriza orcamentos, gerencia pipeline |
| **@mapeador-sre** | Specialist | Mapeamento Escola → Municipio → SRE |
| **@analista-cotacoes** | Specialist | Analise de orcamentos, resumo do objeto, viabilidade |
| **@monitor-sgd** | Specialist | Monitoramento do portal, alertas, varredura |
| **@gerador-propostas** | Specialist | Geracao de propostas formatadas para envio |

## ARQUITETURA

```
           ┌──────────────┐
           │  @ce-chief   │ ← Orquestrador
           └──────┬───────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
    ▼             ▼             ▼
┌─────────┐ ┌──────────┐ ┌──────────────┐
│@mapeador │ │@analista │ │  @monitor    │
│  -sre   │ │-cotacoes │ │   -sgd       │
└─────────┘ └──────────┘ └──────────────┘
                  │
                  ▼
          ┌──────────────┐
          │  @gerador    │
          │ -propostas   │
          └──────────────┘
```

## FLUXO PRINCIPAL

```
1. @monitor-sgd varre o portal SGD
2. @mapeador-sre classifica escolas por SRE
3. @analista-cotacoes resume e avalia orcamentos
4. @ce-chief prioriza e apresenta ao fornecedor
5. Fornecedor decide quais cotar
6. @gerador-propostas monta a proposta
7. Fornecedor revisa e envia no portal
```

## DADOS

| Arquivo | Conteudo |
|---------|----------|
| `data/sre-municipios.json` | Mapeamento SRE → Municipios |
| `data/escolas-mg.json` | Base de escolas estaduais |
| `data/grupos-despesa.json` | 23 Grupos de Despesa com detalhes |
| `data/snapshots/` | Snapshots de orcamentos por data |
| `docs/sistema-sgd-analise.md` | Analise completa do portal SGD |

## GAPS RESOLVIDOS POR ESTE SQUAD

| Gap do SGD | Agente que Resolve | Como |
|------------|-------------------|------|
| Sem SRE | @mapeador-sre | Base Escola→Municipio→SRE |
| Sem resumo do objeto | @analista-cotacoes | Extrai e resume automaticamente |
| Sem cidade na listagem | @mapeador-sre | Adiciona municipio ao contexto |
| Volume ingerenciavel | @monitor-sgd + @ce-chief | Filtro inteligente + priorizacao |
| Sem alertas | @monitor-sgd | Sistema de alertas por SRE/Grupo |
| Cotacao manual | @gerador-propostas | Montagem automatizada de propostas |

## PORTAL SGD — REFERENCIA RAPIDA

- **URL:** https://caixaescolar.educacao.mg.gov.br
- **Login:** Selecionar Perfil → Fornecedor → CNPJ + Senha
- **Orcamentos:** /compras/orcamentos
- **Volume:** ~10.300 orcamentos (206 paginas)
- **Filtros:** Municipio, Escola, Grupo Despesa, Ano, Status
- **Status PAF:** Nao Enviada, Enviada, Aprovada, Recusada, Prazo Encerrado

---

*Squad Caixa Escolar MG v1.0.0 — Criado pelo Process Forge*

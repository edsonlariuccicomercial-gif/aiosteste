# Epic 3 — NexEdu Layout e Navegacao

**Produto:** LicitIA MG (NexEdu)
**Prioridade:** Alta
**Estimativa Total:** ~40 horas

---

## Objetivo

Reestruturar o layout do sistema para uma arquitetura de navegacao modular com sidebar fixa, branding NexEdu e dashboard contextual. Substituir a navegacao plana (tabs horizontais) por um sistema hierarquico de 3 modulos: Radar, Inteligencia de Precos e GDP.

## Escopo

### Modulos

| Modulo | Abas/Paginas | Descricao |
|--------|-------------|-----------|
| **Radar** | Orcamentos | Monitoramento de oportunidades de licitacao |
| **Inteligencia de Precos** | Pre-Orcamento, Banco de Precos, SGD | Gestao de precos e envio ao SGD |
| **GDP** | Dashboard, Portal, Contratos, Gestao, Entregador | Gestao pos-licitacao (manter estrutura atual) |

### Layout Principal

- **Sidebar esquerda** (fixa): Logo NexEdu + 3 modulos + engrenagem (configuracoes)
- **Area principal direita**: Dashboard + conteudo do modulo ativo
- **Configuracoes**: Dados da empresa + Cadastro de usuarios

## Stories

- **3.1** — Sidebar de Navegacao e Layout Principal NexEdu
- *(futuras stories para configuracoes, responsividade, etc.)*

## Criterios de Sucesso

- Navegacao intuitiva entre modulos
- Dashboard sempre visivel na area principal
- Transicao suave entre abas dentro de cada modulo
- Layout responsivo (sidebar collapsa em mobile)
- Branding NexEdu consistente

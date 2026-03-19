# Analise do Sistema SGD - Caixa Escolar MG

## Visao Geral

**Portal:** https://caixaescolar.educacao.mg.gov.br
**Nome:** SGD - Sistema de Gestao Descentralizada
**Orgao:** Secretaria de Estado de Educacao de Minas Gerais (SEE-MG)
**Proposito:** Plataforma unificada para planejamento, uso e monitoramento dos recursos descentralizados para escolas da rede estadual

## Perfis de Acesso

| Perfil | Descricao |
|--------|-----------|
| **Fornecedor** | Empresas que enviam cotacoes/propostas para caixas escolares |
| **Escola** | Caixas escolares das escolas estaduais |
| **Secretaria de Educacao** | Gestores da SEE-MG |

## Estrutura do Sistema (Perfil Fornecedor)

### Menu Principal
```
Inicio → Dashboard com Acesso Rapido
Fornecedor → Situacao de Cadastro
Compras → Orcamento
```

### Pagina de Orcamentos (/compras/orcamentos)

**Filtros disponiveis:**
- Municipios (dropdown ~853 municipios MG)
- Escola (campo texto livre)
- Grupo de Despesa (23 categorias)
- Ano (dependente de municipio selecionado)
- Status do PAF (5 opcoes)

**Colunas da tabela:**
- ID do Orcamento
- Ano
- Escola
- Prazo Proposta
- Status
- Acoes (Excluir, Editar, Visualizar)

**Volume:** ~10.300 orcamentos (206 paginas x 50 itens)
**IDs:** 2025000001 ate 2026009613+

### Status do PAF (Proposta)

| Status | Significado |
|--------|------------|
| Nao Enviada | Orcamento aberto, aguardando proposta do fornecedor |
| Enviada | Proposta enviada pelo fornecedor |
| Aprovada | Proposta aprovada pela escola |
| Recusada | Proposta recusada |
| Prazo Encerrado | Prazo de envio expirou |

### Status do Orcamento (na visualizacao)

| Status | Significado |
|--------|------------|
| Envio de Propostas | Orcamento ativo recebendo propostas |
| Cancelado | Orcamento cancelado pela escola |
| Prazo Encerrado | Prazo expirado |
| Finalizado | Processo concluido |

### Detalhe do Orcamento (Modal)

Campos disponiveis:
- Prazo de Entrega/Execucao
- Prazo de Envio de Propostas
- Ano
- Status
- **Sub-Programa** (ex: Manutencao Escolar e Desenvolvimento do Ensino 2026)
- **Iniciativa** (descricao do objeto - ex: Aquisicao de ventiladores para salas de aula)
- **Grupo de Despesas** (categoria)
- Participantes Aptos (PF e PJ ou so PJ)

**Lista de Itens Solicitados:**
- Item (nome)
- Descricao (detalhamento)
- Categoria (Custeio ou Capital)
- Unidade
- Quantidade
- Garantia Solicitada (quando aplicavel)

**Acoes:** Cancelar / Cadastrar Proposta

### 23 Grupos de Despesa

1. Servico de Transporte Continuo
2. Capacitacao e Formacao para Profissionais da Educacao
3. Projetos Pedagogicos e Atividades Educacionais
4. Servicos Operacionais Continuos
5. Obras
6. Manutencao e Reformas
7. Utensilios de Cozinha
8. Generos Alimenticios
9. Material Pedagogico
10. Material Pedagogico de Seguranca
11. Gas recarga
12. Regularizacao de Conselho
13. Material de Consumo Geral
14. Material Pedagogico Musical
15. Mobiliarios de Cozinha
16. Mobiliarios Administrativos
17. Equipamentos Tecnologicos
18. Premio SAEB
19. Climatizacao
20. Equipamentos de Cozinha
21. Conservacao e pequenos reparos
22. Equipamentos de Seguranca
23. Equipamentos Pedagogicos

### Cadastro do Fornecedor (/fornecedor/complemento-cadastro)

**5 abas:**
1. Rede de Cadastro (UF, Nome da Rede)
2. Representante Legal (Nome, CPF)
3. Pessoa Juridica (Razao Social, CNPJ, Endereco, CNAE, Banco)
4. Socios
5. Documentos

**Status:** Vinculado → Aprovado (3 etapas: Cadastro → Analise → Resultado)

---

## GAPS E DORES DO SISTEMA ATUAL

### GAP 1: Sem Classificacao por SRE (CRITICO)

**Problema:** O dropdown de Municipios lista ~853 cidades de MG em ordem alfabetica, sem nenhuma agrupacao por SRE (Superintendencia Regional de Ensino).

**Impacto:** Fornecedor que atende uma regiao especifica (ex: SRE Uberlandia) nao consegue filtrar rapidamente. Precisa saber de cor quais cidades pertencem a qual SRE.

**Solucao proposta:** Base de dados Escola → Municipio → SRE com filtro hierarquico.

### GAP 2: Sem Resumo do Objeto na Listagem (CRITICO)

**Problema:** A tabela de orcamentos mostra apenas: ID, Ano, Nome da Escola, Prazo, Status. NAO mostra o que esta sendo comprado (Grupo de Despesa, Iniciativa, Itens).

**Impacto:** Fornecedor precisa clicar "Visualizar" em cada um dos 10.300+ orcamentos para descobrir o que pedem. Totalmente inviavel para triagem.

**Solucao proposta:** Adicionar coluna "Objeto" com resumo (Grupo de Despesa + primeiro item) na listagem.

### GAP 3: Sem Cidade na Listagem (ALTO)

**Problema:** Listagem mostra so nome da escola. Fornecedor nao sabe em qual cidade a escola fica.

**Impacto:** Impossivel avaliar se a escola esta na area de atendimento sem pesquisar externamente.

**Solucao proposta:** Adicionar coluna Municipio/SRE na tabela.

### GAP 4: Sem Filtro por SRE (ALTO)

**Problema:** Nao existe opcao de filtrar por SRE, apenas por municipio individual.

**Impacto:** Fornecedor que atende toda uma SRE precisaria selecionar dezenas de municipios um por um.

### GAP 5: Volume Massivo sem Triagem Inteligente (MEDIO)

**Problema:** 10.300+ orcamentos sem forma rapida de encontrar os relevantes (abertos + na minha regiao + no meu ramo).

**Impacto:** Perda de oportunidades por nao conseguir processar o volume.

### GAP 6: Filtro de Ano Dependente de Municipio (BAIXO)

**Problema:** Dropdown de Ano so carrega apos selecionar Municipio.

**Impacto:** Nao e possivel filtrar globalmente por ano.

### GAP 7: Sem Exportacao/Consolidacao (MEDIO)

**Problema:** Nao tem como exportar dados, gerar relatorios ou consolidar cotacoes.

### GAP 8: Sem Dashboard/Metricas (MEDIO)

**Problema:** Nao tem dashboard com visao geral, alertas de novos orcamentos, metricas de desempenho.

---

## OPORTUNIDADES PARA O SQUAD

1. **Painel Inteligente de Cotacoes** — Dashboard que agrupa orcamentos por SRE, Grupo de Despesa e Status, com resumo do objeto visivel
2. **Classificador Escola-Municipio-SRE** — Base de dados mapeando toda a rede estadual
3. **Alerta de Novos Orcamentos** — Notificacao quando surgem orcamentos novos na SRE/Grupo de interesse
4. **Resumo Automatico do Objeto** — Extrair e apresentar a descricao do que esta sendo comprado sem precisar abrir cada um
5. **Gerador de Cotacoes** — Ferramenta que facilita o preenchimento de propostas em lote
6. **Relatorios e Exportacao** — Export CSV/Excel com filtros avancados

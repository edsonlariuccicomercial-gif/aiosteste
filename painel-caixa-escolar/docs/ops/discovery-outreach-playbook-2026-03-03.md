# Playbook de Abordagem Discovery (03/03/2026)

## Meta do dia
- Fechar 2 entrevistas de 15-20 min.
- Registrar 2 entradas completas em `docs/ops/discovery-interviews.json`.

## Perfil de lead prioritario
- Empresa que participa de licitacao com frequencia semanal.
- Dor atual de prazo/perda de receita.
- Tomador de decisao: dono, comercial, licitacoes, operacoes.

## Script 1 - WhatsApp (primeiro contato)
```
Oi, [NOME]. Tudo bem?
Sou [SEU NOME], estou validando uma rotina para reduzir perda de prazo em licitacoes de fornecedores.

Queria te ouvir por 15-20 min (sem venda), so para entender como voces fazem hoje e onde trava.
Pode ser [DIA] as [HORA 1] ou [HORA 2]?
```

## Script 2 - WhatsApp (follow-up 24h)
```
Oi, [NOME]. Passando para reforcar o convite da conversa rapida de 15-20 min sobre processo de licitacoes.
E bem objetivo e pode te gerar benchmark pratico de operacao.

Consegue [DIA] [HORA 1] ou [HORA 2]?
```

## Script 3 - Email (assunto + corpo)
Assunto:
`Convite rapido (15 min): validacao de rotina para licitacoes`

Corpo:
```
Ola, [NOME].

Estou conduzindo entrevistas curtas com fornecedores para mapear gargalos reais em operacao de licitacoes (prazo, priorizacao, precificacao e retrabalho).

A conversa dura 15-20 minutos, sem pitch comercial, e nosso objetivo e apenas validar dores e impacto.

Pode ser [DIA] as [HORA 1] ou [HORA 2]?

Obrigado,
[SEU NOME]
```

## Roteiro da entrevista (20 min)
1. Contexto (2 min)
- Qual seu papel hoje no processo de licitacoes?
- Quantas oportunidades por semana voces tratam?

2. Dor principal (6 min)
- Qual e o principal gargalo hoje?
- Com que frequencia isso acontece (1 a 5)?
- Qual intensidade do impacto quando acontece (1 a 5)?
- Qual urgencia para resolver (1 a 5)?

3. Impacto e falha da solucao atual (6 min)
- Qual impacto estimado (tempo, dinheiro, perda de oportunidade)?
- Como voces resolvem hoje?
- Onde a solucao atual falha?

4. Disposicao de pagamento (4 min)
- Se resolvesse esse problema, voces pagariam mensalmente?
- Em qual faixa mensal faria sentido?

5. Fechamento (2 min)
- Qual frase resume sua dor hoje? (capturar quote literal)

## Mapeamento direto para `discovery-interviews.json`
- `id`: sequencial (ex: `02`, `03`)
- `date`: formato `YYYY-MM-DD`
- `company`, `role`, `segment`
- `opportunitiesPerWeek`
- `mainPain`
- `frequency1to5`, `intensity1to5`, `urgency1to5`
- `estimatedImpact`
- `currentSolution`, `currentFailure`
- `wouldPay` (`true`/`false`)
- `monthlyPriceRange`
- `keyQuote`

## Padrao de preenchimento rapido (exemplo)
```json
{
  "id": "02",
  "date": "2026-03-03",
  "company": "Fornecedor Exemplo Ltda",
  "role": "Comercial",
  "segment": "Escolar",
  "opportunitiesPerWeek": 12,
  "mainPain": "Perda de prazo por volume e priorizacao manual",
  "frequency1to5": 5,
  "intensity1to5": 4,
  "urgency1to5": 5,
  "estimatedImpact": "Perde 2-3 oportunidades por semana",
  "currentSolution": "Planilha + WhatsApp",
  "currentFailure": "Nao escala e gera retrabalho",
  "wouldPay": true,
  "monthlyPriceRange": "R$ 800-R$ 1.500",
  "keyQuote": "A gente perde venda por nao conseguir priorizar a tempo."
}
```

## Comandos de fechamento do dia
1. `npm.cmd run discovery:validate`
2. `npm.cmd run discovery:cycle`
3. `npm.cmd run discovery:status`

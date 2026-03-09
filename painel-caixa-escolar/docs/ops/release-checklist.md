# Release Checklist - Modulo 1 + Sync Olist

Data de consolidacao: 02/03/2026

## 1) Status das Stories

### Story 1.2 - Espelho SGD com Filtro por SRE e Objeto
- Status na story: `Done`
- Criterios de aceite: todos marcados como concluidos.
- Resultado operacional atual:
  - Coleta SGD funcionando com credencial de fornecedor.
  - Classificacao de objeto: `100% (10/10)`.
  - Cobertura SKU: `100% (10/10)`.

### Story 1.3 - Integracao Pos-Licitacao (LicitIA -> Olist)
- Status na story: `Parked (Fase 2)` por priorizacao de produto.
- Criterios de aceite tecnicos: todos marcados como concluidos.
- Definition of Done: concluido.
- Testes automatizados implementados para:
  - fluxo feliz;
  - idempotencia;
  - falha transitoria com `pending_retry`;
  - reprocessamento com sucesso.

## 2) Comandos de Validacao

### Coleta e inteligencia (Modulo 1)
```powershell
npm.cmd run dashboard:collect
npm.cmd run dashboard:audit:territory
npm.cmd run dashboard:audit:sku
npm.cmd run dashboard:validate:sku
```

### Sync Olist (Pos-licitacao)
```powershell
npm.cmd run orders:sync:olist
npm.cmd run orders:test:sync:olist
npm.cmd test
```

## 3) Resultados Atuais

### Coleta SGD
- Ultima execucao validada: `dashboard:collect` em 02/03/2026.
- Cotas extraidas: `10`.
- Classificacao de objeto no coletor: `100.0% (10/10)`.

### Cobertura SKU
- Fonte: `dashboard/data/sku-coverage-report.json`.
- Cobertura: `100% (10/10)`.
- Pendencias: `0`.
- Regras configuradas: `5`.
- SKUs configurados: `5`.

### Testes Sync Olist
- `orders:test:sync:olist`: aprovado.
- `npm test`: aprovado.
- Evidencia: cenarios feliz/idempotencia/falha/reprocessamento executados sem erro.

## 4) Checklist Go/No-Go Operacional

### Go/No-Go tecnico
- [x] Coleta SGD executa sem quebrar fluxo de login/navegacao.
- [x] Coleta nao sobrescreve base quando retorno vem vazio.
- [x] Diagnostico automatico habilitado para incidentes (`collect-error`/`collect-empty`).
- [x] Cobertura SKU >= 95% (meta): atual `100%`.
- [x] Exportacao e painel refletem classificacao/precificacao atual.
- [x] Sync Olist com idempotencia e retentativa validado por teste automatizado.

### Go operacional (rotina diaria)
- [x] Rodar `dashboard:collect`.
- [x] Rodar `dashboard:audit:sku`.
- [x] Rodar `dashboard:validate:sku`.
- [x] Em caso de pos-licitacao ativa, rodar `orders:sync:olist`.
- [x] Antes de release, rodar `orders:test:sync:olist`.

## Decisao recomendada
- `GO` para operacao assistida atual do Modulo 1.
- `GO` tecnico para o fluxo de sync Olist em modo controlado (Fase 2), com base em testes automatizados.

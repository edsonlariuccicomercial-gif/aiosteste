# Sessao de Onboarding (30 min)

- Data: 2026-03-03
- Inicio: 2026-03-03T01:31:11.917Z
- Cliente: Fornecedor MG
- CNPJ: nao informado
- Responsavel: operacao

## Roteiro

### 0-10 min - Acesso e credenciais
- [ ] Validar credenciais SGD (SGD_DOC/SGD_CNPJ e SGD_PASS).
- [ ] Confirmar acesso local ao projeto.
- [ ] Definir SREs foco e volume alvo do dia.

### 10-20 min - Primeira rodada operacional
- [ ] Executar npm.cmd run ops:daily:collect.
- [ ] Validar dashboard/data/ops-daily-run-report.json.
- [ ] Validar docs/ops/ops-daily-last-run.md.

### 20-30 min - Leitura e acao
- [ ] Executar npm.cmd run dashboard:serve.
- [ ] Filtrar cotacoes por SRE/municipio prioritario.
- [ ] Exportar urgentes e iniciar tratativa de itens <= 48h.

## Criterios de sucesso
- [ ] Pipeline ops:daily:collect sem erro.
- [ ] Cobertura SKU >= 95%.
- [ ] Operador gera lista de urgentes sem suporte.

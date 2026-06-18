# Follow-up Técnico — Validação/sanitização de cadastro de clientes (NF-e)

| Campo | Valor |
|-------|-------|
| **ID** | FU-2026-06-18-NFE-CADASTRO |
| **Tipo** | Débito técnico / Melhoria de qualidade de dado |
| **Prioridade** | MÉDIA (não bloqueia — emissão já está protegida) |
| **Origem** | Investigação Rejeição 225 — nota 1558 (Caixa Escolar Santa Quitéria), 2026-06-18 |
| **Status** | Aberto |
| **Registrado por** | @devops (Gage), a pedido do stakeholder |

---

## Contexto

A nota 1558 (Caixa Escolar Santa Quitéria) foi **rejeitada pela SEFAZ com erro "225 — Falha no Schema XML"** porque o cadastro da escola tinha 3 campos fora do padrão exigido pelo XSD da NF-e 4.00:

| Campo | Valor no cadastro | Exigência do XSD |
|-------|-------------------|------------------|
| `xNome` (nome) | 76 caracteres | máx. 60 |
| `CNPJ` | `66.230.491/0001-75` (com máscara) | 14 dígitos puros |
| `CEP` | `36.940-000` (com máscara) | 8 dígitos puros |

## Correção já aplicada (resolve a emissão)

Commits `72e2dce` + `db4140e` (2026-06-18) — `server-lib/nfe-sefaz-client.js`:
- Sanitização de CNPJ/CEP (`sanitizeDigits`) no `<dest>` e `<emit>`
- Truncamento de `xNome` para 60 chars (antes do escape XML, para não quebrar entidades)

**A emissão de NF-e está protegida na origem** — qualquer cadastro com máscara ou nome longo agora gera XML válido.

## O follow-up (melhoria opcional)

A correção higieniza o dado **no momento de montar o XML**. O dado **continua "sujo" no cadastro** (CNPJ/CEP com máscara, nome longo no Supabase/localStorage). Isso é seguro para a NF-e, mas:

- O dado sujo pode causar problemas em **outros lugares** que consomem o cadastro (relatórios, integrações, buscas, exportações) e que não têm a mesma sanitização.
- A qualidade do dado na origem fica baixa.

### Recomendação
Validar/normalizar os campos do cliente **na entrada do cadastro** (formulário de cliente em `gdp-usuarios.js` / fluxo de criação de cliente):
1. **CNPJ/CPF e CEP:** salvar só dígitos (`sanitizeDigits`) OU validar formato antes de salvar.
2. **Nome:** avisar (não bloquear) se exceder 60 caracteres, pois será truncado na NF-e — permite o usuário abreviar conscientemente (ex.: "EE" em vez de "Escola Estadual").
3. Aplicar também na importação/sync de clientes vindos do Supabase, se houver.

### Por que não é urgente
A causa-raiz da rejeição (emissão) já está corrigida e validada (nota 1558 autorizou em produção, 2026-06-18). Este follow-up é **defesa em profundidade** + qualidade de dado, não correção de bug ativo.

## Escopo sugerido (se priorizado)
- `js/gdp-usuarios.js` — formulário/save de cliente
- Fluxo de import/sync de clientes (Supabase `clientes`)
- Reusar o helper `sanitizeDigits` (já existe em `nfe-sefaz-client.js`) ou criar equivalente no frontend

## Referências
- Handoffs: `.aiox/handoffs/handoff-analyst-to-po-nfe-225-endereco-20260618.yaml`
- Gate QA: `docs/qa/gates/nfe-225-sanitizacao-dest.yml`
- Commits: `72e2dce`, `db4140e`

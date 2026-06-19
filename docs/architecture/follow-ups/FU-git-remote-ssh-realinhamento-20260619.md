# Follow-up Técnico — Realinhamento do remote git SSH (`github-edson`)

| Campo | Valor |
|-------|-------|
| **ID** | FU-2026-06-19-GIT-REMOTE-SSH |
| **Tipo** | Débito técnico / Infraestrutura de repositório (DevOps) |
| **Prioridade** | MÉDIA (não bloqueia — há workaround HTTPS, mas atrapalha toda operação git/gh) |
| **Origem** | Push/PR da Story 20.15b, 2026-06-19 |
| **Status** | Aberto |
| **Registrado por** | @devops (Gage), a pedido do stakeholder |

---

## Contexto

Durante o push e a criação do PR #16 da Story 20.15b, o remote `origin` (SSH, apelidado `github-edson`) apresentou 2 problemas:

1. **Ref `origin/` stale:** `git log origin/feature/...` mostrava um estado desatualizado do remote, sugerindo (incorretamente) que havia 2 commits remotos da Story 20.5 exigindo rebase/force. Ao buscar o remote **HTTPS real**, confirmou-se que aqueles commits já estavam na história local e o push era um **fast-forward limpo**. O risco: um operador menos atento poderia ter feito um `git push --force` desnecessário e destrutivo.
2. **`gh` não reconhece o remote:** `gh pr list/create` falharam com *"none of the git remotes configured for this repository point to a known GitHub host"* — foi necessário usar `--repo edsonlariuccicomercial-gif/aiosteste` explícito em todas as operações `gh`.

## Workaround em uso (atual)
- **Push:** `git push https://github.com/edsonlariuccicomercial-gif/aiosteste.git <branch>` (URL HTTPS explícita)
- **gh:** `gh pr ... --repo edsonlariuccicomercial-gif/aiosteste` (flag `--repo` explícita)

Documentado no handoff `.aiox/handoffs/handoff-FINAL-2015b-pronta-para-implementar-20260618.yaml` ("origin SSH github-edson NAO resolve").

## Causa provável
O remote `origin` está configurado com um host SSH alias (`git@github-edson:...` via `~/.ssh/config`) que: (a) não resolve a chave/host corretamente neste ambiente, e (b) o `gh` não consegue mapear para `github.com`.

## Recomendação (se priorizado)
1. Inspecionar: `git remote -v` e `~/.ssh/config` (bloco `Host github-edson`).
2. **Opção A (simples):** apontar `origin` para HTTPS:
   `git remote set-url origin https://github.com/edsonlariuccicomercial-gif/aiosteste.git`
   — resolve push e `gh` de uma vez (gh já está autenticado como `edsonlariuccicomercial-gif` via keyring).
3. **Opção B (manter SSH):** corrigir o `~/.ssh/config` (HostName `github.com`, IdentityFile correto) e validar com `ssh -T git@github-edson`; adicionar `gh` host mapping se necessário.
4. Atualizar o handoff/CLAUDE.md removendo o workaround quando resolvido.

## Por que não é urgente
Há workaround funcional (HTTPS + `--repo`). Mas o ref stale é um **risco latente de force-push acidental** e a fricção operacional afeta toda operação de git/gh — por isso MÉDIA, não BAIXA.

## Escopo sugerido
- Config local: `git remote set-url` e/ou `~/.ssh/config`
- Doc: `.claude/CLAUDE.md` (seção de deploy/git) e handoffs relacionados

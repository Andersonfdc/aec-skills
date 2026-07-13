# aec-skills — Biblioteca privada de skills e agents multi-harness

**Data:** 2026-07-13
**Status:** design aprovado, pronto para plano de implementação

## Problema

Skills e agents escritos para o Claude Code hoje vivem apenas em `~/.claude/`. Não há
como distribuí-los para outras pessoas nem para os outros agentes de codificação que a
equipe usa (principalmente o GitHub Copilot). Cada máquina reconfigura tudo à mão, e não
existe mecanismo de atualização quando uma skill evolui.

## Objetivo

Uma biblioteca privada e curada de skills, agents, commands e hooks, instalável em
múltiplos harnesses com um comando (`npx aec-skills add <nome>`), com atualização
detectada automaticamente e aplicada sob comando explícito.

## Decisões

| Dimensão | Decisão |
|---|---|
| Curadoria | Fechada — só o mantenedor publica |
| Fonte da verdade | Repositório GitHub **privado** |
| Formato canônico | `SKILL.md` do Claude Code (padrão aberto agentskills.io) |
| Distribuição | `git clone` do repo no store local — sem índice, sem API, sem CI |
| Auth | `aec-skills login`: gh CLI → `GITHUB_TOKEN` → prompt de PAT |
| Instalação | Global, via store único + junction/symlink |
| Atualização | Detecção automática (piggyback), aplicação manual |
| Harnesses | Claude Code, GitHub Copilot, Codex CLI, Gemini CLI |
| Fora de escopo | Cursor (não possui instalação global em disco) |

### Por que git em vez de API + índice

O `git` já entrega, sem código nosso: autenticação em repo privado (credential helper),
sincronização, diff real, versionamento por SHA, e detecção de edição local
(`git status`). A alternativa — CI gerando `index.json`, CLI consumindo a API do GitHub,
lockfile com hashes — reimplementa à mão tudo isso, pior. O custo é exigir `git` na
máquina do consumidor, que é um desenvolvedor usando Copilot ou Claude Code.

### Por que Cursor ficou de fora

O Cursor não expõe regras globais em disco: as "User Rules" são armazenadas internamente
pelo aplicativo (Settings UI). Só existe `.cursor/rules/*.mdc` por projeto. Não há onde
plantar um link global, e suportá-lo exigiria um segundo modo de instalação inteiro
(por-repositório, com rastreamento de arquivos copiados em N repositórios).

## Arquitetura

### O repositório (fonte da verdade)

```
aec-skills-library/            repo GitHub privado
├── skills/
│   └── code-review/
│       ├── SKILL.md           frontmatter: name, description
│       └── reference.md       arquivos de apoio, linkados no SKILL.md
├── agents/
│   └── error-diagnostician.md frontmatter: name, description, tools, model
├── commands/
│   └── deepdive.md
├── hooks/
│   └── validate-commit/
│       ├── hook.json          fragmento a injetar no settings.json
│       └── script.sh
└── aec-skills.json            metadados da biblioteca
```

As pastas são o índice. Publicar = commit + push.

### O store (máquina do consumidor)

```
~/.aec-skills/
├── repo/                      git clone --depth 1 do repo privado
├── build/                     derivados gerados (agents, commands, GEMINI.md)
│   ├── claude/
│   ├── copilot/
│   └── gemini/
├── installed.json             o que está instalado, onde, com qual SHA
└── config.json                credencial e harnesses ativos (chmod 600)
```

### Ligação com os harnesses

| Destino | Mecanismo | Origem |
|---|---|---|
| `~/.claude/skills/<n>` | junction | `store/repo/skills/<n>` |
| `~/.copilot/skills/<n>` | junction | `store/repo/skills/<n>` |
| `~/.codex/skills/<n>` | junction | `store/repo/skills/<n>` |
| `~/.claude/agents/<n>.md` | junction | `store/build/claude/agents/<n>.md` |
| `~/.copilot/agents/<n>.agent.md` | junction | `store/build/copilot/agents/<n>.agent.md` |
| `~/.claude/commands/<n>.md` | junction | `store/repo/commands/<n>.md` |
| `~/.gemini/commands/<n>.toml` | junction | `store/build/gemini/commands/<n>.toml` |
| `~/.gemini/GEMINI.md` | merge em bloco marcado | `store/build/gemini/index.md` |
| `~/.claude/settings.json` | merge em bloco marcado | `store/repo/hooks/*/hook.json` |

**Junction, não symlink de arquivo.** No Windows, junction de diretório não exige
Developer Mode nem privilégio de administrador; symlink de arquivo exige. Agents e
commands são arquivos soltos: linkamos o diretório-pai quando ele não existe e caímos
para cópia rastreada quando ele já contém arquivos do usuário. Em Linux e macOS,
symlink normal.

**Nada é sobrescrito.** `GEMINI.md` e `settings.json` podem conter conteúdo do usuário.
Neles, o CLI reescreve apenas o conteúdo entre `<!-- aec-skills:start -->` e
`<!-- aec-skills:end -->`.

### Descoberta de paths por harness

Todos confirmados em documentação oficial (2026-07):

| Harness | Skills (pessoal) | Agents (pessoal) | Commands |
|---|---|---|---|
| Claude Code | `~/.claude/skills/<n>/SKILL.md` | `~/.claude/agents/<n>.md` | `~/.claude/commands/<n>.md` |
| GitHub Copilot | `~/.copilot/skills/<n>/SKILL.md` | `~/.copilot/agents/<n>.agent.md` | não confirmado |
| Codex CLI | `~/.codex/skills/<n>/SKILL.md` | não possui | não confirmado |
| Gemini CLI | não possui | não possui | `~/.gemini/commands/<n>.toml` |

O Copilot adota Agent Skills como padrão aberto (agentskills.io) e lê `SKILL.md` com o
mesmo frontmatter do Claude Code. Skills, portanto, **não têm adaptador**: é o mesmo
arquivo em três harnesses.

`chat.agentFilesLocations` e `chat.agentSkillsLocations` do VS Code **rejeitam caminhos
absolutos** (validado no código-fonte do VS Code). O store não pode ser referenciado por
configuração — precisa estar sob `~/.copilot/` via link. É por isso que a estratégia de
linking é obrigatória, não uma otimização.

## Comandos

```bash
npx aec-skills login              # gh CLI → GITHUB_TOKEN → prompt de PAT
npx aec-skills list               # o que existe na biblioteca (✓ = instalado)
npx aec-skills add <nome...>      # instala; --all instala tudo
npx aec-skills remove <nome...>   # remove os links, mantém o store
npx aec-skills status             # o que mudou no repo desde o último update
npx aec-skills update             # git pull + rebuild + religa
npx aec-skills uninstall          # remove links e store
```

**`--harness=claude,copilot,codex,gemini`** — flag global. Por padrão, autodetecta pela
existência dos diretórios (`~/.copilot/` existe ⇒ Copilot é alvo).

**`login`** grava a credencial em `config.json` com permissão 600 e clona o repositório.
O token nunca é impresso, logado, nem incluído em mensagens de erro.

**`add`** valida o frontmatter antes de instalar: `name` precisa bater com o nome da
pasta, conter apenas `[a-z0-9-]` e ter no máximo 64 caracteres; `description` é
obrigatória. Frontmatter inválido faz a skill **falhar silenciosamente no Copilot** — a
validação aqui transforma um bug invisível em erro legível.

**`status`** roda `git fetch` e faz diff contra o `HEAD` local:

```
aec-skills — 3 atualizações disponíveis

  ~ code-review        modificada (2 commits atrás)
  + security-audit     nova na biblioteca
  ! karpathy           VOCÊ EDITOU LOCALMENTE — update vai sobrescrever

Rode `npx aec-skills update` para aplicar.
```

**Detecção automática, aplicação manual.** Qualquer comando dispara `git fetch` em
background se o último foi há mais de 6 horas, e imprime um aviso de uma linha ao final.
Sem daemon, sem cron. `aec-skills status --install-hook` registra opcionalmente um hook
`SessionStart` no Claude Code (único harness com hooks) para avisar dentro da sessão.

**`update`** nunca destrói silenciosamente. Skill com modificação local (detectada por
`git status` no store) é **pulada** com aviso; `--force` sobrescreve.

**Hooks e `settings.json`** exigem confirmação explícita: o `add` exibe o diff do que
será injetado, pede `y/N`, faz backup em `settings.json.bak` e escreve apenas dentro do
bloco marcado.

## Adaptadores

| | Claude Code | Copilot | Codex | Gemini |
|---|---|---|---|---|
| skill | junction | junction | junction | ponte por índice |
| agent | junction | build (`.agent.md`) | não possui | não possui |
| command | junction | não confirmado | não confirmado | build (`.toml`) |
| hook | merge em `settings.json` | não possui | não possui | não possui |

### Agents: Claude → Copilot

Frontmatter é quase 1:1 (`name`, `description`, `model`), exceto `tools`.

**Os nomes das tools não são traduzíveis.** O Claude Code usa `Read`, `Grep`, `Bash`,
`Task`; o Copilot usa `search/codebase`, `web/fetch`, `search/usages`. São taxonomias
diferentes, e `Task`/subagents não tem equivalente. Uma tabela de tradução parcial
produziria uma allowlist ou restritiva demais (o agent quebra) ou permissiva demais (o
agent ganha uma tool que foi negada). Nenhum dos dois é aceitável num arquivo executado
na máquina de outra pessoa.

**Decisão:** no build para o Copilot, o campo `tools` é **omitido** — que é o default
documentado e significa "todas as tools". O `add` avisa explicitamente. Quem precisa de
controle fino declara o override no próprio agent:

```yaml
---
name: code-reviewer
tools: Read, Grep, Glob                          # Claude Code
targets:
  copilot:
    tools: ['search/codebase', 'search/usages']  # override explícito
---
```

Escape hatch opt-in. Sem heurística adivinhando permissões.

### Skills → Gemini: ponte por índice

O Gemini não tem skills. `GEMINI.md` é injetado em **todo** prompt, então importar o
corpo das skills via `@import` colocaria todas elas dentro de cada requisição — contexto
estourado, custo alto, qualidade pior.

A ponte importa apenas um índice e delega a leitura ao próprio Gemini:

```markdown
<!-- aec-skills:start -->
## Skills disponíveis
Quando a tarefa casar com uma descrição abaixo, leia o arquivo indicado antes de agir.

- **code-review** — revisar código antes de PR/merge.
  → `~/.aec-skills/repo/skills/code-review/SKILL.md`
- **diagnose** — erro sem stack trace claro, falha silenciosa.
  → `~/.aec-skills/repo/skills/diagnose/SKILL.md`
<!-- aec-skills:end -->
```

Uma linha por skill no contexto; o corpo é carregado sob demanda pela tool de leitura do
Gemini. Emula o carregamento progressivo que os outros três têm nativo. É o teto do que a
plataforma permite.

### Pipeline de build

`add` e `update` chamam o mesmo pipeline, idempotente e destrutivo apenas dentro de
`store/build/`: apaga o diretório, regenera tudo a partir de `store/repo/`, refaz os
links quebrados. Como os links apontam para caminhos estáveis, um rebuild não obriga a
religar nada — exceto quando uma skill é adicionada ou removida.

## Tratamento de erro

| Falha | Comportamento |
|---|---|
| `git` ausente | erro claro com link de instalação; aborta |
| Sem auth / token expirado | instrui `aec-skills login`; nunca imprime o token |
| Junction negado (Windows) | fallback para cópia, registrada em `installed.json`, com aviso |
| Destino existe e não é nosso link | **não toca**; avisa e pula |
| Frontmatter inválido | falha no `add`, citando o campo e o valor problemático |
| Offline no check | segue com o store local; avisa que não conferiu |

## Testes

`node:test` (nativo — sem Jest, sem Vitest, sem configuração).

- **Adaptadores** — funções puras: entra `SKILL.md`/agent, sai o arquivo do harness.
  Testáveis sem tocar em disco. É onde mora a lógica, então é onde ficam a maioria dos
  testes.
- **Linker** — contra diretório temporário real, não contra `fs` mockado (mockar `fs`
  testaria o mock, não o comportamento do Windows). Cobre: junction criado, fallback de
  cópia, destino ocupado é preservado, `uninstall` limpa tudo.
- **Git** — o único componente mockado, atrás da interface `GitStore`
  (`fetch()`, `pull()`, `status()`, `head()`), com fake class nomeada. Sem rede nos
  testes.

**Verificação de aceitação:** um smoke test manual, uma vez — instalar uma skill real e
confirmar que ela aparece no menu `/` do Claude Code, do Copilot e do Codex. Os testes
provam que o arquivo foi escrito corretamente; apenas o smoke prova que o harness o
**leu**. Todos os paths deste projeto vêm de documentação de produtos com ciclo de release
rápido.

## Pendências de verificação

Itens não confirmados em documentação oficial. Devem ser verificados antes da
implementação do adaptador correspondente — não assumidos.

1. **Prompt files pessoais do Copilot.** `chat.promptFilesLocations` existe, mas o path
   pessoal padrão não foi confirmado. Enquanto isso, commands não são instalados no
   Copilot — e podem ser desnecessários, já que skill com `user-invocable: true` já
   aparece no menu `/`.
2. **Agents no Codex CLI.** O Codex tem skills (`~/.codex/skills/`, confirmado), mas não
   foi encontrado suporte a subagents. Fora do v1.
3. **Recursão em `~/.claude/skills/`.** Relatos da comunidade indicam que subpastas dentro
   de um diretório de skill podem não ser escaneadas. Irrelevante para o design atual (uma
   skill = um diretório de topo), mas confirmar antes de aninhar.

## Fora de escopo (v1)

- Cursor (sem instalação global em disco)
- Registry público com `publish` de terceiros
- Instalação por projeto (`--project`)
- Versionamento semântico por skill (o SHA do commit é a versão)

# aec-skills

`aec-skills` distribui uma biblioteca privada de skills, agents, commands e hooks para
múltiplos harnesses de IA a partir de um repositório git. Um `login` clona a biblioteca
e um `add` liga (symlink) cada artefato no formato esperado por cada harness instalado
na máquina.

## Instalação e uso

Este repositório é **público** e contém apenas o CLI. A biblioteca — as skills, agents,
commands e hooks — vive num repositório **privado** separado, que o CLI clona depois de
autenticar.

```bash
npx github:Andersonfdc/aec-skills
```

Sem argumento nenhum, abre o instalador interativo: autentica se ainda não houver store,
lista a biblioteca num menu (`<espaço>` marca, `<a>` marca tudo, `<enter>` instala, `<q>`
sai) e instala o que você escolheu nos harnesses detectados.

Fora de um TTY — num pipe, num script, na CI — não há como desenhar o menu, então os
comandos continuam disponíveis um a um:

```bash
npx github:Andersonfdc/aec-skills login
npx github:Andersonfdc/aec-skills add hello-aec
```

### Por que o CLI é público e a biblioteca não

`npx github:...` faz um `git clone` deste repositório para poder rodar. Se ele fosse
privado, quem não tem acesso não baixaria nem o CLI — morreria no `Authentication
failed` antes de chegar à tela onde colaria o token. Alguma coisa precisa ser pública, e
o CLI é a parte que não guarda segredo nenhum.

### Autenticação

O acesso é resolvido nesta ordem, e quem tem qualquer uma das três primeiras fontes
nunca vê um prompt:

1. o token já salvo em `~/.aec-skills/config.json` (de um login anterior)
2. o `gh` CLI, se estiver autenticado — é o caminho do mantenedor
3. a variável de ambiente `GITHUB_TOKEN`

Sem nenhuma delas, o CLI pede o **token de acesso à biblioteca**: o token que o mantenedor
distribui, e não um token da conta de quem instala. Num terminal a digitação não aparece
na tela; num pipe ou na CI, o token é lido do stdin.

O token da conta do usuário não serviria. As contas são empresariais (Enterprise Managed
Users) e o GitHub não permite adicioná-las como colaboradoras de um repositório privado
fora da empresa delas — um token pessoal delas daria 404 no clone.

O token nunca é gravado em `.git/config`, nunca vai na linha de comando e nunca é
impresso em log, erro ou stack trace. O `config.json` é gravado com permissão `0600`.

### O token distribuído

Gere um **fine-grained PAT**, nunca um clássico: um PAT clássico com escopo `repo` dá
leitura e escrita em *todos* os seus repositórios, e você estaria entregando isso a cada
usuário.

- **Repository access:** apenas `aec-skills-library`
- **Permissions:** `Contents: Read-only`
- **Expiration:** o menor prazo que você tolere rodar

É um segredo compartilhado: se vazar, o conteúdo da biblioteca vaza — só leitura, só esse
repositório. Não há rastro de quem usou. A rotação é manual: gere um token novo e
redistribua.

## A biblioteca

Vive em `Andersonfdc/aec-skills-library` (privado). Publicar uma skill nova é um commit
lá — não há índice, CI nem `npm publish`.

```
skills/<nome>/SKILL.md      frontmatter: name (= nome da pasta), description
agents/<nome>.md            frontmatter: name, description, tools, model
commands/<nome>.md
hooks/<nome>/hook.json      fragmento injetado no settings.json do Claude Code
```

### Comandos

| Comando | Descrição |
|---|---|
| `install` | instalador interativo — é o padrão quando o CLI roda sem comando num terminal |
| `login [url]` | autentica e clona a biblioteca para `~/.aec-skills` (sem `url`, usa a biblioteca padrão) |
| `list` | lista as skills, agents, commands e hooks disponíveis na biblioteca |
| `add <nome...>` | instala os artefatos pedidos nos harnesses detectados (`--all` instala tudo) |
| `remove <nome...>` | desinstala os artefatos pedidos |
| `status` | mostra o que mudou na biblioteca desde a última instalação |
| `update` | busca as atualizações e reaplica o que já está instalado |
| `uninstall` | remove todos os links instalados e apaga o store `~/.aec-skills` |

### Flag `--harness`

Por padrão, o harness alvo é autodetectado pela presença do diretório raiz
(`~/.claude`, `~/.copilot`, `~/.codex`, `~/.gemini`). Use `--harness=<lista>` para
restringir explicitamente, por exemplo `--harness=claude,codex`.

## Suporte por harness

| Harness | Skills | Agents | Commands | Hooks |
|---|---|---|---|---|
| Claude Code | sim | sim | sim | sim |
| GitHub Copilot | sim | sim | não | não |
| Codex CLI | sim | não | não | não |
| Gemini CLI | não* | não | sim | não |

\* Gemini CLI não tem diretório de skills. Em vez disso, `add`/`update`/`remove`
mantêm um índice das skills da biblioteca dentro de um bloco marcado em
`~/.gemini/GEMINI.md` — o modelo lê a descrição e abre o `SKILL.md` correspondente
quando a tarefa casa com ela.

**Cursor não é suportado**: não há uma localização global em disco para regras do
Cursor equivalente aos harnesses acima.

Duas lacunas documentadas, não suposições:
- **Codex CLI não tem subagents** — só skills. `add` pula agents nesse harness.
- **O path pessoal dos prompt-files do Copilot não está confirmado** — por isso
  commands não são instalados no Copilot. Uma skill com `user-invocable: true` já
  aparece no menu `/` do Copilot Chat, então esse adaptador pode nem ser necessário.

## Agents no Copilot: `tools` não restrito por padrão

As taxonomias de tools diferem entre harnesses, então `add` **não** aplica nenhuma
restrição de `tools` a um agent instalado no Copilot, a menos que o próprio artefato
declare `targets.copilot.tools` no frontmatter. Sem essa declaração, o comando avisa:

```
aviso: agent "<nome>" instalado no Copilot sem restrição de tools
```

## `update` nunca sobrescreve o que você editou

Se algum artefato instalado foi editado localmente no store (`~/.aec-skills/repo`),
`update` lista os arquivos e não aplica nada — a menos que você passe `--force`, que
sobrescreve a edição local com a versão da biblioteca.

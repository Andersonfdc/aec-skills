# aec-skills

`aec-skills` distribui uma biblioteca privada de skills, agents, commands e hooks para
múltiplos harnesses de IA a partir de um único repositório git. Um `login` clona a
biblioteca e um `add` liga (symlink) cada artefato no formato esperado por cada harness
instalado na máquina.

## Instalação e uso

Não há publicação no npm: o `npx` instala o CLI direto deste repositório, usando a
credencial git que você já tem.

```bash
npx github:Andersonfdc/aec-skills login https://github.com/Andersonfdc/aec-skills.git
npx github:Andersonfdc/aec-skills add hello-aec
```

O CLI e a biblioteca vivem no mesmo repositório: `src/` é o código, e `skills/`,
`agents/`, `commands/` e `hooks/` são o conteúdo distribuído. Publicar uma skill nova é
um commit — não há índice, CI nem `npm publish`.

O token de acesso é resolvido, nessa ordem: `gh` CLI (se autenticado) → variável de
ambiente `GITHUB_TOKEN` → prompt interativo (a digitação não é ecoada). O token nunca é
gravado em `.git/config` nem impresso em log ou erro.

### Estrutura da biblioteca

```
skills/<nome>/SKILL.md      frontmatter: name (= nome da pasta), description
agents/<nome>.md            frontmatter: name, description, tools, model
commands/<nome>.md
hooks/<nome>/hook.json      fragmento injetado no settings.json do Claude Code
```

### Comandos

| Comando | Descrição |
|---|---|
| `login <url>` | autentica e clona a biblioteca para `~/.aec-skills` |
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

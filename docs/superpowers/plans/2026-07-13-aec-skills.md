# aec-skills — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um CLI Node (`npx aec-skills`) que instala skills, agents, commands e hooks de um repositório GitHub privado em quatro harnesses (Claude Code, GitHub Copilot, Codex CLI, Gemini CLI), com detecção automática de atualizações e aplicação manual.

**Architecture:** O store local (`~/.aec-skills/repo`) é um `git clone` do repositório privado — o git fornece auth, sync, diff e versionamento sem código nosso. Skills são ligadas por junction/symlink diretamente do store para cada harness (mesmo `SKILL.md`, zero conversão). Agents, commands e a ponte do Gemini passam por adaptadores puros que geram derivados em `~/.aec-skills/build/`, também ligados por junction.

**Tech Stack:** Node 20+ (ESM), `node:test` (runner nativo), `node:util.parseArgs` (parser de args nativo), JSDoc para tipos. Única dependência de runtime: `yaml`.

Spec: `docs/superpowers/specs/2026-07-13-aec-skills-design.md`

## Global Constraints

- Node 20 ou superior. ESM (`"type": "module"`). Sem build step — o fonte é o publicado.
- Dependência de runtime permitida: apenas `yaml`. Sem `commander`, `chalk`, `inquirer`, `fs-extra`.
- Dependência de dev: nenhuma. Testes com `node:test` + `node:assert/strict`.
- Nomes de arquivo em `kebab-case`. Funções em `camelCase`, classes em `PascalCase`, constantes em `UPPER_SNAKE_CASE`.
- Tipos declarados via JSDoc em toda função exportada. Sem `any`, sem objeto sem shape.
- Funções de 4 a 20 linhas. Arquivos abaixo de 300 linhas.
- Encoding UTF-8 sem BOM. Fim de linha LF no repositório.
- Conventional Commits obrigatório: `<type>(<scope>): <subject>`, subject ≤ 72 chars, imperativo, sem ponto final.
- **O token nunca aparece em stdout, stderr, log ou mensagem de erro.**
- `config.json` gravado com modo `0600`.
- **Nenhum arquivo que não seja nosso é sobrescrito.** Destino ocupado por conteúdo do usuário: avisar e pular.
- Marcadores de bloco literais: `<!-- aec-skills:start -->` e `<!-- aec-skills:end -->`.

---

## Estrutura de arquivos

```
package.json                    bin: aec-skills → src/cli.js
src/
  cli.js                        entrypoint: parseArgs + dispatch para os comandos
  paths.js                      caminhos do store (constantes derivadas de os.homedir)
  harness.js                    tabela dos 4 harnesses + detecção
  frontmatter.js               parse/serialize de frontmatter YAML
  validate.js                   validação de frontmatter de skill e de agent
  library.js                    inventário do clone: quais skills/agents/commands/hooks existem
  linker.js                     junction/symlink + fallback de cópia + unlink seguro
  merge-block.js                merge idempotente de bloco marcado (texto) e de hooks (JSON)
  git-store.js                  classe GitStore: clone, fetch, pull, head, status, changedFiles
  auth.js                       resolução de credencial: gh CLI → env → prompt
  state.js                      leitura/escrita de config.json e installed.json
  build.js                      pipeline: limpa build/, roda adaptadores, grava derivados
  adapters/
    copilot-agent.js            agent do Claude → .agent.md do Copilot
    gemini-index.js             skills → bloco de índice do GEMINI.md
    gemini-command.js           command markdown → .toml do Gemini
  install.js                    orquestra add/remove: valida, builda, liga, registra
  hooks.js                      injeção de hook no settings.json com confirmação e backup
  commands/
    login.js  list.js  add.js  remove.js  status.js  update.js  uninstall.js
test/
  frontmatter.test.js  validate.test.js  harness.test.js  linker.test.js
  merge-block.test.js  library.test.js  adapters.test.js  install.test.js
  status.test.js
  helpers/fake-git-store.js     fake nomeado, sem rede
  helpers/tmp-home.js           cria um HOME temporário real para os testes de disco
```

**Fronteiras:** `linker.js` é o único módulo que cria links. `git-store.js` é o único que executa `git`. Os adaptadores são funções puras (string → string), sem I/O — é onde mora a lógica e onde ficam a maioria dos testes.

---

## Task 1: Scaffold do projeto e CLI executável

**Files:**
- Create: `package.json`
- Create: `src/cli.js`
- Create: `.gitignore`
- Test: `test/cli.test.js`

**Interfaces:**
- Produces: binário `aec-skills`; `runCli(argv: string[]): Promise<number>` — retorna o exit code.

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "aec-skills",
  "version": "0.1.0",
  "description": "Biblioteca privada de skills e agents para Claude Code, Copilot, Codex e Gemini",
  "type": "module",
  "bin": { "aec-skills": "src/cli.js" },
  "files": ["src"],
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test test/"
  },
  "dependencies": {
    "yaml": "^2.6.0"
  }
}
```

- [ ] **Step 2: Criar `.gitignore`**

```
node_modules/
*.log
```

- [ ] **Step 3: Escrever o teste que falha**

`test/cli.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runCli } from '../src/cli.js'

test('runCli sem argumentos imprime ajuda e retorna 1', async () => {
  const output = []
  const code = await runCli([], { log: (line) => output.push(line) })
  assert.equal(code, 1)
  assert.match(output.join('\n'), /aec-skills <comando>/)
})

test('runCli --version imprime a versão', async () => {
  const output = []
  const code = await runCli(['--version'], { log: (line) => output.push(line) })
  assert.equal(code, 0)
  assert.match(output.join('\n'), /^\d+\.\d+\.\d+$/)
})

test('runCli com comando desconhecido retorna 1', async () => {
  const output = []
  const code = await runCli(['inventado'], { log: (line) => output.push(line) })
  assert.equal(code, 1)
  assert.match(output.join('\n'), /comando desconhecido: inventado/)
})
```

- [ ] **Step 4: Rodar o teste para confirmar que falha**

Run: `npm install && node --test test/cli.test.js`
Expected: FAIL — `Cannot find module '../src/cli.js'`

- [ ] **Step 5: Implementar `src/cli.js`**

```js
#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const HELP = `aec-skills <comando> [opções]

Comandos:
  login                 autentica e clona a biblioteca
  list                  lista as skills e agents disponíveis
  add <nome...>         instala nos harnesses detectados (--all para tudo)
  remove <nome...>      desinstala
  status                mostra o que mudou na biblioteca
  update                aplica as atualizações
  uninstall             remove tudo, inclusive o store

Opções:
  --harness=<lista>     claude,copilot,codex,gemini (padrão: autodetectar)
  --version             imprime a versão`

/**
 * Ponto de entrada do CLI.
 * @param {string[]} argv argumentos, sem `node` e sem o caminho do script
 * @param {{ log?: (line: string) => void }} [io]
 * @returns {Promise<number>} exit code
 */
export async function runCli(argv, io = {}) {
  const log = io.log ?? console.log

  if (argv.includes('--version')) {
    log(await readVersion())
    return 0
  }
  const [command] = argv
  if (!command) {
    log(HELP)
    return 1
  }
  log(`comando desconhecido: ${command}`)
  return 1
}

/** @returns {Promise<string>} */
async function readVersion() {
  const pkgUrl = new URL('../package.json', import.meta.url)
  const pkg = JSON.parse(await readFile(fileURLToPath(pkgUrl), 'utf8'))
  return pkg.version
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code })
}
```

- [ ] **Step 6: Rodar o teste para confirmar que passa**

Run: `node --test test/cli.test.js`
Expected: PASS — 3 testes

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore src/cli.js test/cli.test.js
git commit -m "feat(cli): add entrypoint with help and version"
```

---

## Task 2: Parse e serialização de frontmatter

**Files:**
- Create: `src/frontmatter.js`
- Test: `test/frontmatter.test.js`

**Interfaces:**
- Produces:
  - `parseFrontmatter(source: string): { attrs: Record<string, unknown>, body: string }` — `attrs` é `{}` quando não há frontmatter.
  - `serializeFrontmatter(attrs: Record<string, unknown>, body: string): string`

- [ ] **Step 1: Escrever o teste que falha**

`test/frontmatter.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFrontmatter, serializeFrontmatter } from '../src/frontmatter.js'

test('parseFrontmatter separa atributos do corpo', () => {
  const source = '---\nname: code-review\ndescription: Revisa código\n---\n# Título\n\nCorpo.\n'
  const { attrs, body } = parseFrontmatter(source)
  assert.deepEqual(attrs, { name: 'code-review', description: 'Revisa código' })
  assert.equal(body, '# Título\n\nCorpo.\n')
})

test('parseFrontmatter devolve attrs vazio quando não há frontmatter', () => {
  const { attrs, body } = parseFrontmatter('# Só corpo\n')
  assert.deepEqual(attrs, {})
  assert.equal(body, '# Só corpo\n')
})

test('parseFrontmatter preserva listas e objetos aninhados', () => {
  const source = "---\nname: x\ntools:\n  - Read\n  - Grep\ntargets:\n  copilot:\n    tools: ['search/codebase']\n---\nCorpo\n"
  const { attrs } = parseFrontmatter(source)
  assert.deepEqual(attrs.tools, ['Read', 'Grep'])
  assert.deepEqual(attrs.targets, { copilot: { tools: ['search/codebase'] } })
})

test('serializeFrontmatter é o inverso de parseFrontmatter', () => {
  const source = '---\nname: x\ndescription: y\n---\nCorpo\n'
  const { attrs, body } = parseFrontmatter(source)
  const roundTrip = parseFrontmatter(serializeFrontmatter(attrs, body))
  assert.deepEqual(roundTrip.attrs, attrs)
  assert.equal(roundTrip.body, body)
})

test('parseFrontmatter lança erro citando o YAML inválido', () => {
  assert.throws(
    () => parseFrontmatter('---\nname: [não fechado\n---\nCorpo\n'),
    /frontmatter YAML inválido/,
  )
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `node --test test/frontmatter.test.js`
Expected: FAIL — `Cannot find module '../src/frontmatter.js'`

- [ ] **Step 3: Implementar `src/frontmatter.js`**

```js
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const DELIMITER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * Separa o frontmatter YAML do corpo markdown.
 * @param {string} source conteúdo completo do arquivo
 * @returns {{ attrs: Record<string, unknown>, body: string }}
 * @throws {Error} quando o bloco de frontmatter existe mas o YAML é inválido
 */
export function parseFrontmatter(source) {
  const match = DELIMITER.exec(source)
  if (!match) return { attrs: {}, body: source }

  const [block, yamlText] = match
  try {
    const attrs = parseYaml(yamlText) ?? {}
    return { attrs, body: source.slice(block.length) }
  } catch (cause) {
    throw new Error(`frontmatter YAML inválido: ${cause.message}`, { cause })
  }
}

/**
 * Reconstrói um arquivo a partir de atributos e corpo.
 * @param {Record<string, unknown>} attrs
 * @param {string} body
 * @returns {string}
 */
export function serializeFrontmatter(attrs, body) {
  const yamlText = stringifyYaml(attrs).trimEnd()
  return `---\n${yamlText}\n---\n${body}`
}
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `node --test test/frontmatter.test.js`
Expected: PASS — 5 testes

- [ ] **Step 5: Commit**

```bash
git add src/frontmatter.js test/frontmatter.test.js
git commit -m "feat(frontmatter): parse and serialize YAML frontmatter"
```

---

## Task 3: Validação de frontmatter

Frontmatter inválido faz a skill **falhar silenciosamente no Copilot**. Esta validação transforma um bug invisível em erro legível no `add`.

**Files:**
- Create: `src/validate.js`
- Test: `test/validate.test.js`

**Interfaces:**
- Consumes: nada (funções puras sobre `attrs` já parseado).
- Produces:
  - `validateSkill(attrs: Record<string, unknown>, dirName: string): string[]` — lista de erros; `[]` significa válido.
  - `validateAgent(attrs: Record<string, unknown>, fileName: string): string[]`

- [ ] **Step 1: Escrever o teste que falha**

`test/validate.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateSkill, validateAgent } from '../src/validate.js'

test('validateSkill aceita frontmatter correto', () => {
  const attrs = { name: 'code-review', description: 'Revisa código antes do merge.' }
  assert.deepEqual(validateSkill(attrs, 'code-review'), [])
})

test('validateSkill exige name e description', () => {
  const errors = validateSkill({}, 'code-review')
  assert.equal(errors.length, 2)
  assert.match(errors.join(' '), /name.*obrigatório/)
  assert.match(errors.join(' '), /description.*obrigatório/)
})

test('validateSkill rejeita name diferente do nome da pasta', () => {
  const attrs = { name: 'outro-nome', description: 'x' }
  const errors = validateSkill(attrs, 'code-review')
  assert.equal(errors.length, 1)
  assert.match(errors[0], /name "outro-nome" difere da pasta "code-review"/)
})

test('validateSkill rejeita caracteres fora de [a-z0-9-]', () => {
  const errors = validateSkill({ name: 'Code_Review', description: 'x' }, 'Code_Review')
  assert.match(errors.join(' '), /apenas \[a-z0-9-\].*recebido "Code_Review"/)
})

test('validateSkill rejeita name acima de 64 caracteres', () => {
  const name = 'a'.repeat(65)
  const errors = validateSkill({ name, description: 'x' }, name)
  assert.match(errors.join(' '), /máximo 64 caracteres.*recebido 65/)
})

test('validateSkill rejeita description acima de 1024 caracteres', () => {
  const errors = validateSkill({ name: 'x', description: 'a'.repeat(1025) }, 'x')
  assert.match(errors.join(' '), /máximo 1024 caracteres.*recebido 1025/)
})

test('validateAgent exige description', () => {
  const errors = validateAgent({ name: 'reviewer' }, 'reviewer.md')
  assert.match(errors.join(' '), /description.*obrigatório/)
})

test('validateAgent aceita agent sem tools', () => {
  assert.deepEqual(validateAgent({ name: 'reviewer', description: 'Revisa.' }, 'reviewer.md'), [])
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `node --test test/validate.test.js`
Expected: FAIL — `Cannot find module '../src/validate.js'`

- [ ] **Step 3: Implementar `src/validate.js`**

```js
const NAME_PATTERN = /^[a-z0-9-]+$/
const NAME_MAX = 64
const DESCRIPTION_MAX = 1024

/**
 * Valida o frontmatter de um SKILL.md.
 * @param {Record<string, unknown>} attrs
 * @param {string} dirName nome da pasta que contém o SKILL.md
 * @returns {string[]} mensagens de erro; vazio quando válido
 */
export function validateSkill(attrs, dirName) {
  const errors = requireNameAndDescription(attrs)
  if (typeof attrs.name !== 'string') return errors

  errors.push(...checkNameShape(attrs.name))
  if (attrs.name !== dirName) {
    errors.push(`name "${attrs.name}" difere da pasta "${dirName}" — precisam ser iguais`)
  }
  return errors
}

/**
 * Valida o frontmatter de um agent.
 * @param {Record<string, unknown>} attrs
 * @param {string} fileName nome do arquivo, para a mensagem de erro
 * @returns {string[]}
 */
export function validateAgent(attrs, fileName) {
  const errors = []
  if (typeof attrs.description !== 'string' || attrs.description.length === 0) {
    errors.push(`${fileName}: campo "description" é obrigatório`)
  } else if (attrs.description.length > DESCRIPTION_MAX) {
    errors.push(`${fileName}: "description" tem máximo 1024 caracteres, recebido ${attrs.description.length}`)
  }
  return errors
}

/** @param {Record<string, unknown>} attrs @returns {string[]} */
function requireNameAndDescription(attrs) {
  const errors = []
  if (typeof attrs.name !== 'string' || attrs.name.length === 0) {
    errors.push('campo "name" é obrigatório')
  }
  if (typeof attrs.description !== 'string' || attrs.description.length === 0) {
    errors.push('campo "description" é obrigatório')
  } else if (attrs.description.length > DESCRIPTION_MAX) {
    errors.push(`"description" tem máximo 1024 caracteres, recebido ${attrs.description.length}`)
  }
  return errors
}

/** @param {string} name @returns {string[]} */
function checkNameShape(name) {
  const errors = []
  if (!NAME_PATTERN.test(name)) {
    errors.push(`"name" aceita apenas [a-z0-9-], recebido "${name}"`)
  }
  if (name.length > NAME_MAX) {
    errors.push(`"name" tem máximo 64 caracteres, recebido ${name.length}`)
  }
  return errors
}
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `node --test test/validate.test.js`
Expected: PASS — 8 testes

- [ ] **Step 5: Commit**

```bash
git add src/validate.js test/validate.test.js
git commit -m "feat(validate): validate skill and agent frontmatter"
```

---

## Task 4: Tabela e detecção de harnesses

**Files:**
- Create: `src/paths.js`
- Create: `src/harness.js`
- Test: `test/harness.test.js`

**Interfaces:**
- Produces:
  - `storePaths(homeDir: string): { store, repo, build, configFile, installedFile }` (todos `string`)
  - `HARNESSES: Record<HarnessId, HarnessSpec>` onde `HarnessId = 'claude'|'copilot'|'codex'|'gemini'` e
    `HarnessSpec = { id, root(homeDir), skillsDir(homeDir)|null, agentsDir(homeDir)|null, commandsDir(homeDir)|null, agentExt: string|null, contextFile(homeDir)|null }`
  - `detectHarnesses(homeDir: string): Promise<HarnessId[]>`
  - `resolveHarnesses(flag: string|undefined, homeDir: string): Promise<HarnessId[]>`

- [ ] **Step 1: Escrever o teste que falha**

`test/harness.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { HARNESSES, detectHarnesses, resolveHarnesses } from '../src/harness.js'
import { storePaths } from '../src/paths.js'

test('storePaths deriva todos os caminhos do home', () => {
  const p = storePaths('/home/x')
  assert.equal(p.store, path.join('/home/x', '.aec-skills'))
  assert.equal(p.repo, path.join('/home/x', '.aec-skills', 'repo'))
  assert.equal(p.build, path.join('/home/x', '.aec-skills', 'build'))
  assert.equal(p.configFile, path.join('/home/x', '.aec-skills', 'config.json'))
  assert.equal(p.installedFile, path.join('/home/x', '.aec-skills', 'installed.json'))
})

test('HARNESSES mapeia os quatro alvos com os paths documentados', () => {
  assert.deepEqual(Object.keys(HARNESSES).sort(), ['claude', 'codex', 'copilot', 'gemini'])
  assert.equal(HARNESSES.claude.skillsDir('/h'), path.join('/h', '.claude', 'skills'))
  assert.equal(HARNESSES.copilot.skillsDir('/h'), path.join('/h', '.copilot', 'skills'))
  assert.equal(HARNESSES.codex.skillsDir('/h'), path.join('/h', '.codex', 'skills'))
  assert.equal(HARNESSES.gemini.skillsDir, null)
  assert.equal(HARNESSES.copilot.agentExt, '.agent.md')
  assert.equal(HARNESSES.claude.agentExt, '.md')
  assert.equal(HARNESSES.codex.agentsDir, null)
  assert.equal(HARNESSES.gemini.contextFile('/h'), path.join('/h', '.gemini', 'GEMINI.md'))
})

test('detectHarnesses reconhece apenas os diretórios existentes', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'aec-home-'))
  await mkdir(path.join(home, '.claude'))
  await mkdir(path.join(home, '.copilot'))
  assert.deepEqual(await detectHarnesses(home), ['claude', 'copilot'])
})

test('detectHarnesses devolve lista vazia num home limpo', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'aec-home-'))
  assert.deepEqual(await detectHarnesses(home), [])
})

test('resolveHarnesses respeita a flag --harness', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'aec-home-'))
  await mkdir(path.join(home, '.claude'))
  assert.deepEqual(await resolveHarnesses('copilot,codex', home), ['copilot', 'codex'])
})

test('resolveHarnesses rejeita harness desconhecido citando o valor', async () => {
  await assert.rejects(
    () => resolveHarnesses('cursor', '/h'),
    /harness desconhecido: "cursor".*claude, codex, copilot, gemini/s,
  )
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `node --test test/harness.test.js`
Expected: FAIL — `Cannot find module '../src/harness.js'`

- [ ] **Step 3: Implementar `src/paths.js`**

```js
import path from 'node:path'

/**
 * Caminhos do store, derivados do diretório home.
 * @param {string} homeDir
 * @returns {{ store: string, repo: string, build: string, configFile: string, installedFile: string }}
 */
export function storePaths(homeDir) {
  const store = path.join(homeDir, '.aec-skills')
  return {
    store,
    repo: path.join(store, 'repo'),
    build: path.join(store, 'build'),
    configFile: path.join(store, 'config.json'),
    installedFile: path.join(store, 'installed.json'),
  }
}
```

- [ ] **Step 4: Implementar `src/harness.js`**

```js
import { access } from 'node:fs/promises'
import path from 'node:path'

/** @typedef {'claude'|'copilot'|'codex'|'gemini'} HarnessId */

/**
 * Tabela dos harnesses suportados. Campos `null` significam
 * "o harness não tem esse conceito" — ver o spec, seção Adaptadores.
 */
export const HARNESSES = {
  claude: {
    id: 'claude',
    root: (h) => path.join(h, '.claude'),
    skillsDir: (h) => path.join(h, '.claude', 'skills'),
    agentsDir: (h) => path.join(h, '.claude', 'agents'),
    commandsDir: (h) => path.join(h, '.claude', 'commands'),
    agentExt: '.md',
    contextFile: null,
  },
  copilot: {
    id: 'copilot',
    root: (h) => path.join(h, '.copilot'),
    skillsDir: (h) => path.join(h, '.copilot', 'skills'),
    agentsDir: (h) => path.join(h, '.copilot', 'agents'),
    commandsDir: null,
    agentExt: '.agent.md',
    contextFile: null,
  },
  codex: {
    id: 'codex',
    root: (h) => path.join(h, '.codex'),
    skillsDir: (h) => path.join(h, '.codex', 'skills'),
    agentsDir: null,
    commandsDir: null,
    agentExt: null,
    contextFile: null,
  },
  gemini: {
    id: 'gemini',
    root: (h) => path.join(h, '.gemini'),
    skillsDir: null,
    agentsDir: null,
    commandsDir: (h) => path.join(h, '.gemini', 'commands'),
    agentExt: null,
    contextFile: (h) => path.join(h, '.gemini', 'GEMINI.md'),
  },
}

/**
 * Um harness é considerado presente quando seu diretório raiz existe.
 * @param {string} homeDir
 * @returns {Promise<HarnessId[]>}
 */
export async function detectHarnesses(homeDir) {
  const ids = Object.keys(HARNESSES)
  const present = await Promise.all(ids.map((id) => exists(HARNESSES[id].root(homeDir))))
  return ids.filter((_, i) => present[i])
}

/**
 * Resolve a lista de harnesses alvo: a flag `--harness` vence a detecção.
 * @param {string|undefined} flag lista separada por vírgula
 * @param {string} homeDir
 * @returns {Promise<HarnessId[]>}
 * @throws {Error} quando a flag cita um harness inexistente
 */
export async function resolveHarnesses(flag, homeDir) {
  if (!flag) return detectHarnesses(homeDir)

  const known = Object.keys(HARNESSES).sort()
  const requested = flag.split(',').map((s) => s.trim()).filter(Boolean)
  for (const id of requested) {
    if (!known.includes(id)) {
      throw new Error(`harness desconhecido: "${id}"\nsuportados: ${known.join(', ')}`)
    }
  }
  return requested
}

/** @param {string} dir @returns {Promise<boolean>} */
async function exists(dir) {
  try {
    await access(dir)
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 5: Rodar o teste para confirmar que passa**

Run: `node --test test/harness.test.js`
Expected: PASS — 6 testes

- [ ] **Step 6: Commit**

```bash
git add src/paths.js src/harness.js test/harness.test.js
git commit -m "feat(harness): add harness table and autodetection"
```

---

## Task 5: Linker — junction, symlink e fallback de cópia

O módulo mais arriscado: é o único que escreve fora do store. Testado contra disco real num HOME temporário — mockar `fs` testaria o mock, não o comportamento do Windows.

**Files:**
- Create: `src/linker.js`
- Create: `test/helpers/tmp-home.js`
- Test: `test/linker.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `linkPath(source: string, dest: string): Promise<'link'|'copy'>` — cria o link; se o SO recusar, copia. Lança `DestinationOccupiedError` se `dest` existe e não aponta para `source`.
  - `unlinkPath(dest: string, source: string): Promise<boolean>` — remove apenas se for nosso; `false` se não era nosso ou não existia.
  - `class DestinationOccupiedError extends Error` com `.dest: string`

- [ ] **Step 1: Escrever o helper de HOME temporário**

`test/helpers/tmp-home.js`:

```js
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * Cria um diretório temporário real e registra a limpeza no contexto do teste.
 * @param {import('node:test').TestContext} t
 * @returns {Promise<string>}
 */
export async function tmpHome(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'aec-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}
```

- [ ] **Step 2: Escrever o teste que falha**

`test/linker.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile, stat, lstat } from 'node:fs/promises'
import path from 'node:path'
import { linkPath, unlinkPath, DestinationOccupiedError } from '../src/linker.js'
import { tmpHome } from './helpers/tmp-home.js'

test('linkPath liga um diretório e o conteúdo fica legível pelo destino', async (t) => {
  const home = await tmpHome(t)
  const source = path.join(home, 'store', 'code-review')
  await mkdir(source, { recursive: true })
  await writeFile(path.join(source, 'SKILL.md'), 'conteúdo')

  const dest = path.join(home, '.claude', 'skills', 'code-review')
  const mode = await linkPath(source, dest)

  assert.ok(mode === 'link' || mode === 'copy')
  assert.equal(await readFile(path.join(dest, 'SKILL.md'), 'utf8'), 'conteúdo')
})

test('linkPath cria os diretórios-pai que faltam', async (t) => {
  const home = await tmpHome(t)
  const source = path.join(home, 'store', 'x')
  await mkdir(source, { recursive: true })
  const dest = path.join(home, '.copilot', 'skills', 'x')

  await linkPath(source, dest)
  assert.ok((await stat(path.join(home, '.copilot', 'skills'))).isDirectory())
})

test('linkPath é idempotente: religar o mesmo par não falha', async (t) => {
  const home = await tmpHome(t)
  const source = path.join(home, 'store', 'x')
  await mkdir(source, { recursive: true })
  const dest = path.join(home, '.claude', 'skills', 'x')

  await linkPath(source, dest)
  await linkPath(source, dest)
  assert.ok(await lstat(dest))
})

test('linkPath recusa destino ocupado por conteúdo do usuário', async (t) => {
  const home = await tmpHome(t)
  const source = path.join(home, 'store', 'x')
  await mkdir(source, { recursive: true })

  const dest = path.join(home, '.claude', 'skills', 'x')
  await mkdir(dest, { recursive: true })
  await writeFile(path.join(dest, 'SKILL.md'), 'do usuário')

  await assert.rejects(() => linkPath(source, dest), DestinationOccupiedError)
  assert.equal(await readFile(path.join(dest, 'SKILL.md'), 'utf8'), 'do usuário')
})

test('unlinkPath remove o que é nosso', async (t) => {
  const home = await tmpHome(t)
  const source = path.join(home, 'store', 'x')
  await mkdir(source, { recursive: true })
  const dest = path.join(home, '.claude', 'skills', 'x')
  await linkPath(source, dest)

  assert.equal(await unlinkPath(dest, source), true)
  await assert.rejects(() => lstat(dest))
})

test('unlinkPath não remove conteúdo do usuário', async (t) => {
  const home = await tmpHome(t)
  const source = path.join(home, 'store', 'x')
  await mkdir(source, { recursive: true })
  const dest = path.join(home, '.claude', 'skills', 'x')
  await mkdir(dest, { recursive: true })
  await writeFile(path.join(dest, 'SKILL.md'), 'do usuário')

  assert.equal(await unlinkPath(dest, source), false)
  assert.equal(await readFile(path.join(dest, 'SKILL.md'), 'utf8'), 'do usuário')
})

test('unlinkPath devolve false quando o destino não existe', async (t) => {
  const home = await tmpHome(t)
  assert.equal(await unlinkPath(path.join(home, 'nada'), path.join(home, 'src')), false)
})
```

- [ ] **Step 3: Rodar o teste para confirmar que falha**

Run: `node --test test/linker.test.js`
Expected: FAIL — `Cannot find module '../src/linker.js'`

- [ ] **Step 4: Implementar `src/linker.js`**

```js
import { cp, lstat, mkdir, readlink, realpath, rm, symlink } from 'node:fs/promises'
import path from 'node:path'

/** Destino existe e não foi criado por nós — nunca sobrescrever. */
export class DestinationOccupiedError extends Error {
  /** @param {string} dest */
  constructor(dest) {
    super(`destino já existe e não foi criado pelo aec-skills: ${dest}`)
    this.name = 'DestinationOccupiedError'
    this.dest = dest
  }
}

/**
 * Liga `source` em `dest`. Usa junction no Windows (não exige privilégio de
 * administrador) e symlink nos demais SOs. Se o SO recusar o link (EPERM),
 * cai para cópia — o chamador registra o modo em installed.json.
 * @param {string} source caminho absoluto dentro do store
 * @param {string} dest caminho absoluto no harness
 * @returns {Promise<'link'|'copy'>}
 * @throws {DestinationOccupiedError} quando `dest` existe e não aponta para `source`
 */
export async function linkPath(source, dest) {
  if (await pointsTo(dest, source)) return 'link'
  if (await pathExists(dest)) throw new DestinationOccupiedError(dest)

  await mkdir(path.dirname(dest), { recursive: true })
  try {
    await symlink(source, dest, await linkType(source))
    return 'link'
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error
    await cp(source, dest, { recursive: true })
    return 'copy'
  }
}

/**
 * Remove `dest` apenas se ele for um link nosso apontando para `source`.
 * Cópias de fallback também são removidas (o chamador só chama para o que registrou).
 * @param {string} dest
 * @param {string} source
 * @returns {Promise<boolean>} true se removeu
 */
export async function unlinkPath(dest, source) {
  if (!(await pointsTo(dest, source))) return false
  await rm(dest, { recursive: true, force: true })
  return true
}

/** @param {string} source @returns {Promise<'junction'|'dir'|'file'>} */
async function linkType(source) {
  const info = await lstat(source)
  if (!info.isDirectory()) return 'file'
  return process.platform === 'win32' ? 'junction' : 'dir'
}

/** @param {string} dest @param {string} source @returns {Promise<boolean>} */
async function pointsTo(dest, source) {
  try {
    const info = await lstat(dest)
    if (!info.isSymbolicLink()) return false
    const target = await readlink(dest)
    return path.resolve(await realpath(target)) === path.resolve(await realpath(source))
  } catch {
    return false
  }
}

/** @param {string} target @returns {Promise<boolean>} */
async function pathExists(target) {
  try {
    await lstat(target)
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 5: Rodar o teste para confirmar que passa**

Run: `node --test test/linker.test.js`
Expected: PASS — 7 testes

- [ ] **Step 6: Commit**

```bash
git add src/linker.js test/linker.test.js test/helpers/tmp-home.js
git commit -m "feat(linker): link with junction fallback and safe unlink"
```

---

## Task 6: Merge de bloco marcado (texto e JSON)

`GEMINI.md` e `settings.json` podem conter conteúdo do usuário. Nunca sobrescrevemos o arquivo — reescrevemos só o que é nosso.

**Files:**
- Create: `src/merge-block.js`
- Test: `test/merge-block.test.js`

**Interfaces:**
- Produces:
  - `BLOCK_START: string`, `BLOCK_END: string` (marcadores literais)
  - `mergeTextBlock(existing: string, block: string): string` — insere ou substitui o bloco marcado
  - `removeTextBlock(existing: string): string`
  - `mergeJsonHooks(settings: object, fragment: object): object` — adiciona entradas ausentes, sem duplicar
  - `removeJsonHooks(settings: object, fragment: object): object`

- [ ] **Step 1: Escrever o teste que falha**

`test/merge-block.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BLOCK_START, BLOCK_END,
  mergeTextBlock, removeTextBlock, mergeJsonHooks, removeJsonHooks,
} from '../src/merge-block.js'

test('mergeTextBlock anexa o bloco quando o arquivo não o tem', () => {
  const result = mergeTextBlock('# Meu contexto\n', 'CONTEUDO')
  assert.match(result, /^# Meu contexto\n/)
  assert.ok(result.includes(BLOCK_START))
  assert.ok(result.includes('CONTEUDO'))
  assert.ok(result.includes(BLOCK_END))
})

test('mergeTextBlock substitui o bloco existente e preserva o resto', () => {
  const existing = `# Topo\n\n${BLOCK_START}\nANTIGO\n${BLOCK_END}\n\n# Rodapé\n`
  const result = mergeTextBlock(existing, 'NOVO')
  assert.ok(result.includes('NOVO'))
  assert.ok(!result.includes('ANTIGO'))
  assert.ok(result.includes('# Topo'))
  assert.ok(result.includes('# Rodapé'))
})

test('mergeTextBlock é idempotente', () => {
  const once = mergeTextBlock('# Topo\n', 'X')
  assert.equal(mergeTextBlock(once, 'X'), once)
})

test('removeTextBlock apaga o bloco e preserva o resto', () => {
  const existing = `# Topo\n\n${BLOCK_START}\nX\n${BLOCK_END}\n\n# Rodapé\n`
  const result = removeTextBlock(existing)
  assert.ok(!result.includes(BLOCK_START))
  assert.ok(result.includes('# Topo'))
  assert.ok(result.includes('# Rodapé'))
})

test('mergeJsonHooks adiciona a entrada preservando as do usuário', () => {
  const settings = { hooks: { SessionStart: [{ command: 'do-usuario' }] } }
  const fragment = { hooks: { SessionStart: [{ command: 'aec' }] } }
  const result = mergeJsonHooks(settings, fragment)
  assert.deepEqual(result.hooks.SessionStart, [{ command: 'do-usuario' }, { command: 'aec' }])
})

test('mergeJsonHooks não duplica quando a entrada já existe', () => {
  const settings = { hooks: { SessionStart: [{ command: 'aec' }] } }
  const fragment = { hooks: { SessionStart: [{ command: 'aec' }] } }
  assert.deepEqual(mergeJsonHooks(settings, fragment).hooks.SessionStart, [{ command: 'aec' }])
})

test('mergeJsonHooks cria a chave quando o settings está vazio', () => {
  const result = mergeJsonHooks({}, { hooks: { SessionStart: [{ command: 'aec' }] } })
  assert.deepEqual(result.hooks.SessionStart, [{ command: 'aec' }])
})

test('removeJsonHooks remove só a nossa entrada', () => {
  const settings = { hooks: { SessionStart: [{ command: 'do-usuario' }, { command: 'aec' }] } }
  const fragment = { hooks: { SessionStart: [{ command: 'aec' }] } }
  const result = removeJsonHooks(settings, fragment)
  assert.deepEqual(result.hooks.SessionStart, [{ command: 'do-usuario' }])
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `node --test test/merge-block.test.js`
Expected: FAIL — `Cannot find module '../src/merge-block.js'`

- [ ] **Step 3: Implementar `src/merge-block.js`**

```js
import { isDeepStrictEqual } from 'node:util'

export const BLOCK_START = '<!-- aec-skills:start -->'
export const BLOCK_END = '<!-- aec-skills:end -->'

const BLOCK_PATTERN = new RegExp(`${escapeRegExp(BLOCK_START)}[\\s\\S]*?${escapeRegExp(BLOCK_END)}\\n?`)

/**
 * Insere ou substitui o bloco marcado, preservando todo o resto do arquivo.
 * @param {string} existing conteúdo atual ('' se o arquivo não existe)
 * @param {string} block conteúdo a colocar entre os marcadores
 * @returns {string}
 */
export function mergeTextBlock(existing, block) {
  const marked = `${BLOCK_START}\n${block}\n${BLOCK_END}\n`
  if (BLOCK_PATTERN.test(existing)) return existing.replace(BLOCK_PATTERN, marked)

  const base = existing.length > 0 && !existing.endsWith('\n') ? `${existing}\n` : existing
  return `${base}\n${marked}`
}

/**
 * Remove o bloco marcado, preservando o resto.
 * @param {string} existing
 * @returns {string}
 */
export function removeTextBlock(existing) {
  return existing.replace(BLOCK_PATTERN, '')
}

/**
 * Adiciona as entradas de hook do fragmento ao settings, sem duplicar e sem
 * remover as entradas do usuário.
 * @param {Record<string, unknown>} settings
 * @param {{ hooks: Record<string, object[]> }} fragment
 * @returns {Record<string, unknown>} novo objeto; o original não é mutado
 */
export function mergeJsonHooks(settings, fragment) {
  const merged = structuredClone(settings)
  merged.hooks ??= {}

  for (const [event, entries] of Object.entries(fragment.hooks)) {
    const current = merged.hooks[event] ?? []
    const missing = entries.filter((e) => !current.some((c) => isDeepStrictEqual(c, e)))
    merged.hooks[event] = [...current, ...missing]
  }
  return merged
}

/**
 * Remove do settings exatamente as entradas do fragmento.
 * @param {Record<string, unknown>} settings
 * @param {{ hooks: Record<string, object[]> }} fragment
 * @returns {Record<string, unknown>}
 */
export function removeJsonHooks(settings, fragment) {
  const merged = structuredClone(settings)
  if (!merged.hooks) return merged

  for (const [event, entries] of Object.entries(fragment.hooks)) {
    const current = merged.hooks[event] ?? []
    merged.hooks[event] = current.filter((c) => !entries.some((e) => isDeepStrictEqual(c, e)))
  }
  return merged
}

/** @param {string} text @returns {string} */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `node --test test/merge-block.test.js`
Expected: PASS — 8 testes

- [ ] **Step 5: Commit**

```bash
git add src/merge-block.js test/merge-block.test.js
git commit -m "feat(merge): merge marked blocks in text and json without overwriting"
```

---

## Task 7: Inventário da biblioteca

**Files:**
- Create: `src/library.js`
- Test: `test/library.test.js`

**Interfaces:**
- Consumes: `parseFrontmatter` (Task 2), `validateSkill`/`validateAgent` (Task 3).
- Produces:
  - `@typedef {{ kind: 'skill'|'agent'|'command'|'hook', name: string, sourcePath: string, attrs: Record<string, unknown>, body: string, errors: string[] }} Artifact`
  - `readLibrary(repoDir: string): Promise<Artifact[]>` — ordenado por `kind` e depois `name`. Artefato com frontmatter inválido vem com `errors` preenchido, não lança.
  - `findArtifact(artifacts: Artifact[], name: string): Artifact|undefined`

- [ ] **Step 1: Escrever o teste que falha**

`test/library.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readLibrary, findArtifact } from '../src/library.js'
import { tmpHome } from './helpers/tmp-home.js'

/** @param {string} repo */
async function seedRepo(repo) {
  await mkdir(path.join(repo, 'skills', 'code-review'), { recursive: true })
  await writeFile(
    path.join(repo, 'skills', 'code-review', 'SKILL.md'),
    '---\nname: code-review\ndescription: Revisa código.\n---\n# Revisão\n',
  )
  await mkdir(path.join(repo, 'agents'), { recursive: true })
  await writeFile(
    path.join(repo, 'agents', 'reviewer.md'),
    '---\nname: reviewer\ndescription: Revisor.\ntools: Read, Grep\n---\n# Revisor\n',
  )
  await mkdir(path.join(repo, 'commands'), { recursive: true })
  await writeFile(path.join(repo, 'commands', 'deepdive.md'), '---\ndescription: Análise.\n---\nAnalise fundo.\n')
}

test('readLibrary encontra skills, agents e commands', async (t) => {
  const repo = await tmpHome(t)
  await seedRepo(repo)

  const artifacts = await readLibrary(repo)
  assert.deepEqual(artifacts.map((a) => `${a.kind}:${a.name}`), [
    'agent:reviewer',
    'command:deepdive',
    'skill:code-review',
  ])
})

test('readLibrary preenche attrs, body e sourcePath', async (t) => {
  const repo = await tmpHome(t)
  await seedRepo(repo)

  const skill = findArtifact(await readLibrary(repo), 'code-review')
  assert.equal(skill.attrs.description, 'Revisa código.')
  assert.equal(skill.body, '# Revisão\n')
  assert.equal(skill.sourcePath, path.join(repo, 'skills', 'code-review'))
  assert.deepEqual(skill.errors, [])
})

test('readLibrary reporta erro de validação sem lançar', async (t) => {
  const repo = await tmpHome(t)
  await mkdir(path.join(repo, 'skills', 'quebrada'), { recursive: true })
  await writeFile(path.join(repo, 'skills', 'quebrada', 'SKILL.md'), '---\nname: outro\n---\nCorpo\n')

  const artifacts = await readLibrary(repo)
  assert.equal(artifacts.length, 1)
  assert.ok(artifacts[0].errors.length > 0)
  assert.match(artifacts[0].errors.join(' '), /difere da pasta/)
})

test('readLibrary devolve lista vazia num repo sem artefatos', async (t) => {
  const repo = await tmpHome(t)
  assert.deepEqual(await readLibrary(repo), [])
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `node --test test/library.test.js`
Expected: FAIL — `Cannot find module '../src/library.js'`

- [ ] **Step 3: Implementar `src/library.js`**

```js
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseFrontmatter } from './frontmatter.js'
import { validateSkill, validateAgent } from './validate.js'

/**
 * @typedef {object} Artifact
 * @property {'skill'|'agent'|'command'|'hook'} kind
 * @property {string} name
 * @property {string} sourcePath diretório (skill, hook) ou arquivo (agent, command)
 * @property {Record<string, unknown>} attrs
 * @property {string} body
 * @property {string[]} errors vazio quando o artefato é válido
 */

/**
 * Lê o inventário completo do clone. Artefato inválido é devolvido com `errors`
 * preenchido — quem decide o que fazer é o comando `add`.
 * @param {string} repoDir raiz do clone (`~/.aec-skills/repo`)
 * @returns {Promise<Artifact[]>} ordenado por kind, depois name
 */
export async function readLibrary(repoDir) {
  const artifacts = [
    ...(await readSkills(path.join(repoDir, 'skills'))),
    ...(await readMarkdownDir(path.join(repoDir, 'agents'), 'agent')),
    ...(await readMarkdownDir(path.join(repoDir, 'commands'), 'command')),
    ...(await readHooks(path.join(repoDir, 'hooks'))),
  ]
  return artifacts.sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`))
}

/**
 * @param {Artifact[]} artifacts
 * @param {string} name
 * @returns {Artifact|undefined}
 */
export function findArtifact(artifacts, name) {
  return artifacts.find((a) => a.name === name)
}

/** @param {string} dir @returns {Promise<Artifact[]>} */
async function readSkills(dir) {
  const names = await listDirs(dir)
  const artifacts = []
  for (const name of names) {
    const skillFile = path.join(dir, name, 'SKILL.md')
    const parsed = await readArtifactFile(skillFile)
    if (!parsed) continue
    artifacts.push({
      kind: 'skill',
      name,
      sourcePath: path.join(dir, name),
      ...parsed,
      errors: validateSkill(parsed.attrs, name),
    })
  }
  return artifacts
}

/** @param {string} dir @param {'agent'|'command'} kind @returns {Promise<Artifact[]>} */
async function readMarkdownDir(dir, kind) {
  const files = (await listFiles(dir)).filter((f) => f.endsWith('.md'))
  const artifacts = []
  for (const file of files) {
    const parsed = await readArtifactFile(path.join(dir, file))
    if (!parsed) continue
    const name = file.replace(/\.md$/, '')
    artifacts.push({
      kind,
      name,
      sourcePath: path.join(dir, file),
      ...parsed,
      errors: kind === 'agent' ? validateAgent(parsed.attrs, file) : [],
    })
  }
  return artifacts
}

/** @param {string} dir @returns {Promise<Artifact[]>} */
async function readHooks(dir) {
  const names = await listDirs(dir)
  return names.map((name) => ({
    kind: 'hook',
    name,
    sourcePath: path.join(dir, name),
    attrs: {},
    body: '',
    errors: [],
  }))
}

/** @param {string} file @returns {Promise<{attrs: Record<string, unknown>, body: string}|null>} */
async function readArtifactFile(file) {
  try {
    return parseFrontmatter(await readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

/** @param {string} dir @returns {Promise<string[]>} */
async function listDirs(dir) {
  const entries = await readdirSafe(dir)
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

/** @param {string} dir @returns {Promise<string[]>} */
async function listFiles(dir) {
  const entries = await readdirSafe(dir)
  return entries.filter((e) => e.isFile()).map((e) => e.name)
}

/** @param {string} dir @returns {Promise<import('node:fs').Dirent[]>} */
async function readdirSafe(dir) {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `node --test test/library.test.js`
Expected: PASS — 4 testes

- [ ] **Step 5: Commit**

```bash
git add src/library.js test/library.test.js
git commit -m "feat(library): read artifact inventory from the cloned repo"
```

---

## Task 8: Adaptadores

Funções puras: entra artefato, sai o arquivo do harness. Sem I/O. É onde mora a lógica de conversão — e onde ficam a maioria dos testes.

**Files:**
- Create: `src/adapters/copilot-agent.js`
- Create: `src/adapters/gemini-index.js`
- Create: `src/adapters/gemini-command.js`
- Test: `test/adapters.test.js`

**Interfaces:**
- Consumes: `Artifact` (Task 7), `serializeFrontmatter` (Task 2).
- Produces:
  - `toCopilotAgent(agent: Artifact): string` — conteúdo do `.agent.md`
  - `toGeminiIndex(skills: Artifact[], repoDir: string): string` — corpo do bloco marcado
  - `toGeminiCommand(command: Artifact): string` — conteúdo do `.toml`

**Regra do `tools`, decidida no spec:** as taxonomias de tools do Claude e do Copilot são diferentes (`Read`/`Grep`/`Bash` vs `search/codebase`/`web/fetch`). Traduzir por tabela produziria uma allowlist errada em ambos os sentidos. Portanto: **`tools` é omitido no build do Copilot** (omitido = todas as tools, o default documentado), **exceto** quando o agent declara `targets.copilot.tools` explicitamente.

- [ ] **Step 1: Escrever o teste que falha**

`test/adapters.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { toCopilotAgent } from '../src/adapters/copilot-agent.js'
import { toGeminiIndex } from '../src/adapters/gemini-index.js'
import { toGeminiCommand } from '../src/adapters/gemini-command.js'
import { parseFrontmatter } from '../src/frontmatter.js'

/** @returns {import('../src/library.js').Artifact} */
function agentFixture(attrs) {
  return { kind: 'agent', name: 'reviewer', sourcePath: '/x/reviewer.md', attrs, body: '# Revisor\n', errors: [] }
}

test('toCopilotAgent omite tools quando não há override', () => {
  const agent = agentFixture({ name: 'reviewer', description: 'Revisa.', tools: 'Read, Grep, Bash' })
  const { attrs, body } = parseFrontmatter(toCopilotAgent(agent))

  assert.equal(attrs.tools, undefined)
  assert.equal(attrs.description, 'Revisa.')
  assert.equal(attrs.name, 'reviewer')
  assert.equal(body, '# Revisor\n')
})

test('toCopilotAgent usa targets.copilot.tools quando declarado', () => {
  const agent = agentFixture({
    name: 'reviewer',
    description: 'Revisa.',
    tools: 'Read, Grep',
    targets: { copilot: { tools: ['search/codebase', 'search/usages'] } },
  })
  const { attrs } = parseFrontmatter(toCopilotAgent(agent))
  assert.deepEqual(attrs.tools, ['search/codebase', 'search/usages'])
})

test('toCopilotAgent nunca emite o campo targets no arquivo final', () => {
  const agent = agentFixture({
    name: 'reviewer',
    description: 'Revisa.',
    targets: { copilot: { tools: ['search/codebase'] } },
  })
  const { attrs } = parseFrontmatter(toCopilotAgent(agent))
  assert.equal(attrs.targets, undefined)
})

test('toCopilotAgent preserva model quando presente', () => {
  const agent = agentFixture({ name: 'r', description: 'd', model: 'opus' })
  const { attrs } = parseFrontmatter(toCopilotAgent(agent))
  assert.equal(attrs.model, 'opus')
})

test('toGeminiIndex lista nome, descrição e caminho de cada skill', () => {
  const skills = [
    { kind: 'skill', name: 'code-review', sourcePath: '/store/repo/skills/code-review',
      attrs: { name: 'code-review', description: 'Revisa código.' }, body: '', errors: [] },
    { kind: 'skill', name: 'diagnose', sourcePath: '/store/repo/skills/diagnose',
      attrs: { name: 'diagnose', description: 'Erro sem stack trace.' }, body: '', errors: [] },
  ]
  const index = toGeminiIndex(skills, '/store/repo')

  assert.match(index, /## Skills disponíveis/)
  assert.match(index, /\*\*code-review\*\* — Revisa código\./)
  assert.match(index, /skills\/code-review\/SKILL\.md/)
  assert.match(index, /\*\*diagnose\*\* — Erro sem stack trace\./)
})

test('toGeminiIndex não inclui o corpo das skills, só o índice', () => {
  const skills = [{
    kind: 'skill', name: 'x', sourcePath: '/store/repo/skills/x',
    attrs: { name: 'x', description: 'd' }, body: 'CORPO ENORME DA SKILL', errors: [],
  }]
  assert.ok(!toGeminiIndex(skills, '/store/repo').includes('CORPO ENORME DA SKILL'))
})

test('toGeminiIndex devolve aviso quando não há skills', () => {
  assert.match(toGeminiIndex([], '/store/repo'), /Nenhuma skill instalada/)
})

test('toGeminiCommand gera TOML com prompt e description', () => {
  const command = {
    kind: 'command', name: 'deepdive', sourcePath: '/x/deepdive.md',
    attrs: { description: 'Análise profunda.' }, body: 'Analise a fundo.\n', errors: [],
  }
  const toml = toGeminiCommand(command)
  assert.match(toml, /^description = "Análise profunda\."$/m)
  assert.match(toml, /prompt = """/)
  assert.match(toml, /Analise a fundo\./)
})

test('toGeminiCommand escapa aspas na description', () => {
  const command = {
    kind: 'command', name: 'x', sourcePath: '/x.md',
    attrs: { description: 'Diz "olá".' }, body: 'corpo\n', errors: [],
  }
  assert.match(toGeminiCommand(command), /description = "Diz \\"olá\\"\."/)
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `node --test test/adapters.test.js`
Expected: FAIL — `Cannot find module '../src/adapters/copilot-agent.js'`

- [ ] **Step 3: Implementar `src/adapters/copilot-agent.js`**

```js
import { serializeFrontmatter } from '../frontmatter.js'

/**
 * Converte um agent do Claude Code para o formato `.agent.md` do Copilot.
 *
 * `tools` é omitido de propósito: as taxonomias de tools dos dois harnesses são
 * diferentes (`Read`/`Grep`/`Bash` vs `search/codebase`/`web/fetch`) e uma tradução
 * parcial produziria uma allowlist errada — restritiva demais ou permissiva demais.
 * Omitido significa "todas as tools", que é o default documentado do Copilot.
 * Quem precisa de controle fino declara `targets.copilot.tools` no próprio agent.
 *
 * @param {import('../library.js').Artifact} agent
 * @returns {string} conteúdo do arquivo `.agent.md`
 */
export function toCopilotAgent(agent) {
  const { targets, tools, ...rest } = agent.attrs
  const override = targets?.copilot?.tools

  const attrs = { ...rest }
  if (override) attrs.tools = override

  return serializeFrontmatter(attrs, agent.body)
}
```

- [ ] **Step 4: Implementar `src/adapters/gemini-index.js`**

```js
import path from 'node:path'

/**
 * Gera o índice de skills para o bloco marcado do GEMINI.md.
 *
 * O GEMINI.md é injetado em TODO prompt — importar o corpo das skills colocaria
 * todas elas dentro de cada requisição. Por isso o bloco carrega apenas nome,
 * descrição e caminho, e instrui o Gemini a ler o arquivo sob demanda. Emula o
 * carregamento progressivo que os outros harnesses têm nativo.
 *
 * @param {import('../library.js').Artifact[]} skills
 * @param {string} repoDir raiz do clone, para montar os caminhos absolutos
 * @returns {string} corpo do bloco (sem os marcadores)
 */
export function toGeminiIndex(skills, repoDir) {
  if (skills.length === 0) return '## Skills disponíveis\n\nNenhuma skill instalada.'

  const lines = skills.map((skill) => {
    const file = path.join(repoDir, 'skills', skill.name, 'SKILL.md')
    return `- **${skill.name}** — ${skill.attrs.description}\n  → \`${file}\``
  })

  return [
    '## Skills disponíveis',
    '',
    'Quando a tarefa casar com uma descrição abaixo, leia o arquivo indicado antes de agir.',
    '',
    ...lines,
  ].join('\n')
}
```

- [ ] **Step 5: Implementar `src/adapters/gemini-command.js`**

```js
/**
 * Converte um command markdown para o formato `.toml` do Gemini CLI.
 * O campo `prompt` é obrigatório no Gemini; `description` é opcional.
 * @param {import('../library.js').Artifact} command
 * @returns {string} conteúdo do arquivo `.toml`
 */
export function toGeminiCommand(command) {
  const lines = []
  if (typeof command.attrs.description === 'string') {
    lines.push(`description = "${escapeToml(command.attrs.description)}"`)
  }
  lines.push('prompt = """')
  lines.push(command.body.trimEnd())
  lines.push('"""')
  return `${lines.join('\n')}\n`
}

/** @param {string} text @returns {string} */
function escapeToml(text) {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
```

- [ ] **Step 6: Rodar o teste para confirmar que passa**

Run: `node --test test/adapters.test.js`
Expected: PASS — 9 testes

- [ ] **Step 7: Commit**

```bash
git add src/adapters test/adapters.test.js
git commit -m "feat(adapters): convert agents to copilot and skills to gemini index"
```

---

## Task 9: GitStore e o fake para os testes

Único módulo que executa `git`. Tudo o mais consome a interface — e o fake permite testar `status`/`update` sem rede.

**Files:**
- Create: `src/git-store.js`
- Create: `test/helpers/fake-git-store.js`
- Test: `test/git-store.test.js`

**Interfaces:**
- Produces:
  - `class GitStore` com: `clone(remoteUrl: string, token: string): Promise<void>`, `fetch(): Promise<void>`, `pull(): Promise<void>`, `head(): Promise<string>`, `remoteHead(): Promise<string>`, `changedFiles(): Promise<string[]>` (entre `HEAD` e `origin/HEAD`), `locallyModified(): Promise<string[]>` (do `git status --porcelain`), `isClone(): Promise<boolean>`
  - `class GitNotInstalledError extends Error`
  - `class FakeGitStore` (em `test/helpers/`) — mesma interface, sem rede.

- [ ] **Step 1: Escrever o fake**

`test/helpers/fake-git-store.js`:

```js
/** Implementação de GitStore em memória, para testes. Sem rede, sem git. */
export class FakeGitStore {
  /**
   * @param {{ head?: string, remoteHead?: string, changed?: string[], modified?: string[], cloned?: boolean }} [state]
   */
  constructor(state = {}) {
    this.state = {
      head: 'aaaa111',
      remoteHead: 'aaaa111',
      changed: [],
      modified: [],
      cloned: true,
      ...state,
    }
    this.calls = []
  }

  async clone(remoteUrl, _token) { this.calls.push(`clone:${remoteUrl}`); this.state.cloned = true }
  async fetch() { this.calls.push('fetch') }
  async pull() { this.calls.push('pull'); this.state.head = this.state.remoteHead; this.state.changed = [] }
  async head() { return this.state.head }
  async remoteHead() { return this.state.remoteHead }
  async changedFiles() { return this.state.changed }
  async locallyModified() { return this.state.modified }
  async isClone() { return this.state.cloned }
}
```

- [ ] **Step 2: Escrever o teste que falha**

`test/git-store.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { GitStore } from '../src/git-store.js'
import { tmpHome } from './helpers/tmp-home.js'

const run = promisify(execFile)

test('isClone devolve false quando o diretório não é um repositório', async (t) => {
  const dir = await tmpHome(t)
  assert.equal(await new GitStore(path.join(dir, 'repo')).isClone(), false)
})

test('head devolve o SHA curto do commit atual', async (t) => {
  const repo = await tmpHome(t)
  await run('git', ['init', '-q'], { cwd: repo })
  await writeFile(path.join(repo, 'a.txt'), 'x')
  await run('git', ['add', '.'], { cwd: repo })
  await run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: repo })

  const store = new GitStore(repo)
  assert.equal(await store.isClone(), true)
  assert.match(await store.head(), /^[0-9a-f]{7,}$/)
})

test('locallyModified lista os arquivos alterados na cópia de trabalho', async (t) => {
  const repo = await tmpHome(t)
  await run('git', ['init', '-q'], { cwd: repo })
  await writeFile(path.join(repo, 'a.txt'), 'x')
  await run('git', ['add', '.'], { cwd: repo })
  await run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: repo })
  await writeFile(path.join(repo, 'a.txt'), 'modificado')

  assert.deepEqual(await new GitStore(repo).locallyModified(), ['a.txt'])
})

test('locallyModified devolve vazio numa árvore limpa', async (t) => {
  const repo = await tmpHome(t)
  await run('git', ['init', '-q'], { cwd: repo })
  await writeFile(path.join(repo, 'a.txt'), 'x')
  await run('git', ['add', '.'], { cwd: repo })
  await run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: repo })

  assert.deepEqual(await new GitStore(repo).locallyModified(), [])
})
```

- [ ] **Step 3: Rodar o teste para confirmar que falha**

Run: `node --test test/git-store.test.js`
Expected: FAIL — `Cannot find module '../src/git-store.js'`

- [ ] **Step 4: Implementar `src/git-store.js`**

```js
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const run = promisify(execFile)

/** O consumidor não tem git instalado. */
export class GitNotInstalledError extends Error {
  constructor() {
    super('git não encontrado no PATH — instale em https://git-scm.com/downloads')
    this.name = 'GitNotInstalledError'
  }
}

/** Encapsula todas as operações git sobre o clone local. Nenhum outro módulo executa git. */
export class GitStore {
  /** @param {string} repoDir caminho do clone (`~/.aec-skills/repo`) */
  constructor(repoDir) {
    this.repoDir = repoDir
  }

  /**
   * Clona o repositório privado. O token entra pela URL e NUNCA é logado.
   * @param {string} remoteUrl ex. `https://github.com/org/aec-skills-library.git`
   * @param {string} token
   * @returns {Promise<void>}
   */
  async clone(remoteUrl, token) {
    const authUrl = remoteUrl.replace('https://', `https://x-access-token:${token}@`)
    await this.#git(['clone', '--depth', '1', authUrl, this.repoDir], path.dirname(this.repoDir))
    await this.#git(['remote', 'set-url', 'origin', remoteUrl])
  }

  /** @returns {Promise<void>} */
  async fetch() {
    await this.#git(['fetch', '--quiet', 'origin'])
  }

  /** @returns {Promise<void>} */
  async pull() {
    await this.#git(['pull', '--quiet', '--ff-only', 'origin', 'HEAD'])
  }

  /** @returns {Promise<string>} SHA curto do HEAD local */
  async head() {
    return this.#git(['rev-parse', '--short', 'HEAD'])
  }

  /** @returns {Promise<string>} SHA curto do HEAD remoto já buscado */
  async remoteHead() {
    return this.#git(['rev-parse', '--short', 'FETCH_HEAD'])
  }

  /** @returns {Promise<string[]>} arquivos que mudaram entre o HEAD local e o remoto */
  async changedFiles() {
    const out = await this.#git(['diff', '--name-only', 'HEAD', 'FETCH_HEAD'])
    return out.split('\n').filter(Boolean)
  }

  /** @returns {Promise<string[]>} arquivos editados localmente (não commitados) */
  async locallyModified() {
    const out = await this.#git(['status', '--porcelain'])
    return out.split('\n').filter(Boolean).map((line) => line.slice(3).trim())
  }

  /** @returns {Promise<boolean>} */
  async isClone() {
    try {
      await this.#git(['rev-parse', '--git-dir'])
      return true
    } catch {
      return false
    }
  }

  /**
   * @param {string[]} args
   * @param {string} [cwd]
   * @returns {Promise<string>} stdout, sem espaços nas pontas
   */
  async #git(args, cwd = this.repoDir) {
    try {
      const { stdout } = await run('git', args, { cwd })
      return stdout.trim()
    } catch (error) {
      if (error.code === 'ENOENT') throw new GitNotInstalledError()
      throw error
    }
  }
}
```

- [ ] **Step 5: Rodar o teste para confirmar que passa**

Run: `node --test test/git-store.test.js`
Expected: PASS — 4 testes

- [ ] **Step 6: Commit**

```bash
git add src/git-store.js test/git-store.test.js test/helpers/fake-git-store.js
git commit -m "feat(git): wrap git operations behind GitStore interface"
```

---

## Task 10: Estado (config e installed) e autenticação

**Files:**
- Create: `src/state.js`
- Create: `src/auth.js`
- Test: `test/state.test.js`

**Interfaces:**
- Consumes: `storePaths` (Task 4).
- Produces:
  - `readConfig(homeDir): Promise<{ remoteUrl?: string, token?: string, lastFetch?: number }>`
  - `writeConfig(homeDir, config): Promise<void>` — grava com modo `0600`
  - `readInstalled(homeDir): Promise<InstalledEntry[]>` onde
    `InstalledEntry = { name: string, kind: 'skill'|'agent'|'command'|'hook', harness: HarnessId, dest: string, mode: 'link'|'copy', sha: string }`
  - `writeInstalled(homeDir, entries): Promise<void>`
  - `resolveToken(env, io): Promise<string>` — `gh auth token` → `env.GITHUB_TOKEN` → prompt

- [ ] **Step 1: Escrever o teste que falha**

`test/state.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import { readConfig, writeConfig, readInstalled, writeInstalled } from '../src/state.js'
import { storePaths } from '../src/paths.js'
import { tmpHome } from './helpers/tmp-home.js'

test('readConfig devolve objeto vazio quando o arquivo não existe', async (t) => {
  const home = await tmpHome(t)
  assert.deepEqual(await readConfig(home), {})
})

test('writeConfig e readConfig fazem round-trip', async (t) => {
  const home = await tmpHome(t)
  await writeConfig(home, { remoteUrl: 'https://github.com/org/lib.git', token: 'segredo' })
  assert.equal((await readConfig(home)).remoteUrl, 'https://github.com/org/lib.git')
})

test('writeConfig grava config.json com permissão 0600', { skip: process.platform === 'win32' }, async (t) => {
  const home = await tmpHome(t)
  await writeConfig(home, { token: 'segredo' })
  const info = await stat(storePaths(home).configFile)
  assert.equal(info.mode & 0o777, 0o600)
})

test('readInstalled devolve lista vazia quando o arquivo não existe', async (t) => {
  const home = await tmpHome(t)
  assert.deepEqual(await readInstalled(home), [])
})

test('writeInstalled e readInstalled fazem round-trip', async (t) => {
  const home = await tmpHome(t)
  const entries = [{
    name: 'code-review', kind: 'skill', harness: 'claude',
    dest: '/h/.claude/skills/code-review', mode: 'link', sha: 'abc1234',
  }]
  await writeInstalled(home, entries)
  assert.deepEqual(await readInstalled(home), entries)
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `node --test test/state.test.js`
Expected: FAIL — `Cannot find module '../src/state.js'`

- [ ] **Step 3: Implementar `src/state.js`**

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { storePaths } from './paths.js'

/**
 * @typedef {object} InstalledEntry
 * @property {string} name
 * @property {'skill'|'agent'|'command'|'hook'} kind
 * @property {import('./harness.js').HarnessId} harness
 * @property {string} dest caminho criado no harness
 * @property {'link'|'copy'} mode como foi criado — `copy` precisa ser removido explicitamente
 * @property {string} sha SHA do store no momento da instalação
 */

/**
 * @param {string} homeDir
 * @returns {Promise<{ remoteUrl?: string, token?: string, lastFetch?: number }>}
 */
export async function readConfig(homeDir) {
  return readJson(storePaths(homeDir).configFile, {})
}

/**
 * Grava a configuração com permissão 0600 — contém o token.
 * @param {string} homeDir
 * @param {{ remoteUrl?: string, token?: string, lastFetch?: number }} config
 * @returns {Promise<void>}
 */
export async function writeConfig(homeDir, config) {
  await writeJson(storePaths(homeDir).configFile, config, 0o600)
}

/**
 * @param {string} homeDir
 * @returns {Promise<InstalledEntry[]>}
 */
export async function readInstalled(homeDir) {
  return readJson(storePaths(homeDir).installedFile, [])
}

/**
 * @param {string} homeDir
 * @param {InstalledEntry[]} entries
 * @returns {Promise<void>}
 */
export async function writeInstalled(homeDir, entries) {
  await writeJson(storePaths(homeDir).installedFile, entries, 0o644)
}

/**
 * @template T
 * @param {string} file
 * @param {T} fallback
 * @returns {Promise<T>}
 */
async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

/**
 * @param {string} file
 * @param {unknown} value
 * @param {number} mode
 * @returns {Promise<void>}
 */
async function writeJson(file, value, mode) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode })
}
```

- [ ] **Step 4: Implementar `src/auth.js`**

```js
import { execFile } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Resolve a credencial do GitHub, nesta ordem: gh CLI → GITHUB_TOKEN → prompt.
 * O token nunca é impresso nem logado.
 * @param {NodeJS.ProcessEnv} env
 * @param {{ input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream }} [io]
 * @returns {Promise<string>}
 * @throws {Error} quando nenhuma fonte fornece um token
 */
export async function resolveToken(env, io = {}) {
  const fromGh = await tokenFromGh()
  if (fromGh) return fromGh
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN
  return promptForToken(io)
}

/** @returns {Promise<string|null>} */
async function tokenFromGh() {
  try {
    const { stdout } = await run('gh', ['auth', 'token'])
    return stdout.trim() || null
  } catch {
    return null
  }
}

/**
 * @param {{ input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream }} io
 * @returns {Promise<string>}
 */
async function promptForToken(io) {
  const rl = createInterface({
    input: io.input ?? process.stdin,
    output: io.output ?? process.stdout,
  })
  try {
    const answer = await rl.question(
      'Personal Access Token do GitHub (escopo repo:read): ',
    )
    const token = answer.trim()
    if (!token) throw new Error('nenhum token fornecido — rode `gh auth login` ou defina GITHUB_TOKEN')
    return token
  } finally {
    rl.close()
  }
}
```

- [ ] **Step 5: Rodar o teste para confirmar que passa**

Run: `node --test test/state.test.js`
Expected: PASS — 5 testes

- [ ] **Step 6: Commit**

```bash
git add src/state.js src/auth.js test/state.test.js
git commit -m "feat(state): persist config and installed entries, resolve github token"
```

---

## Task 11: Pipeline de build

**Files:**
- Create: `src/build.js`
- Test: `test/build.test.js`

**Interfaces:**
- Consumes: `readLibrary` (Task 7), adaptadores (Task 8), `storePaths` (Task 4).
- Produces: `buildDerivatives(homeDir: string, artifacts: Artifact[]): Promise<void>` — apaga e regenera `~/.aec-skills/build/`. Idempotente. Grava:
  - `build/copilot/agents/<n>.agent.md`
  - `build/gemini/commands/<n>.toml`
  - `build/gemini/index.md` (corpo do bloco do GEMINI.md)

Skills não geram derivado — são ligadas direto do `repo/`.

- [ ] **Step 1: Escrever o teste que falha**

`test/build.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import path from 'node:path'
import { buildDerivatives } from '../src/build.js'
import { storePaths } from '../src/paths.js'
import { tmpHome } from './helpers/tmp-home.js'

/** @returns {import('../src/library.js').Artifact[]} */
function fixtures(repoDir) {
  return [
    { kind: 'skill', name: 'code-review', sourcePath: path.join(repoDir, 'skills', 'code-review'),
      attrs: { name: 'code-review', description: 'Revisa.' }, body: '# R\n', errors: [] },
    { kind: 'agent', name: 'reviewer', sourcePath: path.join(repoDir, 'agents', 'reviewer.md'),
      attrs: { name: 'reviewer', description: 'Revisor.', tools: 'Read, Grep' }, body: '# Rev\n', errors: [] },
    { kind: 'command', name: 'deepdive', sourcePath: path.join(repoDir, 'commands', 'deepdive.md'),
      attrs: { description: 'Análise.' }, body: 'Analise.\n', errors: [] },
  ]
}

test('buildDerivatives gera o agent do Copilot sem o campo tools', async (t) => {
  const home = await tmpHome(t)
  const { repo, build } = storePaths(home)
  await buildDerivatives(home, fixtures(repo))

  const content = await readFile(path.join(build, 'copilot', 'agents', 'reviewer.agent.md'), 'utf8')
  assert.ok(content.includes('description: Revisor.'))
  assert.ok(!content.includes('tools:'))
})

test('buildDerivatives gera o command TOML do Gemini', async (t) => {
  const home = await tmpHome(t)
  const { repo, build } = storePaths(home)
  await buildDerivatives(home, fixtures(repo))

  const toml = await readFile(path.join(build, 'gemini', 'commands', 'deepdive.toml'), 'utf8')
  assert.match(toml, /prompt = """/)
  assert.match(toml, /Analise\./)
})

test('buildDerivatives gera o índice do Gemini com as skills', async (t) => {
  const home = await tmpHome(t)
  const { repo, build } = storePaths(home)
  await buildDerivatives(home, fixtures(repo))

  const index = await readFile(path.join(build, 'gemini', 'index.md'), 'utf8')
  assert.match(index, /\*\*code-review\*\* — Revisa\./)
})

test('buildDerivatives não gera derivado para skill', async (t) => {
  const home = await tmpHome(t)
  const { repo, build } = storePaths(home)
  await buildDerivatives(home, fixtures(repo))

  await assert.rejects(() => access(path.join(build, 'claude', 'skills')))
})

test('buildDerivatives apaga derivados órfãos de um build anterior', async (t) => {
  const home = await tmpHome(t)
  const { repo, build } = storePaths(home)
  await mkdir(path.join(build, 'copilot', 'agents'), { recursive: true })
  await writeFile(path.join(build, 'copilot', 'agents', 'removido.agent.md'), 'lixo')

  await buildDerivatives(home, fixtures(repo))
  await assert.rejects(() => access(path.join(build, 'copilot', 'agents', 'removido.agent.md')))
})

test('buildDerivatives é idempotente', async (t) => {
  const home = await tmpHome(t)
  const { repo, build } = storePaths(home)
  const artifacts = fixtures(repo)

  await buildDerivatives(home, artifacts)
  const first = await readFile(path.join(build, 'gemini', 'index.md'), 'utf8')
  await buildDerivatives(home, artifacts)
  assert.equal(await readFile(path.join(build, 'gemini', 'index.md'), 'utf8'), first)
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `node --test test/build.test.js`
Expected: FAIL — `Cannot find module '../src/build.js'`

- [ ] **Step 3: Implementar `src/build.js`**

```js
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { storePaths } from './paths.js'
import { toCopilotAgent } from './adapters/copilot-agent.js'
import { toGeminiCommand } from './adapters/gemini-command.js'
import { toGeminiIndex } from './adapters/gemini-index.js'

/**
 * Regenera todos os derivados a partir do clone. Destrutivo apenas dentro de
 * `~/.aec-skills/build/`, e idempotente: rodar duas vezes produz o mesmo resultado.
 *
 * Skills não geram derivado — são ligadas direto de `repo/skills/` para os três
 * harnesses que leem SKILL.md nativamente.
 *
 * @param {string} homeDir
 * @param {import('./library.js').Artifact[]} artifacts
 * @returns {Promise<void>}
 */
export async function buildDerivatives(homeDir, artifacts) {
  const { repo, build } = storePaths(homeDir)
  await rm(build, { recursive: true, force: true })

  const skills = artifacts.filter((a) => a.kind === 'skill')
  const agents = artifacts.filter((a) => a.kind === 'agent')
  const commands = artifacts.filter((a) => a.kind === 'command')

  await writeAgents(build, agents)
  await writeCommands(build, commands)
  await writeGeminiIndex(build, skills, repo)
}

/** @param {string} build @param {import('./library.js').Artifact[]} agents */
async function writeAgents(build, agents) {
  const dir = path.join(build, 'copilot', 'agents')
  await mkdir(dir, { recursive: true })
  for (const agent of agents) {
    await writeFile(path.join(dir, `${agent.name}.agent.md`), toCopilotAgent(agent))
  }
}

/** @param {string} build @param {import('./library.js').Artifact[]} commands */
async function writeCommands(build, commands) {
  const dir = path.join(build, 'gemini', 'commands')
  await mkdir(dir, { recursive: true })
  for (const command of commands) {
    await writeFile(path.join(dir, `${command.name}.toml`), toGeminiCommand(command))
  }
}

/** @param {string} build @param {import('./library.js').Artifact[]} skills @param {string} repo */
async function writeGeminiIndex(build, skills, repo) {
  const dir = path.join(build, 'gemini')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'index.md'), `${toGeminiIndex(skills, repo)}\n`)
}
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `node --test test/build.test.js`
Expected: PASS — 6 testes

- [ ] **Step 5: Commit**

```bash
git add src/build.js test/build.test.js
git commit -m "feat(build): regenerate harness derivatives from the store"
```

---

## Task 12: Instalação e desinstalação

**Files:**
- Create: `src/install.js`
- Test: `test/install.test.js`

**Interfaces:**
- Consumes: `linkPath`/`unlinkPath` (Task 5), `HARNESSES` (Task 4), `readInstalled`/`writeInstalled` (Task 10), `mergeTextBlock`/`removeTextBlock` (Task 6), `storePaths` (Task 4).
- Produces:
  - `installArtifact(homeDir, artifact, harnesses, sha): Promise<InstallResult>` onde
    `InstallResult = { installed: InstalledEntry[], skipped: { harness: HarnessId, reason: string }[] }`
  - `uninstallArtifact(homeDir, name): Promise<number>` — quantos destinos removeu
  - `syncGeminiContext(homeDir): Promise<void>` — reescreve o bloco marcado do `GEMINI.md`

Hooks são tratados no `src/hooks.js` (Task 13) — `installArtifact` ignora `kind: 'hook'`.

- [ ] **Step 1: Escrever o teste que falha**

`test/install.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { installArtifact, uninstallArtifact, syncGeminiContext } from '../src/install.js'
import { readInstalled } from '../src/state.js'
import { storePaths } from '../src/paths.js'
import { buildDerivatives } from '../src/build.js'
import { tmpHome } from './helpers/tmp-home.js'

/** Monta um store com uma skill e um agent reais em disco. */
async function seedStore(home) {
  const { repo } = storePaths(home)
  await mkdir(path.join(repo, 'skills', 'code-review'), { recursive: true })
  await writeFile(
    path.join(repo, 'skills', 'code-review', 'SKILL.md'),
    '---\nname: code-review\ndescription: Revisa.\n---\n# R\n',
  )
  const skill = {
    kind: 'skill', name: 'code-review', sourcePath: path.join(repo, 'skills', 'code-review'),
    attrs: { name: 'code-review', description: 'Revisa.' }, body: '# R\n', errors: [],
  }
  const agent = {
    kind: 'agent', name: 'reviewer', sourcePath: path.join(repo, 'agents', 'reviewer.md'),
    attrs: { name: 'reviewer', description: 'Revisor.' }, body: '# Rev\n', errors: [],
  }
  await buildDerivatives(home, [skill, agent])
  return { skill, agent }
}

test('installArtifact liga a skill nos três harnesses que leem SKILL.md', async (t) => {
  const home = await tmpHome(t)
  const { skill } = await seedStore(home)

  const result = await installArtifact(home, skill, ['claude', 'copilot', 'codex'], 'abc1234')

  assert.equal(result.installed.length, 3)
  assert.equal(result.skipped.length, 0)
  for (const harness of ['.claude', '.copilot', '.codex']) {
    const file = path.join(home, harness, 'skills', 'code-review', 'SKILL.md')
    assert.match(await readFile(file, 'utf8'), /name: code-review/)
  }
})

test('installArtifact registra as entradas em installed.json', async (t) => {
  const home = await tmpHome(t)
  const { skill } = await seedStore(home)
  await installArtifact(home, skill, ['claude'], 'abc1234')

  const entries = await readInstalled(home)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].name, 'code-review')
  assert.equal(entries[0].harness, 'claude')
  assert.equal(entries[0].sha, 'abc1234')
})

test('installArtifact pula o harness que não suporta o tipo do artefato', async (t) => {
  const home = await tmpHome(t)
  const { agent } = await seedStore(home)

  const result = await installArtifact(home, agent, ['copilot', 'codex'], 'abc1234')

  assert.equal(result.installed.length, 1)
  assert.equal(result.installed[0].harness, 'copilot')
  assert.equal(result.skipped.length, 1)
  assert.equal(result.skipped[0].harness, 'codex')
  assert.match(result.skipped[0].reason, /não suporta agent/)
})

test('installArtifact usa a extensão .agent.md no Copilot', async (t) => {
  const home = await tmpHome(t)
  const { agent } = await seedStore(home)
  await installArtifact(home, agent, ['copilot'], 'abc1234')

  await access(path.join(home, '.copilot', 'agents', 'reviewer.agent.md'))
})

test('installArtifact pula destino ocupado pelo usuário, sem sobrescrever', async (t) => {
  const home = await tmpHome(t)
  const { skill } = await seedStore(home)
  const dest = path.join(home, '.claude', 'skills', 'code-review')
  await mkdir(dest, { recursive: true })
  await writeFile(path.join(dest, 'SKILL.md'), 'do usuário')

  const result = await installArtifact(home, skill, ['claude'], 'abc1234')

  assert.equal(result.installed.length, 0)
  assert.equal(result.skipped.length, 1)
  assert.match(result.skipped[0].reason, /já existe/)
  assert.equal(await readFile(path.join(dest, 'SKILL.md'), 'utf8'), 'do usuário')
})

test('uninstallArtifact remove os destinos e limpa installed.json', async (t) => {
  const home = await tmpHome(t)
  const { skill } = await seedStore(home)
  await installArtifact(home, skill, ['claude', 'copilot'], 'abc1234')

  const removed = await uninstallArtifact(home, 'code-review')

  assert.equal(removed, 2)
  assert.deepEqual(await readInstalled(home), [])
  await assert.rejects(() => access(path.join(home, '.claude', 'skills', 'code-review')))
})

test('syncGeminiContext escreve o bloco marcado sem apagar o conteúdo do usuário', async (t) => {
  const home = await tmpHome(t)
  await seedStore(home)
  await mkdir(path.join(home, '.gemini'), { recursive: true })
  await writeFile(path.join(home, '.gemini', 'GEMINI.md'), '# Meu contexto pessoal\n')

  await syncGeminiContext(home)

  const content = await readFile(path.join(home, '.gemini', 'GEMINI.md'), 'utf8')
  assert.match(content, /# Meu contexto pessoal/)
  assert.match(content, /aec-skills:start/)
  assert.match(content, /code-review/)
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `node --test test/install.test.js`
Expected: FAIL — `Cannot find module '../src/install.js'`

- [ ] **Step 3: Implementar `src/install.js`**

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { HARNESSES } from './harness.js'
import { linkPath, unlinkPath, DestinationOccupiedError } from './linker.js'
import { readInstalled, writeInstalled } from './state.js'
import { mergeTextBlock } from './merge-block.js'
import { storePaths } from './paths.js'

/**
 * @typedef {object} InstallResult
 * @property {import('./state.js').InstalledEntry[]} installed
 * @property {{ harness: import('./harness.js').HarnessId, reason: string }[]} skipped
 */

/**
 * Liga um artefato nos harnesses pedidos. Harness que não suporta o tipo é pulado
 * com motivo; destino ocupado pelo usuário é pulado sem sobrescrever.
 * Hooks não passam por aqui — ver `src/hooks.js`.
 *
 * @param {string} homeDir
 * @param {import('./library.js').Artifact} artifact
 * @param {import('./harness.js').HarnessId[]} harnesses
 * @param {string} sha SHA do store no momento da instalação
 * @returns {Promise<InstallResult>}
 */
export async function installArtifact(homeDir, artifact, harnesses, sha) {
  const result = { installed: [], skipped: [] }

  for (const harness of harnesses) {
    const target = resolveTarget(homeDir, artifact, harness)
    if (!target) {
      result.skipped.push({ harness, reason: `${harness} não suporta ${artifact.kind}` })
      continue
    }
    try {
      const mode = await linkPath(target.source, target.dest)
      result.installed.push({ name: artifact.name, kind: artifact.kind, harness, dest: target.dest, mode, sha })
    } catch (error) {
      if (!(error instanceof DestinationOccupiedError)) throw error
      result.skipped.push({ harness, reason: `já existe e não é nosso: ${error.dest}` })
    }
  }

  await appendInstalled(homeDir, result.installed)
  return result
}

/**
 * Remove todos os destinos de um artefato e o retira de installed.json.
 * @param {string} homeDir
 * @param {string} name
 * @returns {Promise<number>} quantos destinos foram removidos
 */
export async function uninstallArtifact(homeDir, name) {
  const entries = await readInstalled(homeDir)
  const [mine, others] = partition(entries, (e) => e.name === name)

  let removed = 0
  for (const entry of mine) {
    const target = resolveTargetFromEntry(homeDir, entry)
    if (await unlinkPath(entry.dest, target)) removed += 1
  }
  await writeInstalled(homeDir, others)
  return removed
}

/**
 * Reescreve o bloco marcado do GEMINI.md com o índice atual de skills.
 * O conteúdo do usuário fora do bloco é preservado.
 * @param {string} homeDir
 * @returns {Promise<void>}
 */
export async function syncGeminiContext(homeDir) {
  const { build } = storePaths(homeDir)
  const index = await readFile(path.join(build, 'gemini', 'index.md'), 'utf8')
  const contextFile = HARNESSES.gemini.contextFile(homeDir)

  await mkdir(path.dirname(contextFile), { recursive: true })
  const existing = await readFileOrEmpty(contextFile)
  await writeFile(contextFile, mergeTextBlock(existing, index.trimEnd()))
}

/**
 * @param {string} homeDir
 * @param {import('./library.js').Artifact} artifact
 * @param {import('./harness.js').HarnessId} harness
 * @returns {{ source: string, dest: string }|null} null quando o harness não suporta o tipo
 */
function resolveTarget(homeDir, artifact, harness) {
  const spec = HARNESSES[harness]
  const { repo, build } = storePaths(homeDir)

  if (artifact.kind === 'skill' && spec.skillsDir) {
    return {
      source: path.join(repo, 'skills', artifact.name),
      dest: path.join(spec.skillsDir(homeDir), artifact.name),
    }
  }
  if (artifact.kind === 'agent' && spec.agentsDir) {
    const source = harness === 'copilot'
      ? path.join(build, 'copilot', 'agents', `${artifact.name}.agent.md`)
      : path.join(repo, 'agents', `${artifact.name}.md`)
    return { source, dest: path.join(spec.agentsDir(homeDir), `${artifact.name}${spec.agentExt}`) }
  }
  if (artifact.kind === 'command' && spec.commandsDir) {
    const source = harness === 'gemini'
      ? path.join(build, 'gemini', 'commands', `${artifact.name}.toml`)
      : path.join(repo, 'commands', `${artifact.name}.md`)
    const ext = harness === 'gemini' ? '.toml' : '.md'
    return { source, dest: path.join(spec.commandsDir(homeDir), `${artifact.name}${ext}`) }
  }
  return null
}

/**
 * @param {string} homeDir
 * @param {import('./state.js').InstalledEntry} entry
 * @returns {string} o `source` original daquele destino
 */
function resolveTargetFromEntry(homeDir, entry) {
  const artifact = { kind: entry.kind, name: entry.name }
  return resolveTarget(homeDir, /** @type {never} */ (artifact), entry.harness).source
}

/**
 * @param {string} homeDir
 * @param {import('./state.js').InstalledEntry[]} added
 * @returns {Promise<void>}
 */
async function appendInstalled(homeDir, added) {
  if (added.length === 0) return
  const current = await readInstalled(homeDir)
  const isNew = (e) => !added.some((a) => a.dest === e.dest)
  await writeInstalled(homeDir, [...current.filter(isNew), ...added])
}

/** @param {string} file @returns {Promise<string>} */
async function readFileOrEmpty(file) {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return ''
    throw error
  }
}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => boolean} predicate
 * @returns {[T[], T[]]} [aprovados, reprovados]
 */
function partition(items, predicate) {
  return [items.filter(predicate), items.filter((i) => !predicate(i))]
}
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `node --test test/install.test.js`
Expected: PASS — 7 testes

- [ ] **Step 5: Commit**

```bash
git add src/install.js test/install.test.js
git commit -m "feat(install): link artifacts into harnesses and track installs"
```

---

## Task 13: Hooks no settings.json, com confirmação e backup

O caso perigoso: escreve na configuração da máquina de outra pessoa. Confirmação explícita, backup, e escrita só do que é nosso.

**Files:**
- Create: `src/hooks.js`
- Test: `test/hooks.test.js`

**Interfaces:**
- Consumes: `mergeJsonHooks`/`removeJsonHooks` (Task 6).
- Produces:
  - `previewHook(homeDir, artifact): Promise<{ fragment: object, diff: string }>`
  - `installHook(homeDir, artifact): Promise<void>` — faz backup em `settings.json.bak` antes de escrever
  - `uninstallHook(homeDir, artifact): Promise<void>`

A confirmação `y/N` é responsabilidade do comando `add` (Task 15), que chama `previewHook`, mostra o diff, pergunta, e só então chama `installHook`.

- [ ] **Step 1: Escrever o teste que falha**

`test/hooks.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { previewHook, installHook, uninstallHook } from '../src/hooks.js'
import { storePaths } from '../src/paths.js'
import { tmpHome } from './helpers/tmp-home.js'

const FRAGMENT = { hooks: { SessionStart: [{ command: 'aec-skills status' }] } }

async function seedHook(home) {
  const { repo } = storePaths(home)
  const dir = path.join(repo, 'hooks', 'check-updates')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'hook.json'), JSON.stringify(FRAGMENT, null, 2))
  return { kind: 'hook', name: 'check-updates', sourcePath: dir, attrs: {}, body: '', errors: [] }
}

test('previewHook devolve o fragmento e um diff legível', async (t) => {
  const home = await tmpHome(t)
  const artifact = await seedHook(home)

  const { fragment, diff } = await previewHook(home, artifact)

  assert.deepEqual(fragment, FRAGMENT)
  assert.match(diff, /SessionStart/)
  assert.match(diff, /aec-skills status/)
})

test('installHook injeta o hook preservando o settings do usuário', async (t) => {
  const home = await tmpHome(t)
  const artifact = await seedHook(home)
  await mkdir(path.join(home, '.claude'), { recursive: true })
  await writeFile(
    path.join(home, '.claude', 'settings.json'),
    JSON.stringify({ model: 'opus', hooks: { SessionStart: [{ command: 'meu-hook' }] } }, null, 2),
  )

  await installHook(home, artifact)

  const settings = JSON.parse(await readFile(path.join(home, '.claude', 'settings.json'), 'utf8'))
  assert.equal(settings.model, 'opus')
  assert.deepEqual(settings.hooks.SessionStart, [{ command: 'meu-hook' }, { command: 'aec-skills status' }])
})

test('installHook cria backup antes de escrever', async (t) => {
  const home = await tmpHome(t)
  const artifact = await seedHook(home)
  const settingsFile = path.join(home, '.claude', 'settings.json')
  await mkdir(path.join(home, '.claude'), { recursive: true })
  await writeFile(settingsFile, JSON.stringify({ model: 'opus' }, null, 2))

  await installHook(home, artifact)

  const backup = JSON.parse(await readFile(`${settingsFile}.bak`, 'utf8'))
  assert.deepEqual(backup, { model: 'opus' })
})

test('installHook funciona quando settings.json não existe', async (t) => {
  const home = await tmpHome(t)
  const artifact = await seedHook(home)

  await installHook(home, artifact)

  const settings = JSON.parse(await readFile(path.join(home, '.claude', 'settings.json'), 'utf8'))
  assert.deepEqual(settings.hooks.SessionStart, [{ command: 'aec-skills status' }])
})

test('uninstallHook remove só a nossa entrada', async (t) => {
  const home = await tmpHome(t)
  const artifact = await seedHook(home)
  await mkdir(path.join(home, '.claude'), { recursive: true })
  await writeFile(
    path.join(home, '.claude', 'settings.json'),
    JSON.stringify({ hooks: { SessionStart: [{ command: 'meu-hook' }] } }, null, 2),
  )
  await installHook(home, artifact)

  await uninstallHook(home, artifact)

  const settings = JSON.parse(await readFile(path.join(home, '.claude', 'settings.json'), 'utf8'))
  assert.deepEqual(settings.hooks.SessionStart, [{ command: 'meu-hook' }])
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `node --test test/hooks.test.js`
Expected: FAIL — `Cannot find module '../src/hooks.js'`

- [ ] **Step 3: Implementar `src/hooks.js`**

```js
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { HARNESSES } from './harness.js'
import { mergeJsonHooks, removeJsonHooks } from './merge-block.js'

/** Hooks só existem no Claude Code. */
const HOOK_HARNESS = 'claude'

/**
 * Lê o fragmento do hook e monta um diff legível do que será injetado.
 * O comando `add` mostra esse diff e pede confirmação antes de chamar `installHook`.
 * @param {string} homeDir
 * @param {import('./library.js').Artifact} artifact
 * @returns {Promise<{ fragment: { hooks: Record<string, object[]> }, diff: string }>}
 */
export async function previewHook(homeDir, artifact) {
  const fragment = await readFragment(artifact)
  const lines = Object.entries(fragment.hooks).flatMap(([event, entries]) =>
    entries.map((entry) => `  + ${event}: ${JSON.stringify(entry)}`),
  )
  return { fragment, diff: lines.join('\n') }
}

/**
 * Injeta o hook no settings.json do Claude Code. Faz backup antes de escrever e
 * preserva tudo o que já estava no arquivo.
 * @param {string} homeDir
 * @param {import('./library.js').Artifact} artifact
 * @returns {Promise<void>}
 */
export async function installHook(homeDir, artifact) {
  const fragment = await readFragment(artifact)
  await updateSettings(homeDir, (settings) => mergeJsonHooks(settings, fragment))
}

/**
 * Remove do settings.json exatamente as entradas deste hook.
 * @param {string} homeDir
 * @param {import('./library.js').Artifact} artifact
 * @returns {Promise<void>}
 */
export async function uninstallHook(homeDir, artifact) {
  const fragment = await readFragment(artifact)
  await updateSettings(homeDir, (settings) => removeJsonHooks(settings, fragment))
}

/**
 * @param {string} homeDir
 * @param {(settings: Record<string, unknown>) => Record<string, unknown>} transform
 * @returns {Promise<void>}
 */
async function updateSettings(homeDir, transform) {
  const file = path.join(HARNESSES[HOOK_HARNESS].root(homeDir), 'settings.json')
  await mkdir(path.dirname(file), { recursive: true })

  const raw = await readFileOrNull(file)
  if (raw !== null) await copyFile(file, `${file}.bak`)

  const settings = raw === null ? {} : JSON.parse(raw)
  await writeFile(file, `${JSON.stringify(transform(settings), null, 2)}\n`)
}

/**
 * @param {import('./library.js').Artifact} artifact
 * @returns {Promise<{ hooks: Record<string, object[]> }>}
 */
async function readFragment(artifact) {
  const raw = await readFile(path.join(artifact.sourcePath, 'hook.json'), 'utf8')
  const fragment = JSON.parse(raw)
  if (!fragment.hooks) {
    throw new Error(`hook "${artifact.name}": hook.json precisa ter a chave "hooks", recebido ${Object.keys(fragment)}`)
  }
  return fragment
}

/** @param {string} file @returns {Promise<string|null>} */
async function readFileOrNull(file) {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `node --test test/hooks.test.js`
Expected: PASS — 5 testes

- [ ] **Step 5: Commit**

```bash
git add src/hooks.js test/hooks.test.js
git commit -m "feat(hooks): inject claude hooks into settings.json with backup"
```

---

## Task 14: Comando `status` e o check por piggyback

**Files:**
- Create: `src/commands/status.js`
- Test: `test/status.test.js`

**Interfaces:**
- Consumes: `GitStore` (Task 9, injetado — o teste passa `FakeGitStore`), `readLibrary` (Task 7), `readInstalled` (Task 10), `readConfig`/`writeConfig` (Task 10).
- Produces:
  - `@typedef {{ kind: 'modified'|'new'|'locally-edited', name: string, detail: string }} Change`
  - `computeChanges(homeDir, gitStore): Promise<Change[]>`
  - `formatChanges(changes: Change[]): string`
  - `runStatus(homeDir, gitStore, io): Promise<number>`
  - `maybeFetch(homeDir, gitStore, now: number): Promise<boolean>` — só faz `fetch` se passaram mais de 6h desde `config.lastFetch`; devolve se buscou

- [ ] **Step 1: Escrever o teste que falha**

`test/status.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { computeChanges, formatChanges, maybeFetch, runStatus } from '../src/commands/status.js'
import { writeConfig, readConfig, writeInstalled } from '../src/state.js'
import { storePaths } from '../src/paths.js'
import { FakeGitStore } from './helpers/fake-git-store.js'
import { tmpHome } from './helpers/tmp-home.js'

async function seedSkills(home, names) {
  const { repo } = storePaths(home)
  for (const name of names) {
    await mkdir(path.join(repo, 'skills', name), { recursive: true })
    await writeFile(
      path.join(repo, 'skills', name, 'SKILL.md'),
      `---\nname: ${name}\ndescription: d\n---\nCorpo\n`,
    )
  }
}

test('computeChanges marca como modificada a skill instalada que mudou no remoto', async (t) => {
  const home = await tmpHome(t)
  await seedSkills(home, ['code-review'])
  await writeInstalled(home, [{
    name: 'code-review', kind: 'skill', harness: 'claude',
    dest: '/x', mode: 'link', sha: 'aaaa111',
  }])
  const git = new FakeGitStore({ head: 'aaaa111', remoteHead: 'bbbb222', changed: ['skills/code-review/SKILL.md'] })

  const changes = await computeChanges(home, git)

  assert.equal(changes.length, 1)
  assert.equal(changes[0].kind, 'modified')
  assert.equal(changes[0].name, 'code-review')
})

test('computeChanges marca como nova a skill que existe no remoto e não está instalada', async (t) => {
  const home = await tmpHome(t)
  await seedSkills(home, ['code-review'])
  const git = new FakeGitStore({ head: 'aaaa111', remoteHead: 'bbbb222', changed: ['skills/security-audit/SKILL.md'] })

  const changes = await computeChanges(home, git)

  assert.ok(changes.some((c) => c.kind === 'new' && c.name === 'security-audit'))
})

test('computeChanges avisa sobre skill editada localmente', async (t) => {
  const home = await tmpHome(t)
  await seedSkills(home, ['karpathy'])
  await writeInstalled(home, [{
    name: 'karpathy', kind: 'skill', harness: 'claude', dest: '/x', mode: 'link', sha: 'aaaa111',
  }])
  const git = new FakeGitStore({ modified: ['skills/karpathy/SKILL.md'] })

  const changes = await computeChanges(home, git)

  assert.equal(changes[0].kind, 'locally-edited')
  assert.equal(changes[0].name, 'karpathy')
})

test('computeChanges devolve vazio quando local e remoto estão iguais', async (t) => {
  const home = await tmpHome(t)
  await seedSkills(home, ['code-review'])
  const git = new FakeGitStore({ head: 'aaaa111', remoteHead: 'aaaa111' })

  assert.deepEqual(await computeChanges(home, git), [])
})

test('formatChanges usa os marcadores ~ + e !', () => {
  const output = formatChanges([
    { kind: 'modified', name: 'code-review', detail: '2 commits atrás' },
    { kind: 'new', name: 'security-audit', detail: 'nova na biblioteca' },
    { kind: 'locally-edited', name: 'karpathy', detail: 'você editou localmente' },
  ])
  assert.match(output, /~ code-review/)
  assert.match(output, /\+ security-audit/)
  assert.match(output, /! karpathy/)
  assert.match(output, /aec-skills update/)
})

test('formatChanges informa que está tudo em dia quando não há mudança', () => {
  assert.match(formatChanges([]), /tudo em dia/)
})

test('maybeFetch busca quando nunca buscou antes', async (t) => {
  const home = await tmpHome(t)
  const git = new FakeGitStore()

  assert.equal(await maybeFetch(home, git, 1_000_000), true)
  assert.ok(git.calls.includes('fetch'))
  assert.equal((await readConfig(home)).lastFetch, 1_000_000)
})

test('maybeFetch não busca de novo dentro de 6 horas', async (t) => {
  const home = await tmpHome(t)
  await writeConfig(home, { lastFetch: 1_000_000 })
  const git = new FakeGitStore()

  const oneHourLater = 1_000_000 + 60 * 60 * 1000
  assert.equal(await maybeFetch(home, git, oneHourLater), false)
  assert.deepEqual(git.calls, [])
})

test('maybeFetch busca de novo depois de 6 horas', async (t) => {
  const home = await tmpHome(t)
  await writeConfig(home, { lastFetch: 1_000_000 })
  const git = new FakeGitStore()

  const sevenHoursLater = 1_000_000 + 7 * 60 * 60 * 1000
  assert.equal(await maybeFetch(home, git, sevenHoursLater), true)
})

test('maybeFetch devolve false e não quebra quando está offline', async (t) => {
  const home = await tmpHome(t)
  const git = new FakeGitStore()
  git.fetch = async () => { throw new Error('getaddrinfo ENOTFOUND github.com') }

  assert.equal(await maybeFetch(home, git, 1_000_000), false)
})

test('runStatus imprime as mudanças e retorna 0', async (t) => {
  const home = await tmpHome(t)
  await seedSkills(home, ['code-review'])
  const git = new FakeGitStore({ head: 'aaaa111', remoteHead: 'bbbb222', changed: ['skills/code-review/SKILL.md'] })
  const output = []

  const code = await runStatus(home, git, { log: (l) => output.push(l) })

  assert.equal(code, 0)
  assert.match(output.join('\n'), /code-review/)
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `node --test test/status.test.js`
Expected: FAIL — `Cannot find module '../src/commands/status.js'`

- [ ] **Step 3: Implementar `src/commands/status.js`**

```js
import { readConfig, writeConfig, readInstalled } from '../state.js'

const FETCH_INTERVAL_MS = 6 * 60 * 60 * 1000

/** @typedef {{ kind: 'modified'|'new'|'locally-edited', name: string, detail: string }} Change */

/**
 * Faz `fetch` só se o último foi há mais de 6 horas. Offline não é erro — o
 * comando segue com o store local.
 * @param {string} homeDir
 * @param {import('../git-store.js').GitStore} gitStore
 * @param {number} now timestamp em ms (injetado para os testes serem determinísticos)
 * @returns {Promise<boolean>} true se buscou
 */
export async function maybeFetch(homeDir, gitStore, now) {
  const config = await readConfig(homeDir)
  if (config.lastFetch && now - config.lastFetch < FETCH_INTERVAL_MS) return false

  try {
    await gitStore.fetch()
  } catch {
    return false
  }
  await writeConfig(homeDir, { ...config, lastFetch: now })
  return true
}

/**
 * Compara o store local com o remoto já buscado.
 * @param {string} homeDir
 * @param {import('../git-store.js').GitStore} gitStore
 * @returns {Promise<Change[]>}
 */
export async function computeChanges(homeDir, gitStore) {
  const [installed, modified, changed] = await Promise.all([
    readInstalled(homeDir),
    gitStore.locallyModified(),
    remoteChanges(gitStore),
  ])

  const installedNames = new Set(installed.map((e) => e.name))
  const editedNames = new Set(modified.map(artifactNameFromPath).filter(Boolean))
  const changedNames = new Set(changed.map(artifactNameFromPath).filter(Boolean))

  /** @type {Change[]} */
  const changes = []
  for (const name of editedNames) {
    changes.push({ kind: 'locally-edited', name, detail: 'você editou localmente' })
  }
  for (const name of changedNames) {
    if (editedNames.has(name)) continue
    changes.push(installedNames.has(name)
      ? { kind: 'modified', name, detail: 'modificada na biblioteca' }
      : { kind: 'new', name, detail: 'nova na biblioteca' })
  }
  return changes
}

/**
 * @param {Change[]} changes
 * @returns {string}
 */
export function formatChanges(changes) {
  if (changes.length === 0) return 'aec-skills — tudo em dia.'

  const marker = { modified: '~', new: '+', 'locally-edited': '!' }
  const lines = changes.map((c) => `  ${marker[c.kind]} ${c.name.padEnd(20)} ${c.detail}`)

  return [
    `aec-skills — ${changes.length} ${changes.length === 1 ? 'atualização disponível' : 'atualizações disponíveis'}`,
    '',
    ...lines,
    '',
    'Rode `npx aec-skills update` para aplicar.',
  ].join('\n')
}

/**
 * @param {string} homeDir
 * @param {import('../git-store.js').GitStore} gitStore
 * @param {{ log?: (line: string) => void, now?: number }} [io]
 * @returns {Promise<number>} exit code
 */
export async function runStatus(homeDir, gitStore, io = {}) {
  const log = io.log ?? console.log
  await maybeFetch(homeDir, gitStore, io.now ?? Date.now())
  log(formatChanges(await computeChanges(homeDir, gitStore)))
  return 0
}

/**
 * `skills/code-review/SKILL.md` → `code-review`; `agents/reviewer.md` → `reviewer`.
 * @param {string} file caminho relativo à raiz do repo
 * @returns {string|null}
 */
function artifactNameFromPath(file) {
  const parts = file.split('/')
  if (parts[0] === 'skills' || parts[0] === 'hooks') return parts[1] ?? null
  if (parts[0] === 'agents' || parts[0] === 'commands') return parts[1]?.replace(/\.md$/, '') ?? null
  return null
}

/**
 * @param {import('../git-store.js').GitStore} gitStore
 * @returns {Promise<string[]>} vazio quando o remoto não foi buscado ou está igual
 */
async function remoteChanges(gitStore) {
  try {
    const [head, remote] = await Promise.all([gitStore.head(), gitStore.remoteHead()])
    if (head === remote) return []
    return await gitStore.changedFiles()
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `node --test test/status.test.js`
Expected: PASS — 11 testes

- [ ] **Step 5: Commit**

```bash
git add src/commands/status.js test/status.test.js
git commit -m "feat(status): detect library changes with piggyback fetch"
```

---

## Task 15: Comandos `login`, `list`, `add`, `remove`, `update`, `uninstall` e dispatch

Última task: liga tudo no `cli.js`.

**Files:**
- Create: `src/commands/login.js`, `src/commands/list.js`, `src/commands/add.js`, `src/commands/remove.js`, `src/commands/update.js`, `src/commands/uninstall.js`
- Modify: `src/cli.js` (substituir o dispatch de "comando desconhecido")
- Test: `test/commands.test.js`

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: cada comando exporta `run<Nome>(homeDir, args, deps): Promise<number>`, onde
  `deps = { gitStore, log, confirm, env, now }` — injetados para permitir teste sem rede e sem prompt.

- [ ] **Step 1: Escrever o teste que falha**

`test/commands.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { runList } from '../src/commands/list.js'
import { runAdd } from '../src/commands/add.js'
import { runRemove } from '../src/commands/remove.js'
import { runUpdate } from '../src/commands/update.js'
import { runUninstall } from '../src/commands/uninstall.js'
import { storePaths } from '../src/paths.js'
import { readInstalled } from '../src/state.js'
import { FakeGitStore } from './helpers/fake-git-store.js'
import { tmpHome } from './helpers/tmp-home.js'

async function seed(home) {
  const { repo } = storePaths(home)
  await mkdir(path.join(repo, 'skills', 'code-review'), { recursive: true })
  await writeFile(
    path.join(repo, 'skills', 'code-review', 'SKILL.md'),
    '---\nname: code-review\ndescription: Revisa código.\n---\n# R\n',
  )
  await mkdir(path.join(home, '.claude'), { recursive: true })
}

test('runList mostra as skills e marca as instaladas', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const output = []

  const code = await runList(home, {}, { log: (l) => output.push(l), gitStore: new FakeGitStore() })

  assert.equal(code, 0)
  assert.match(output.join('\n'), /code-review.*Revisa código\./s)
})

test('runAdd instala a skill no harness detectado', async (t) => {
  const home = await tmpHome(t)
  await seed(home)

  const code = await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  assert.equal(code, 0)
  await access(path.join(home, '.claude', 'skills', 'code-review', 'SKILL.md'))
  assert.equal((await readInstalled(home)).length, 1)
})

test('runAdd falha citando o artefato inexistente', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const output = []

  const code = await runAdd(home, { _: ['inexistente'] }, { log: (l) => output.push(l), gitStore: new FakeGitStore() })

  assert.equal(code, 1)
  assert.match(output.join('\n'), /não encontrado: inexistente/)
})

test('runAdd recusa artefato com frontmatter inválido', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const { repo } = storePaths(home)
  await mkdir(path.join(repo, 'skills', 'quebrada'), { recursive: true })
  await writeFile(path.join(repo, 'skills', 'quebrada', 'SKILL.md'), '---\nname: errado\n---\nx\n')
  const output = []

  const code = await runAdd(home, { _: ['quebrada'] }, { log: (l) => output.push(l), gitStore: new FakeGitStore() })

  assert.equal(code, 1)
  assert.match(output.join('\n'), /frontmatter inválido/)
})

test('runAdd --all instala tudo', async (t) => {
  const home = await tmpHome(t)
  await seed(home)

  await runAdd(home, { _: [], all: true }, { log: () => {}, gitStore: new FakeGitStore() })

  assert.equal((await readInstalled(home)).length, 1)
})

test('runRemove desinstala e limpa installed.json', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  const code = await runRemove(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  assert.equal(code, 0)
  assert.deepEqual(await readInstalled(home), [])
})

test('runUpdate pula skill editada localmente e avisa', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  const git = new FakeGitStore({ modified: ['skills/code-review/SKILL.md'] })
  const output = []

  const code = await runUpdate(home, {}, { log: (l) => output.push(l), gitStore: git })

  assert.equal(code, 0)
  assert.ok(!git.calls.includes('pull'))
  assert.match(output.join('\n'), /editad[ao] localmente.*--force/s)
})

test('runUpdate --force aplica mesmo com edição local', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const git = new FakeGitStore({ modified: ['skills/code-review/SKILL.md'] })

  await runUpdate(home, { force: true }, { log: () => {}, gitStore: git })

  assert.ok(git.calls.includes('pull'))
})

test('runUninstall remove os links e o store', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  const code = await runUninstall(home, {}, { log: () => {}, confirm: async () => true, gitStore: new FakeGitStore() })

  assert.equal(code, 0)
  await assert.rejects(() => access(path.join(home, '.claude', 'skills', 'code-review')))
  await assert.rejects(() => access(storePaths(home).store))
})

test('runUninstall aborta quando o usuário não confirma', async (t) => {
  const home = await tmpHome(t)
  await seed(home)

  const code = await runUninstall(home, {}, { log: () => {}, confirm: async () => false, gitStore: new FakeGitStore() })

  assert.equal(code, 1)
  await access(storePaths(home).store)
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `node --test test/commands.test.js`
Expected: FAIL — `Cannot find module '../src/commands/list.js'`

- [ ] **Step 3: Implementar `src/commands/list.js`**

```js
import { readLibrary } from '../library.js'
import { readInstalled } from '../state.js'
import { storePaths } from '../paths.js'

/**
 * @param {string} homeDir
 * @param {{ harness?: string }} _args
 * @param {{ log: (line: string) => void }} deps
 * @returns {Promise<number>} exit code
 */
export async function runList(homeDir, _args, deps) {
  const artifacts = await readLibrary(storePaths(homeDir).repo)
  if (artifacts.length === 0) {
    deps.log('biblioteca vazia — rode `npx aec-skills login` para clonar')
    return 1
  }

  const installed = new Set((await readInstalled(homeDir)).map((e) => e.name))
  for (const artifact of artifacts) {
    const mark = installed.has(artifact.name) ? '✓' : ' '
    const description = artifact.attrs.description ?? ''
    deps.log(`${mark} ${artifact.kind.padEnd(8)} ${artifact.name.padEnd(24)} ${description}`)
  }
  return 0
}
```

- [ ] **Step 4: Implementar `src/commands/add.js`**

```js
import { readLibrary } from '../library.js'
import { storePaths } from '../paths.js'
import { resolveHarnesses } from '../harness.js'
import { buildDerivatives } from '../build.js'
import { installArtifact, syncGeminiContext } from '../install.js'
import { previewHook, installHook } from '../hooks.js'

/**
 * @param {string} homeDir
 * @param {{ _?: string[], all?: boolean, harness?: string }} args
 * @param {{ log: (line: string) => void, gitStore: import('../git-store.js').GitStore, confirm?: (q: string) => Promise<boolean> }} deps
 * @returns {Promise<number>}
 */
export async function runAdd(homeDir, args, deps) {
  const artifacts = await readLibrary(storePaths(homeDir).repo)
  const wanted = args.all ? artifacts : pickByName(artifacts, args._ ?? [], deps.log)
  if (wanted === null) return 1

  const invalid = wanted.filter((a) => a.errors.length > 0)
  if (invalid.length > 0) {
    for (const artifact of invalid) {
      deps.log(`frontmatter inválido em "${artifact.name}":`)
      for (const error of artifact.errors) deps.log(`  - ${error}`)
    }
    return 1
  }

  const harnesses = await resolveHarnesses(args.harness, homeDir)
  if (harnesses.length === 0) {
    deps.log('nenhum harness detectado — nada a fazer')
    return 1
  }

  await buildDerivatives(homeDir, artifacts)
  const sha = await safeHead(deps.gitStore)

  for (const artifact of wanted) {
    if (artifact.kind === 'hook') {
      if (!(await confirmHook(homeDir, artifact, deps))) continue
      await installHook(homeDir, artifact)
      deps.log(`✓ ${artifact.name} (hook) instalado no claude`)
      continue
    }
    const result = await installArtifact(homeDir, artifact, harnesses, sha)
    reportInstall(artifact, result, deps.log)
  }

  if (harnesses.includes('gemini')) await syncGeminiContext(homeDir)
  return 0
}

/**
 * @param {import('../library.js').Artifact[]} artifacts
 * @param {string[]} names
 * @param {(line: string) => void} log
 * @returns {import('../library.js').Artifact[]|null} null quando algum nome não existe
 */
function pickByName(artifacts, names, log) {
  if (names.length === 0) {
    log('informe ao menos um nome, ou use --all')
    return null
  }
  const picked = []
  for (const name of names) {
    const artifact = artifacts.find((a) => a.name === name)
    if (!artifact) {
      log(`não encontrado: ${name}`)
      return null
    }
    picked.push(artifact)
  }
  return picked
}

/**
 * @param {string} homeDir
 * @param {import('../library.js').Artifact} artifact
 * @param {{ log: (line: string) => void, confirm?: (q: string) => Promise<boolean> }} deps
 * @returns {Promise<boolean>}
 */
async function confirmHook(homeDir, artifact, deps) {
  const { diff } = await previewHook(homeDir, artifact)
  deps.log(`o hook "${artifact.name}" vai alterar ~/.claude/settings.json:`)
  deps.log(diff)

  const confirm = deps.confirm ?? (async () => false)
  const approved = await confirm('aplicar? [y/N] ')
  if (!approved) deps.log(`pulado: ${artifact.name}`)
  return approved
}

/**
 * @param {import('../library.js').Artifact} artifact
 * @param {import('../install.js').InstallResult} result
 * @param {(line: string) => void} log
 */
function reportInstall(artifact, result, log) {
  for (const entry of result.installed) {
    const note = entry.mode === 'copy' ? ' (cópia — link negado pelo sistema)' : ''
    log(`✓ ${artifact.name} → ${entry.harness}${note}`)
  }
  for (const skip of result.skipped) {
    log(`· ${artifact.name} → ${skip.harness}: ${skip.reason}`)
  }
  if (artifact.kind === 'agent' && result.installed.some((e) => e.harness === 'copilot')) {
    if (!artifact.attrs.targets?.copilot?.tools) {
      log(`  aviso: agent "${artifact.name}" instalado no Copilot sem restrição de tools`)
    }
  }
}

/** @param {import('../git-store.js').GitStore} gitStore @returns {Promise<string>} */
async function safeHead(gitStore) {
  try {
    return await gitStore.head()
  } catch {
    return 'desconhecido'
  }
}
```

- [ ] **Step 5: Implementar `src/commands/remove.js`**

```js
import { readLibrary, findArtifact } from '../library.js'
import { storePaths } from '../paths.js'
import { uninstallArtifact, syncGeminiContext } from '../install.js'
import { uninstallHook } from '../hooks.js'

/**
 * @param {string} homeDir
 * @param {{ _?: string[] }} args
 * @param {{ log: (line: string) => void }} deps
 * @returns {Promise<number>}
 */
export async function runRemove(homeDir, args, deps) {
  const names = args._ ?? []
  if (names.length === 0) {
    deps.log('informe ao menos um nome')
    return 1
  }

  const artifacts = await readLibrary(storePaths(homeDir).repo)
  for (const name of names) {
    const artifact = findArtifact(artifacts, name)
    if (artifact?.kind === 'hook') {
      await uninstallHook(homeDir, artifact)
      deps.log(`✓ ${name} (hook) removido`)
      continue
    }
    const removed = await uninstallArtifact(homeDir, name)
    deps.log(removed > 0 ? `✓ ${name} removido de ${removed} harness(es)` : `· ${name} não estava instalado`)
  }

  await syncGeminiContextIfPresent(homeDir)
  return 0
}

/** @param {string} homeDir @returns {Promise<void>} */
async function syncGeminiContextIfPresent(homeDir) {
  try {
    await syncGeminiContext(homeDir)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
```

- [ ] **Step 6: Implementar `src/commands/update.js`**

```js
import { readLibrary } from '../library.js'
import { storePaths } from '../paths.js'
import { buildDerivatives } from '../build.js'
import { installArtifact, syncGeminiContext } from '../install.js'
import { readInstalled } from '../state.js'
import { resolveHarnesses } from '../harness.js'
import { maybeFetch } from './status.js'

/**
 * Aplica as atualizações: pull, rebuild dos derivados e religa o que estava instalado.
 * Skill editada localmente é PULADA — o usuário escolheu que nada muda sob seus pés.
 *
 * @param {string} homeDir
 * @param {{ force?: boolean, harness?: string }} args
 * @param {{ log: (line: string) => void, gitStore: import('../git-store.js').GitStore, now?: number }} deps
 * @returns {Promise<number>}
 */
export async function runUpdate(homeDir, args, deps) {
  await maybeFetch(homeDir, deps.gitStore, deps.now ?? Date.now())

  const modified = await deps.gitStore.locallyModified()
  if (modified.length > 0 && !args.force) {
    deps.log('há arquivos editados localmente no store:')
    for (const file of modified) deps.log(`  ! ${file}`)
    deps.log('\nnada foi alterado. Use `--force` para sobrescrever.')
    return 0
  }

  await deps.gitStore.pull()

  const artifacts = await readLibrary(storePaths(homeDir).repo)
  await buildDerivatives(homeDir, artifacts)

  const installed = await readInstalled(homeDir)
  const names = [...new Set(installed.map((e) => e.name))]
  const harnesses = await resolveHarnesses(args.harness, homeDir)
  const sha = await deps.gitStore.head()

  for (const name of names) {
    const artifact = artifacts.find((a) => a.name === name)
    if (!artifact) {
      deps.log(`· ${name} não existe mais na biblioteca — rode \`aec-skills remove ${name}\``)
      continue
    }
    await installArtifact(homeDir, artifact, harnesses, sha)
    deps.log(`✓ ${name} atualizado`)
  }

  if (harnesses.includes('gemini')) await syncGeminiContext(homeDir)
  deps.log(`\nstore em ${sha}`)
  return 0
}
```

- [ ] **Step 7: Implementar `src/commands/uninstall.js`**

```js
import { readFile, rm, writeFile } from 'node:fs/promises'
import { readInstalled } from '../state.js'
import { uninstallArtifact } from '../install.js'
import { storePaths } from '../paths.js'
import { HARNESSES } from '../harness.js'
import { removeTextBlock } from '../merge-block.js'

/**
 * Remove todos os links e apaga o store. Irreversível — exige confirmação.
 * @param {string} homeDir
 * @param {{ yes?: boolean }} args
 * @param {{ log: (line: string) => void, confirm?: (q: string) => Promise<boolean> }} deps
 * @returns {Promise<number>}
 */
export async function runUninstall(homeDir, args, deps) {
  const confirm = deps.confirm ?? (async () => false)
  const approved = args.yes || (await confirm('remover TODAS as skills e o store ~/.aec-skills? [y/N] '))
  if (!approved) {
    deps.log('cancelado')
    return 1
  }

  const names = [...new Set((await readInstalled(homeDir)).map((e) => e.name))]
  for (const name of names) await uninstallArtifact(homeDir, name)

  await cleanGeminiContext(homeDir)
  await rm(storePaths(homeDir).store, { recursive: true, force: true })

  deps.log(`✓ ${names.length} artefato(s) removido(s) e store apagado`)
  return 0
}

/** @param {string} homeDir @returns {Promise<void>} */
async function cleanGeminiContext(homeDir) {
  const file = HARNESSES.gemini.contextFile(homeDir)
  try {
    const existing = await readFile(file, 'utf8')
    await writeFile(file, removeTextBlock(existing))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
```

- [ ] **Step 8: Implementar `src/commands/login.js`**

```js
import { GitStore } from '../git-store.js'
import { resolveToken } from '../auth.js'
import { readConfig, writeConfig } from '../state.js'
import { storePaths } from '../paths.js'

/**
 * Autentica e clona a biblioteca. O token nunca é impresso.
 * @param {string} homeDir
 * @param {{ _?: string[] }} args primeiro item: a URL do repositório
 * @param {{ log: (line: string) => void, env: NodeJS.ProcessEnv }} deps
 * @returns {Promise<number>}
 */
export async function runLogin(homeDir, args, deps) {
  const config = await readConfig(homeDir)
  const remoteUrl = args._?.[0] ?? config.remoteUrl
  if (!remoteUrl) {
    deps.log('informe a URL do repositório: npx aec-skills login https://github.com/org/lib.git')
    return 1
  }

  const token = await resolveToken(deps.env)
  const { repo } = storePaths(homeDir)
  const gitStore = new GitStore(repo)

  if (await gitStore.isClone()) {
    deps.log('biblioteca já clonada — rode `npx aec-skills update` para atualizar')
    return 0
  }

  await gitStore.clone(remoteUrl, token)
  await writeConfig(homeDir, { ...config, remoteUrl, token })

  deps.log(`✓ biblioteca clonada em ${repo}`)
  deps.log('rode `npx aec-skills list` para ver o que há disponível')
  return 0
}
```

- [ ] **Step 9: Ligar o dispatch em `src/cli.js`**

Substituir o corpo de `runCli` (as duas últimas linhas, `log('comando desconhecido...')` e `return 1`) por:

```js
import { homedir } from 'node:os'
import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline/promises'
import { GitStore } from './git-store.js'
import { storePaths } from './paths.js'
import { runLogin } from './commands/login.js'
import { runList } from './commands/list.js'
import { runAdd } from './commands/add.js'
import { runRemove } from './commands/remove.js'
import { runStatus } from './commands/status.js'
import { runUpdate } from './commands/update.js'
import { runUninstall } from './commands/uninstall.js'

const COMMANDS = {
  login: runLogin,
  list: runList,
  add: runAdd,
  remove: runRemove,
  status: runStatus,
  update: runUpdate,
  uninstall: runUninstall,
}

// ... dentro de runCli, no lugar do "comando desconhecido":

  const run = COMMANDS[command]
  if (!run) {
    log(`comando desconhecido: ${command}`)
    log(HELP)
    return 1
  }

  const homeDir = io.homeDir ?? homedir()
  const args = parseCommandArgs(argv.slice(1))
  const gitStore = new GitStore(storePaths(homeDir).repo)
  const deps = { log, gitStore, env: process.env, confirm: askYesNo }

  try {
    // runStatus tem assinatura (homeDir, gitStore, io); os demais (homeDir, args, deps)
    return command === 'status'
      ? await runStatus(homeDir, gitStore, { log })
      : await run(homeDir, args, deps)
  } catch (error) {
    log(`erro: ${error.message}`)
    return 1
  }
}

/**
 * @param {string[]} argv
 * @returns {{ _: string[], all?: boolean, force?: boolean, yes?: boolean, harness?: string }}
 */
function parseCommandArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      all: { type: 'boolean' },
      force: { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      harness: { type: 'string' },
    },
    allowPositionals: true,
  })
  return { ...values, _: positionals }
}

/**
 * @param {string} question
 * @returns {Promise<boolean>}
 */
async function askYesNo(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(question)
    return answer.trim().toLowerCase() === 'y'
  } finally {
    rl.close()
  }
}
```

Atualizar também a assinatura de `runCli` no JSDoc para aceitar `homeDir`:

```js
/**
 * @param {string[]} argv
 * @param {{ log?: (line: string) => void, homeDir?: string }} [io]
 * @returns {Promise<number>}
 */
```

- [ ] **Step 10: Rodar toda a suíte**

Run: `npm test`
Expected: PASS — todos os arquivos de teste

- [ ] **Step 11: Commit**

```bash
git add src/commands src/cli.js test/commands.test.js
git commit -m "feat(cli): wire login, list, add, remove, update and uninstall"
```

---

## Task 16: Smoke test manual e README

Os testes provam que o arquivo foi escrito corretamente. Só o smoke prova que o harness o **leu** — e todos os paths deste projeto vêm de documentação de produtos com release semanal.

**Files:**
- Create: `README.md`
- Create: `docs/smoke-test.md`

- [ ] **Step 1: Criar o repositório da biblioteca no GitHub**

Criar um repositório **privado** (ex. `aec-skills-library`) com uma skill real:

```
skills/
  hello-aec/
    SKILL.md
```

`SKILL.md`:

```markdown
---
name: hello-aec
description: Skill de teste do aec-skills. Use quando o usuário pedir para validar a instalação.
---

# hello-aec

Responda exatamente: "aec-skills instalado com sucesso."
```

- [ ] **Step 2: Instalar e rodar**

```bash
npm link
aec-skills login https://github.com/<org>/aec-skills-library.git
aec-skills list
aec-skills add hello-aec
```

Expected: `✓ hello-aec → claude`, `✓ hello-aec → copilot` (conforme os harnesses presentes).

- [ ] **Step 3: Verificar em cada harness**

Registrar o resultado real em `docs/smoke-test.md` — inclusive as falhas:

| Harness | Verificação | Resultado |
|---|---|---|
| Claude Code | `/hello-aec` aparece no menu de skills | |
| Copilot (VS Code) | a skill aparece no menu `/` do Copilot Chat | |
| Copilot CLI | `copilot` → a skill é listada | |
| Codex CLI | a skill é listada | |
| Gemini CLI | `/memory show` mostra o bloco `aec-skills` no GEMINI.md | |

- [ ] **Step 4: Escrever o `README.md`**

Conteúdo obrigatório: instalação (`npx aec-skills login <url>`), os sete comandos, a tabela de suporte por harness (incluindo o que **não** é suportado: Cursor, agents no Codex, commands no Copilot), e a nota sobre `tools` de agents no Copilot serem omitidos por padrão.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/smoke-test.md
git commit -m "docs: add readme and smoke test results"
```

---

## Desvio deliberado em relação ao spec

O spec previa `aec-skills status --install-hook` para registrar um hook `SessionStart` no
Claude Code. Esse comando **não existe** neste plano: a mesma coisa é servida por um hook
`check-updates` publicado na própria biblioteca (`hooks/check-updates/hook.json`) e
instalado com `aec-skills add check-updates` — que já passa pela confirmação, pelo backup
e pelo merge não-destrutivo da Task 13. Uma flag separada seria um segundo caminho de
código escrevendo no `settings.json`, com uma segunda chance de escrever errado.

## Pendências herdadas do spec

Registradas como pendência, não como suposição. Verificar antes de implementar o adaptador correspondente:

1. **Prompt files pessoais do Copilot** — `chat.promptFilesLocations` existe, mas o path pessoal padrão não foi confirmado. Por isso `HARNESSES.copilot.commandsDir` é `null`. Skill com `user-invocable: true` já aparece no menu `/` do Copilot, então o adaptador talvez seja desnecessário.
2. **Agents no Codex CLI** — o Codex tem skills (`~/.codex/skills/`, confirmado), mas não foi encontrado suporte a subagents. Por isso `HARNESSES.codex.agentsDir` é `null`.
3. **Recursão em `~/.claude/skills/`** — relatos da comunidade indicam que subpastas dentro de um diretório de skill podem não ser escaneadas. Irrelevante para o design atual (uma skill = um diretório de topo).

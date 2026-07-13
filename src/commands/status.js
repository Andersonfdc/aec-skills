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
    const change = classifyChange(name, editedNames, installedNames)
    if (change) changes.push(change)
  }
  return changes
}

/**
 * Classifica um artefato remotamente alterado como `modified` ou `new`.
 * Editado localmente já foi reportado como `locally-edited` — não duplica.
 * @param {string} name
 * @param {Set<string>} editedNames
 * @param {Set<string>} installedNames
 * @returns {Change|null} null quando o artefato foi editado localmente
 */
function classifyChange(name, editedNames, installedNames) {
  if (editedNames.has(name)) return null
  return installedNames.has(name)
    ? { kind: 'modified', name, detail: 'modificada na biblioteca' }
    : { kind: 'new', name, detail: 'nova na biblioteca' }
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
  // isClone() falha "limpo" (devolve false) tanto quando o repo nunca foi
  // clonado quanto quando o diretório não existe ainda — nos dois casos
  // `#git()` roda com `cwd` ausente, execFile falha com ENOENT no próprio
  // spawn, e isso é indistinguível de "git não instalado" (ver clone() em
  // git-store.js). Checar aqui evita chamar `computeChanges` -> `locallyModified()`
  // sem esse guarda, que propagava GitNotInstalledError e o CLI acusava git
  // ausente numa máquina que só nunca rodou `login`.
  if (!(await gitStore.isClone())) {
    log('biblioteca vazia — rode `npx aec-skills login` para clonar')
    return 1
  }
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

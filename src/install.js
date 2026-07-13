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
    const source = resolveTargetFromEntry(homeDir, entry)
    if (await unlinkPath(entry.dest, source, entry.mode)) removed += 1
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
 * @param {{ kind: import('./library.js').Artifact['kind'], name: string }} artifact
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
  return resolveTarget(homeDir, { kind: entry.kind, name: entry.name }, entry.harness).source
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

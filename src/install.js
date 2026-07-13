import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { HARNESSES } from './harness.js'
import { linkPath, unlinkPath, DestinationOccupiedError } from './linker.js'
import { readInstalled, writeInstalled, upsertInstalled } from './state.js'
import { mergeTextBlock } from './merge-block.js'
import { removeHookFragment } from './hooks.js'
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
 * Destino já registrado em `installed.json` é NOSSO: removemos antes de religar,
 * em vez de recusá-lo. Sem isso, uma instalação em modo `copy` (o caso normal no
 * Windows: symlink de arquivo dá EPERM, então agents e commands sempre caem para
 * cópia) nunca mais poderia ser atualizada — `linkPath` veria um arquivo comum no
 * destino e levantaria `DestinationOccupiedError` sobre um arquivo criado por nós.
 * Destino SEM entrada em `installed.json` continua sendo do usuário e é recusado.
 *
 * @param {string} homeDir
 * @param {import('./library.js').Artifact} artifact
 * @param {import('./harness.js').HarnessId[]} harnesses
 * @param {string} sha SHA do store no momento da instalação
 * @returns {Promise<InstallResult>}
 */
export async function installArtifact(homeDir, artifact, harnesses, sha) {
  const result = { installed: [], skipped: [] }
  const owned = await readInstalled(homeDir)

  for (const harness of harnesses) {
    const target = resolveTarget(homeDir, artifact, harness)
    if (!target) {
      result.skipped.push({ harness, reason: `${harness} não suporta ${artifact.kind}` })
      continue
    }
    const previous = owned.find((e) => e.dest === target.dest)
    if (previous) await unlinkPath(target.dest, target.source, previous.mode)

    try {
      const mode = await linkPath(target.source, target.dest)
      result.installed.push({ name: artifact.name, kind: artifact.kind, harness, dest: target.dest, mode, sha })
    } catch (error) {
      if (!(error instanceof DestinationOccupiedError)) throw error
      result.skipped.push({ harness, reason: `já existe e não é nosso: ${error.dest}` })
    }
  }

  await upsertInstalled(homeDir, result.installed)
  return result
}

/**
 * Remove todos os destinos de um artefato e o retira de installed.json.
 *
 * Entrada de hook não tem destino próprio: seu `dest` é o settings.json do
 * usuário, que nunca pode ser apagado. Ela é desfeita retirando do arquivo o
 * fragmento registrado na própria entrada — sem ler o repo, que o `uninstall`
 * apaga logo em seguida.
 * @param {string} homeDir
 * @param {string} name
 * @returns {Promise<number>} quantos destinos foram removidos
 */
export async function uninstallArtifact(homeDir, name) {
  const entries = await readInstalled(homeDir)
  const [mine, others] = partition(entries, (e) => e.name === name)

  let removed = 0
  for (const entry of mine) {
    if (entry.kind === 'hook') {
      if (!entry.fragment) continue
      await removeHookFragment(homeDir, entry.fragment)
      removed += 1
      continue
    }
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

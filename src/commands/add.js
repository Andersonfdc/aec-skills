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

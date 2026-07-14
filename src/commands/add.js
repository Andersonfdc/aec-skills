import { readLibrary, findArtifact } from '../library.js'
import { expandRequires, publicArtifacts } from '../deps.js'
import { storePaths } from '../paths.js'
import { resolveHarnesses } from '../harness.js'
import { buildDerivatives } from '../build.js'
import { installArtifact, syncGeminiContext } from '../install.js'
import { previewHook, installHook } from '../hooks.js'
import { CLI_INVOCATION } from '../constants.js'

/**
 * @param {string} homeDir
 * @param {{ _?: string[], all?: boolean, harness?: string }} args
 * @param {{ log: (line: string) => void, gitStore: import('../git-store.js').GitStore, confirm?: (q: string) => Promise<boolean> }} deps
 * @returns {Promise<number>}
 */
export async function runAdd(homeDir, args, deps) {
  const artifacts = await readLibrary(storePaths(homeDir).repo)
  if (artifacts.length === 0) {
    deps.log(`biblioteca vazia — rode \`${CLI_INVOCATION} login\` para clonar`)
    return 1
  }

  const chosen = args.all ? publicArtifacts(artifacts).map((a) => a.name) : (args._ ?? [])
  if (!args.all && chosen.length === 0) {
    deps.log('informe ao menos um nome, ou use --all')
    return 1
  }

  const wanted = resolveWanted(artifacts, chosen, deps.log)
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
      // Hook só existe no Claude Code — mas escrever no settings.json cria o
      // ~/.claude. Com `--harness` excluindo claude, o usuário disse que não o
      // quer como alvo; criar o diretório aqui o inventaria.
      if (!harnesses.includes('claude')) {
        deps.log(`· ${artifact.name} (hook) → claude não está entre os harnesses alvo`)
        continue
      }
      if (!(await confirmHook(homeDir, artifact, deps))) continue
      await installHook(homeDir, artifact, sha)
      deps.log(`✓ ${artifact.name} (hook) instalado no claude`)
      continue
    }
    const result = await installArtifact(homeDir, artifact, harnesses, sha)
    reportInstall(artifact, result, deps.log)
  }

  if (harnesses.includes('gemini')) await syncGeminiContext(homeDir, artifacts)
  return 0
}

/**
 * Resolve o que o usuário escolheu para o que precisa ser instalado de fato:
 * cada artefato arrasta o que declara em `requires`. Escolher a `white-box-qa`
 * instala os subagentes que ela despacha — ela não funciona sem eles, e obrigar
 * o usuário a marcá-los um a um seria vazar a nossa estrutura interna para ele.
 * @param {import('../library.js').Artifact[]} artifacts
 * @param {string[]} names
 * @param {(line: string) => void} log
 * @returns {import('../library.js').Artifact[]|null} null quando algum nome não existe
 */
function resolveWanted(artifacts, names, log) {
  const unknown = names.filter((name) => !findArtifact(artifacts, name))
  if (unknown.length > 0) {
    for (const name of unknown) log(`não encontrado: ${name}`)
    return null
  }

  const { names: expanded, missing } = expandRequires(artifacts, names)
  if (missing.length > 0) {
    // A biblioteca está inconsistente: alguém publicou um `requires` para um
    // artefato que não existe. Instalar pela metade seria pior que recusar.
    log(`biblioteca inconsistente — dependência inexistente: ${missing.join(', ')}`)
    return null
  }

  const pulled = expanded.filter((name) => !names.includes(name))
  if (pulled.length > 0) log(`· junto: ${pulled.join(', ')}`)

  return expanded.map((name) => findArtifact(artifacts, name))
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
    const note = entry.mode === 'copy' ? ' (cópia — link negado pelo sistema)'
      : entry.mode === 'index' ? ' (índice)' : ''
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

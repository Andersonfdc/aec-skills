import { readLibrary } from '../library.js'
import { storePaths } from '../paths.js'
import { buildDerivatives } from '../build.js'
import { installArtifact, syncGeminiContext } from '../install.js'
import { readInstalled } from '../state.js'
import { resolveHarnesses } from '../harness.js'
import { maybeFetch } from './status.js'
import { CLI_INVOCATION } from '../constants.js'

/**
 * Aplica as atualizações: pull, rebuild dos derivados e religa o que estava instalado.
 * Artefato editado localmente é PULADO — o usuário escolheu que nada muda sob seus pés.
 *
 * @param {string} homeDir
 * @param {{ force?: boolean, harness?: string }} args
 * @param {{ log: (line: string) => void, gitStore: import('../git-store.js').GitStore, now?: number }} deps
 * @returns {Promise<number>}
 */
export async function runUpdate(homeDir, args, deps) {
  // Mesmo guarda de runStatus (status.js): sem store, `locallyModified()`
  // roda `#git()` com `cwd` ausente e o ENOENT do spawn vira GitNotInstalledError
  // — checar isClone() primeiro troca esse crash enganoso por uma mensagem correta.
  if (!(await deps.gitStore.isClone())) {
    deps.log(`biblioteca vazia — rode \`${CLI_INVOCATION} login\` para clonar`)
    return 1
  }

  await maybeFetch(homeDir, deps.gitStore, deps.now ?? Date.now())

  const modified = await deps.gitStore.locallyModified()
  if (modified.length > 0) {
    if (!args.force) {
      deps.log('há artefato(s) editado localmente no store:')
      for (const file of modified) deps.log(`  ! ${file}`)
      deps.log('\nnada foi alterado. Use --force para sobrescrever.')
      return 0
    }
    // `pull --ff-only` aborta com árvore suja: sem descartar as edições aqui,
    // --force apenas pulava o aviso e falhava logo em seguida.
    deps.log(`--force: descartando ${modified.length} edição(ões) local(is) no store`)
    await deps.gitStore.resetHard()
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
      deps.log(`· ${name} não existe mais na biblioteca — rode \`${CLI_INVOCATION} remove ${name}\``)
      continue
    }
    const result = await installArtifact(homeDir, artifact, harnesses, sha)
    reportUpdate(name, result, deps.log)
  }

  if (harnesses.includes('gemini')) await syncGeminiContext(homeDir, artifacts)
  deps.log(`\nstore em ${sha}`)
  return 0
}

/**
 * Relata o resultado real. Um artefato pulado em TODOS os harnesses não foi
 * atualizado — dizer "✓ atualizado" ali esconderia exatamente o destino que o
 * CLI se recusou a tocar.
 * @param {string} name
 * @param {import('../install.js').InstallResult} result
 * @param {(line: string) => void} log
 */
function reportUpdate(name, result, log) {
  if (result.installed.length > 0) log(`✓ ${name} atualizado`)
  for (const skip of result.skipped) log(`· ${name} → ${skip.harness}: ${skip.reason}`)
}

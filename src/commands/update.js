import { readLibrary } from '../library.js'
import { storePaths } from '../paths.js'
import { buildDerivatives } from '../build.js'
import { installArtifact, syncGeminiContext } from '../install.js'
import { readInstalled } from '../state.js'
import { resolveHarnesses } from '../harness.js'
import { maybeFetch } from './status.js'

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
  await maybeFetch(homeDir, deps.gitStore, deps.now ?? Date.now())

  const modified = await deps.gitStore.locallyModified()
  if (modified.length > 0 && !args.force) {
    deps.log('há artefato(s) editado localmente no store:')
    for (const file of modified) deps.log(`  ! ${file}`)
    deps.log('\nnada foi alterado. Use --force para sobrescrever.')
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

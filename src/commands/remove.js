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

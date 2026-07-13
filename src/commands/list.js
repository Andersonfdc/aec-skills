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

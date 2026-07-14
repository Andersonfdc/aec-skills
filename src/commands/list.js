import { readLibrary } from '../library.js'
import { publicArtifacts } from '../deps.js'
import { readInstalled } from '../state.js'
import { storePaths } from '../paths.js'
import { CLI_INVOCATION } from '../constants.js'

/**
 * @param {string} homeDir
 * @param {{ harness?: string }} _args
 * @param {{ log: (line: string) => void }} deps
 * @returns {Promise<number>} exit code
 */
export async function runList(homeDir, _args, deps) {
  const artifacts = await readLibrary(storePaths(homeDir).repo)
  if (artifacts.length === 0) {
    deps.log(`biblioteca vazia — rode \`${CLI_INVOCATION} login\` para clonar`)
    return 1
  }

  const installed = new Set((await readInstalled(homeDir)).map((e) => e.name))
  const shown = publicArtifacts(artifacts)

  for (const artifact of shown) {
    const mark = installed.has(artifact.name) ? '✓' : ' '
    const description = artifact.attrs.description ?? ''
    deps.log(`${mark} ${artifact.kind.padEnd(8)} ${artifact.name.padEnd(24)} ${description}`)
  }

  // Os componentes não são escondidos por vergonha — só não são escolhas. Dizer
  // quantos são evita que a lista pareça incompleta.
  const internals = artifacts.length - shown.length
  if (internals > 0) {
    deps.log(`\n(+${internals} componente(s) interno(s), instalados junto com quem os exige)`)
  }
  return 0
}

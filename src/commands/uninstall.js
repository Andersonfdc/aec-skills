import { readFile, rm, writeFile } from 'node:fs/promises'
import { readInstalled } from '../state.js'
import { uninstallArtifact } from '../install.js'
import { storePaths } from '../paths.js'
import { HARNESSES } from '../harness.js'
import { removeTextBlock } from '../merge-block.js'

/**
 * Remove todos os links e apaga o store. Irreversível — exige confirmação.
 * @param {string} homeDir
 * @param {{ yes?: boolean }} args
 * @param {{ log: (line: string) => void, confirm?: (q: string) => Promise<boolean> }} deps
 * @returns {Promise<number>}
 */
export async function runUninstall(homeDir, args, deps) {
  const confirm = deps.confirm ?? (async () => false)
  const approved = args.yes || (await confirm('remover TODAS as skills e o store ~/.aec-skills? [y/N] '))
  if (!approved) {
    deps.log('cancelado')
    return 1
  }

  const names = [...new Set((await readInstalled(homeDir)).map((e) => e.name))]
  for (const name of names) await uninstallArtifact(homeDir, name)

  await cleanGeminiContext(homeDir)
  await rm(storePaths(homeDir).store, { recursive: true, force: true })

  deps.log(`✓ ${names.length} artefato(s) removido(s) e store apagado`)
  return 0
}

/** @param {string} homeDir @returns {Promise<void>} */
async function cleanGeminiContext(homeDir) {
  const file = HARNESSES.gemini.contextFile(homeDir)
  try {
    const existing = await readFile(file, 'utf8')
    await writeFile(file, removeTextBlock(existing))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

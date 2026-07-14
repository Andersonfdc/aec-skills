import { readLibrary, findArtifact } from '../library.js'
import { orphanedInternals } from '../deps.js'
import { storePaths } from '../paths.js'
import { detectHarnesses } from '../harness.js'
import { readInstalled } from '../state.js'
import { uninstallArtifact, syncGeminiContext } from '../install.js'
import { previewHook, uninstallHook } from '../hooks.js'

/**
 * @param {string} homeDir
 * @param {{ _?: string[] }} args
 * @param {{ log: (line: string) => void, confirm?: (q: string) => Promise<boolean> }} deps
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
      await removeHook(homeDir, artifact, deps)
      continue
    }
    const removed = await uninstallArtifact(homeDir, name)
    deps.log(removed > 0 ? `✓ ${name} removido de ${removed} harness(es)` : `· ${name} não estava instalado`)
  }

  await removeOrphans(homeDir, artifacts, deps)

  // Só reescreve o GEMINI.md se o usuário já tem Gemini. syncGeminiContext faz
  // `mkdir` do ~/.gemini, e como detectHarnesses É "o diretório raiz existe",
  // um `remove` numa máquina sem Gemini criava o diretório e fazia o Gemini
  // passar a ser detectado como alvo para sempre.
  if ((await detectHarnesses(homeDir)).includes('gemini')) await syncGeminiContext(homeDir, artifacts)
  return 0
}

/**
 * Varre os componentes que ficaram sem dono. Ao remover a `white-box-qa`, os
 * subagentes que só existiam para ela ficariam instalados para sempre — o
 * usuário nunca os escolheu, então não é dele a tarefa de lembrar de tirá-los.
 *
 * Um componente ainda exigido por outra coisa instalada permanece; um produto
 * nunca é varrido, porque alguém o quis explicitamente.
 * @param {string} homeDir
 * @param {import('../library.js').Artifact[]} artifacts
 * @param {{ log: (line: string) => void }} deps
 * @returns {Promise<void>}
 */
async function removeOrphans(homeDir, artifacts, deps) {
  const stillInstalled = [...new Set((await readInstalled(homeDir)).map((e) => e.name))]
  const orphans = orphanedInternals(artifacts, stillInstalled)

  for (const name of orphans) {
    const removed = await uninstallArtifact(homeDir, name)
    if (removed > 0) deps.log(`· ${name} removido junto — nada mais o exige`)
  }
}

/**
 * Remover um hook edita o settings.json do usuário, e o casamento das entradas
 * é por igualdade profunda, sem marcador de proveniência (ver merge-block.js):
 * uma entrada que o usuário tenha escrito byte-idêntica à nossa é
 * indistinguível e seria apagada junto. Por isso mostra o que sai e exige y/N,
 * simétrico ao que o `add` faz antes de injetar.
 * @param {string} homeDir
 * @param {import('../library.js').Artifact} artifact
 * @param {{ log: (line: string) => void, confirm?: (q: string) => Promise<boolean> }} deps
 * @returns {Promise<void>}
 */
async function removeHook(homeDir, artifact, deps) {
  const { diff } = await previewHook(homeDir, artifact, '-')
  deps.log(`remover o hook "${artifact.name}" vai alterar ~/.claude/settings.json:`)
  deps.log(diff)

  const confirm = deps.confirm ?? (async () => false)
  if (!(await confirm('aplicar? [y/N] '))) {
    deps.log(`pulado: ${artifact.name} — settings.json não foi tocado`)
    return
  }

  // Hook registrado em installed.json some por ali (fragmento gravado na entrada).
  // Sem entrada — instalado antes do registro existir — o fragmento vem do repo,
  // que aqui, ao contrário do `uninstall`, ainda está no disco.
  if ((await uninstallArtifact(homeDir, artifact.name)) === 0) await uninstallHook(homeDir, artifact)
  deps.log(`✓ ${artifact.name} (hook) removido`)
}

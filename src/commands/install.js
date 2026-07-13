import { readLibrary } from '../library.js'
import { storePaths } from '../paths.js'
import { resolveHarnesses } from '../harness.js'
import { selectFromMenu } from '../tui.js'
import { BANNER } from '../banner.js'
import { CLI_INVOCATION } from '../constants.js'
import { runLogin } from './login.js'
import { runAdd } from './add.js'

/**
 * Instalador interativo: banner, login se preciso, menu de seleção e `add`.
 * É o que roda quando o CLI é chamado sem comando algum, num TTY.
 * @param {string} homeDir
 * @param {{ harness?: string }} args
 * @param {{ log: (line: string) => void, gitStore: import('../git-store.js').GitStore, env?: NodeJS.ProcessEnv, select?: typeof selectFromMenu }} deps
 * @returns {Promise<number>} exit code
 */
export async function runInstall(homeDir, args, deps) {
  // Sem terminal não há como desenhar o menu nem ler as teclas: `install` num
  // pipe ou na CI leria lixo do stdin em vez de esperar. Sai dizendo o que usar.
  const isTTY = deps.isTTY ?? process.stdin.isTTY
  if (!isTTY) {
    deps.log(`o instalador interativo precisa de um terminal — use \`${CLI_INVOCATION} add <nome>\` ou \`add --all\``)
    return 1
  }

  deps.log(BANNER)

  const repo = storePaths(homeDir).repo
  if ((await readLibrary(repo)).length === 0) {
    const code = await runLogin(homeDir, { _: [] }, deps)
    if (code !== 0) return code
    deps.log('')
  }

  const artifacts = await readLibrary(repo)
  if (artifacts.length === 0) {
    deps.log('a biblioteca não tem nenhum artefato')
    return 1
  }

  const harnesses = await resolveHarnesses(args.harness, homeDir)
  if (harnesses.length === 0) {
    deps.log('nenhum harness detectado — nada a fazer')
    return 1
  }

  const select = deps.select ?? selectFromMenu
  const items = artifacts.map((a) => ({
    name: a.name,
    kind: a.kind,
    description: a.attrs.description ?? '',
  }))
  const chosen = await select(items, {
    title: 'Selecione o que instalar:',
    note: `Harnesses detectados: ${harnesses.join(', ')}`,
  })

  if (chosen === null) {
    deps.log('cancelado')
    return 1
  }
  if (chosen.length === 0) {
    deps.log('nada selecionado')
    return 0
  }

  return runAdd(homeDir, { _: chosen, harness: args.harness }, deps)
}

import { readLibrary } from '../library.js'
import { storePaths } from '../paths.js'
import { resolveHarnesses } from '../harness.js'
import { publicArtifacts } from '../deps.js'
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

  await refreshStore(deps)

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
  // O menu oferece produtos, não peças: os componentes que uma skill despacha
  // vêm junto com ela no `add`. Listá-los seria pedir ao usuário para decidir
  // sobre a nossa estrutura interna.
  const items = publicArtifacts(artifacts).map((a) => ({
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

/**
 * Pergunta ao remoto se a biblioteca andou, e oferece aplicar antes de listar.
 *
 * Sem isto o instalador desenha o menu a partir do store em disco e nunca
 * descobre que existe skill nova — quem clonou ontem enxerga a biblioteca de
 * ontem, para sempre, sem um aviso sequer. O `fetch` não muda nada; o `pull` só
 * acontece com o "sim" do usuário, porque as skills instaladas são links para
 * dentro do store e puxar altera o conteúdo delas na hora.
 *
 * Falha de rede não é fatal: instalar o que já está em disco continua valendo.
 * @param {{ log: (line: string) => void, gitStore: import('../git-store.js').GitStore, confirm?: (q: string) => Promise<boolean> }} deps
 * @returns {Promise<void>}
 */
async function refreshStore(deps) {
  try {
    await deps.gitStore.fetch()
    const [local, remote] = await Promise.all([
      deps.gitStore.head(),
      deps.gitStore.remoteHead(),
    ])
    if (local === remote) return

    deps.log('  A biblioteca tem atualizações que você ainda não tem.')
    const confirm = deps.confirm ?? (async () => false)
    if (!(await confirm('  atualizar antes de instalar? [y/N] '))) {
      deps.log('  seguindo com a versão local — rode `update` quando quiser aplicar')
      deps.log('')
      return
    }
    await deps.gitStore.pull()
    deps.log('  ✓ biblioteca atualizada')
    deps.log('')
  } catch (error) {
    deps.log(`  não foi possível consultar o remoto (${error.message})`)
    deps.log('  seguindo com a biblioteca que está em disco')
    deps.log('')
  }
}

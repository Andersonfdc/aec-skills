import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { runInstall } from '../src/commands/install.js'
import { storePaths } from '../src/paths.js'
import { DEFAULT_REMOTE_URL } from '../src/constants.js'
import { FakeGitStore } from './helpers/fake-git-store.js'
import { tmpHome } from './helpers/tmp-home.js'

async function seed(home) {
  const { repo } = storePaths(home)
  await mkdir(path.join(repo, 'skills', 'code-review'), { recursive: true })
  await writeFile(
    path.join(repo, 'skills', 'code-review', 'SKILL.md'),
    '---\nname: code-review\ndescription: Revisa código.\n---\n# R\n',
  )
  await mkdir(path.join(home, '.claude'), { recursive: true })
}

/**
 * @param {string[]} lines
 * @param {(items: object[], harnesses: string[]) => Promise<string[]|null>} select
 */
function deps(lines, select) {
  return {
    log: (line) => lines.push(line),
    gitStore: new FakeGitStore({ head: 'abc1234' }),
    env: {},
    isTTY: true,
    select,
  }
}

// Regressão: o guard de TTY vivia só no caminho "sem comando" do cli.js, então
// `install` explícito num pipe abria o menu e ficava lendo lixo do stdin.
test('num pipe, o install recusa em vez de abrir um menu que ninguém pode usar', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const lines = []
  let menuOpened = false

  const code = await runInstall(home, {}, {
    log: (line) => lines.push(line),
    gitStore: new FakeGitStore({ head: 'abc1234' }),
    env: {},
    isTTY: false,
    select: async () => { menuOpened = true; return [] },
  })

  assert.equal(code, 1)
  assert.equal(menuOpened, false)
  assert.match(lines.join('\n'), /precisa de um terminal/)
  assert.match(lines.join('\n'), /add --all/)
})

// Regressão: o instalador lia o store local sem nunca perguntar ao remoto se havia
// novidade. Quem instalou ontem via a biblioteca de ontem, para sempre, sem aviso.
test('store atrasado: o install avisa e oferece atualizar antes do menu', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const lines = []
  const gitStore = new FakeGitStore({ head: 'antigo1', remoteHead: 'novo999' })

  await runInstall(home, {}, {
    log: (line) => lines.push(line),
    gitStore,
    env: {},
    isTTY: true,
    confirm: async () => true,
    select: async () => [],
  })

  assert.deepEqual(gitStore.calls, ['fetch', 'pull'], 'tem que consultar o remoto e aplicar')
  assert.match(lines.join('\n'), /atualizações que você ainda não tem/i)
  assert.match(lines.join('\n'), /biblioteca atualizada/i)
})

test('store atrasado + recusa: nada é puxado, e o menu abre mesmo assim', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const gitStore = new FakeGitStore({ head: 'antigo1', remoteHead: 'novo999' })
  let menuOpened = false

  await runInstall(home, {}, {
    log: () => {},
    gitStore,
    env: {},
    isTTY: true,
    confirm: async () => false,
    select: async () => { menuOpened = true; return [] },
  })

  assert.deepEqual(gitStore.calls, ['fetch'], 'recusou: não puxa')
  assert.equal(menuOpened, true, 'ainda assim dá para instalar o que já está no store')
})

test('store em dia: não pergunta nada, vai direto ao menu', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const gitStore = new FakeGitStore({ head: 'igual11', remoteHead: 'igual11' })
  let asked = false

  await runInstall(home, {}, {
    log: () => {},
    gitStore,
    env: {},
    isTTY: true,
    confirm: async () => { asked = true; return true },
    select: async () => [],
  })

  assert.equal(asked, false)
  assert.deepEqual(gitStore.calls, ['fetch'])
})

test('sem rede: o install avisa e segue com o store local, não morre', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const lines = []
  const gitStore = new FakeGitStore()
  gitStore.fetch = async () => { throw new Error('could not resolve host github.com') }
  let menuOpened = false

  const code = await runInstall(home, {}, {
    log: (line) => lines.push(line),
    gitStore,
    env: {},
    isTTY: true,
    select: async () => { menuOpened = true; return [] },
  })

  assert.equal(code, 0)
  assert.equal(menuOpened, true, 'offline ainda instala o que está em disco')
  assert.match(lines.join('\n'), /não foi possível|offline|sem rede/i)
})

test('install imprime o banner', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const lines = []

  await runInstall(home, {}, deps(lines, async () => []))
  assert.match(lines.join('\n'), /█████╗/)
})

test('install instala o que o menu devolveu', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const lines = []

  const code = await runInstall(home, {}, deps(lines, async () => ['code-review']))

  assert.equal(code, 0)
  await access(path.join(home, '.claude', 'skills', 'code-review'))
  assert.match(lines.join('\n'), /✓ code-review → claude/)
})

test('o menu recebe os artefatos e anuncia os harnesses detectados', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  let seen = null

  await runInstall(home, {}, deps([], async (items, opts) => {
    seen = { items, opts }
    return []
  }))

  assert.deepEqual(seen.items, [
    { name: 'code-review', kind: 'skill', description: 'Revisa código.' },
  ])
  assert.match(seen.opts.note, /claude/)
})

test('cancelar no menu não instala nada', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const lines = []

  const code = await runInstall(home, {}, deps(lines, async () => null))

  assert.equal(code, 1)
  assert.match(lines.join('\n'), /cancelado/)
  await assert.rejects(access(path.join(home, '.claude', 'skills', 'code-review')))
})

test('confirmar sem marcar nada sai limpo, sem instalar', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const lines = []

  const code = await runInstall(home, {}, deps(lines, async () => []))

  assert.equal(code, 0)
  assert.match(lines.join('\n'), /nada selecionado/)
  await assert.rejects(access(path.join(home, '.claude', 'skills', 'code-review')))
})

test('--harness restringe o alvo e o menu enxerga a restrição', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  await mkdir(path.join(home, '.copilot'), { recursive: true })
  let seen = null

  await runInstall(home, { harness: 'copilot' }, deps([], async (_items, opts) => {
    seen = opts.note
    return ['code-review']
  }))

  assert.match(seen, /copilot/)
  assert.doesNotMatch(seen, /claude/)
  await access(path.join(home, '.copilot', 'skills', 'code-review'))
  await assert.rejects(access(path.join(home, '.claude', 'skills', 'code-review')))
})

test('sem harness nenhum, o menu nem abre', async (t) => {
  const home = await tmpHome(t)
  const { repo } = storePaths(home)
  await mkdir(path.join(repo, 'skills', 'code-review'), { recursive: true })
  await writeFile(
    path.join(repo, 'skills', 'code-review', 'SKILL.md'),
    '---\nname: code-review\ndescription: R.\n---\n# R\n',
  )
  const lines = []
  let opened = false

  const code = await runInstall(home, {}, deps(lines, async () => {
    opened = true
    return []
  }))

  assert.equal(code, 1)
  assert.equal(opened, false)
  assert.match(lines.join('\n'), /nenhum harness detectado/)
})

test('sem store, o install faz login antes de abrir o menu', async (t) => {
  const home = await tmpHome(t)
  await mkdir(path.join(home, '.claude'), { recursive: true })
  const lines = []
  let cloner = null
  let menuOpened = false

  // runLogin constrói a própria GitStore (só conhece o token depois de
  // resolveToken) — daí o GitStoreClass em vez de deps.gitStore.
  class Store extends FakeGitStore {
    constructor() {
      super({ cloned: false })
      cloner = this
    }
  }

  // O clone falso não escreve nada em disco, então a biblioteca segue vazia
  // depois do login. O que se verifica aqui é a ordem: login antes do menu.
  const code = await runInstall(home, {}, {
    log: (line) => lines.push(line),
    gitStore: new FakeGitStore(),
    env: { GITHUB_TOKEN: 'ghp_teste' },
    isTTY: true,
    GitStoreClass: Store,
    select: async () => {
      menuOpened = true
      return []
    },
  })

  assert.deepEqual(cloner.calls, [`clone:${DEFAULT_REMOTE_URL}`])
  assert.equal(menuOpened, false)
  assert.equal(code, 1)
  assert.match(lines.join('\n'), /a biblioteca não tem nenhum artefato/)
  assert.doesNotMatch(lines.join('\n'), /ghp_teste/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { runList } from '../src/commands/list.js'
import { runAdd } from '../src/commands/add.js'
import { runRemove } from '../src/commands/remove.js'
import { runUpdate } from '../src/commands/update.js'
import { runUninstall } from '../src/commands/uninstall.js'
import { runLogin } from '../src/commands/login.js'
import { storePaths } from '../src/paths.js'
import { readInstalled, readConfig } from '../src/state.js'
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

async function seedHook(home) {
  const { repo } = storePaths(home)
  const dir = path.join(repo, 'hooks', 'check-updates')
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'hook.json'),
    JSON.stringify({ hooks: { SessionStart: [{ command: 'aec-skills status' }] } }, null, 2),
  )
  await mkdir(path.join(home, '.claude'), { recursive: true })
}

/**
 * `deps.GitStoreClass` para `runLogin`: a real `GitStore` exige rede/git,
 * então injetamos um construtor que sempre devolve a mesma `FakeGitStore`,
 * permitindo inspecionar `fake.calls` depois da chamada.
 * @param {FakeGitStore} fake
 * @returns {new (...args: unknown[]) => FakeGitStore}
 */
function gitStoreClassFor(fake) {
  return class {
    constructor() { return fake }
  }
}

test('runList mostra as skills e marca as instaladas', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const output = []

  const code = await runList(home, {}, { log: (l) => output.push(l), gitStore: new FakeGitStore() })

  assert.equal(code, 0)
  assert.match(output.join('\n'), /code-review.*Revisa código\./s)
})

test('runAdd instala a skill no harness detectado', async (t) => {
  const home = await tmpHome(t)
  await seed(home)

  const code = await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  assert.equal(code, 0)
  await access(path.join(home, '.claude', 'skills', 'code-review', 'SKILL.md'))
  assert.equal((await readInstalled(home)).length, 1)
})

test('runAdd falha citando o artefato inexistente', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const output = []

  const code = await runAdd(home, { _: ['inexistente'] }, { log: (l) => output.push(l), gitStore: new FakeGitStore() })

  assert.equal(code, 1)
  assert.match(output.join('\n'), /não encontrado: inexistente/)
})

test('runAdd recusa artefato com frontmatter inválido', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const { repo } = storePaths(home)
  await mkdir(path.join(repo, 'skills', 'quebrada'), { recursive: true })
  await writeFile(path.join(repo, 'skills', 'quebrada', 'SKILL.md'), '---\nname: errado\n---\nx\n')
  const output = []

  const code = await runAdd(home, { _: ['quebrada'] }, { log: (l) => output.push(l), gitStore: new FakeGitStore() })

  assert.equal(code, 1)
  assert.match(output.join('\n'), /frontmatter inválido/)
})

test('runAdd --all instala tudo', async (t) => {
  const home = await tmpHome(t)
  await seed(home)

  await runAdd(home, { _: [], all: true }, { log: () => {}, gitStore: new FakeGitStore() })

  assert.equal((await readInstalled(home)).length, 1)
})

test('runRemove desinstala e limpa installed.json', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  const code = await runRemove(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  assert.equal(code, 0)
  assert.deepEqual(await readInstalled(home), [])
})

test('runUpdate pula skill editada localmente e avisa', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  const git = new FakeGitStore({ modified: ['skills/code-review/SKILL.md'] })
  const output = []

  const code = await runUpdate(home, {}, { log: (l) => output.push(l), gitStore: git })

  assert.equal(code, 0)
  assert.ok(!git.calls.includes('pull'))
  assert.match(output.join('\n'), /editad[ao] localmente.*--force/s)
})

test('runUpdate --force aplica mesmo com edição local', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const git = new FakeGitStore({ modified: ['skills/code-review/SKILL.md'] })

  await runUpdate(home, { force: true }, { log: () => {}, gitStore: git })

  assert.ok(git.calls.includes('pull'))
})

test('runUninstall remove os links e o store', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  const code = await runUninstall(home, {}, { log: () => {}, confirm: async () => true, gitStore: new FakeGitStore() })

  assert.equal(code, 0)
  await assert.rejects(() => access(path.join(home, '.claude', 'skills', 'code-review')))
  await assert.rejects(() => access(storePaths(home).store))
})

test('runUninstall aborta quando o usuário não confirma', async (t) => {
  const home = await tmpHome(t)
  await seed(home)

  const code = await runUninstall(home, {}, { log: () => {}, confirm: async () => false, gitStore: new FakeGitStore() })

  assert.equal(code, 1)
  await access(storePaths(home).store)
})

test('runLogin clona e grava remoteUrl + token no config', async (t) => {
  const home = await tmpHome(t)
  const fake = new FakeGitStore({ cloned: false })
  const token = 'ghp_test_token_abc123'

  const code = await runLogin(
    home,
    { _: ['https://github.com/org/lib.git'] },
    { log: () => {}, env: { GITHUB_TOKEN: token }, GitStoreClass: gitStoreClassFor(fake), readGhToken: async () => null },
  )

  assert.equal(code, 0)
  const config = await readConfig(home)
  assert.equal(config.remoteUrl, 'https://github.com/org/lib.git')
  assert.equal(config.token, token)
  assert.ok(fake.calls.includes('clone:https://github.com/org/lib.git'))
})

test('runLogin sem URL e sem remoteUrl salvo pede a URL e não grava nada', async (t) => {
  const home = await tmpHome(t)
  const output = []

  const code = await runLogin(home, { _: [] }, { log: (l) => output.push(l), env: {}, readGhToken: async () => null })

  assert.equal(code, 1)
  assert.match(output.join('\n'), /informe a URL do repositório/)
  await assert.rejects(() => access(storePaths(home).configFile))
})

test('runLogin não clona de novo quando o store já é um clone', async (t) => {
  const home = await tmpHome(t)
  const fake = new FakeGitStore({ cloned: true })
  const output = []

  const code = await runLogin(
    home,
    { _: ['https://github.com/org/lib.git'] },
    {
      log: (l) => output.push(l),
      env: { GITHUB_TOKEN: 'ghp_other_token' },
      GitStoreClass: gitStoreClassFor(fake),
      readGhToken: async () => null,
    },
  )

  assert.equal(code, 0)
  assert.ok(!fake.calls.some((c) => c.startsWith('clone')))
  assert.match(output.join('\n'), /já clonada/)
})

test('runLogin nunca imprime o token', async (t) => {
  const home = await tmpHome(t)
  const fake = new FakeGitStore({ cloned: false })
  const token = 'ghp_should_never_appear_1234567890'
  const output = []

  await runLogin(
    home,
    { _: ['https://github.com/org/lib.git'] },
    { log: (l) => output.push(l), env: { GITHUB_TOKEN: token }, GitStoreClass: gitStoreClassFor(fake), readGhToken: async () => null },
  )

  for (const line of output) assert.equal(line.includes(token), false)
})

test('runAdd de hook recusado (confirm: false) não toca settings.json', async (t) => {
  const home = await tmpHome(t)
  await seedHook(home)
  const output = []

  const code = await runAdd(
    home,
    { _: ['check-updates'] },
    { log: (l) => output.push(l), gitStore: new FakeGitStore(), confirm: async () => false },
  )

  assert.equal(code, 0)
  await assert.rejects(() => access(path.join(home, '.claude', 'settings.json')))
  assert.match(output.join('\n'), /pulado: check-updates/)
})

test('runAdd de hook confirmado (confirm: true) grava e preserva o settings existente', async (t) => {
  const home = await tmpHome(t)
  await seedHook(home)
  await writeFile(
    path.join(home, '.claude', 'settings.json'),
    JSON.stringify({ model: 'opus' }, null, 2),
  )

  const code = await runAdd(
    home,
    { _: ['check-updates'] },
    { log: () => {}, gitStore: new FakeGitStore(), confirm: async () => true },
  )

  assert.equal(code, 0)
  const settings = JSON.parse(await readFile(path.join(home, '.claude', 'settings.json'), 'utf8'))
  assert.equal(settings.model, 'opus')
  assert.deepEqual(settings.hooks.SessionStart, [{ command: 'aec-skills status' }])
})

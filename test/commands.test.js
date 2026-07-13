import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, access, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { runList } from '../src/commands/list.js'
import { runAdd } from '../src/commands/add.js'
import { runRemove } from '../src/commands/remove.js'
import { runUpdate } from '../src/commands/update.js'
import { runUninstall } from '../src/commands/uninstall.js'
import { runLogin } from '../src/commands/login.js'
import { storePaths } from '../src/paths.js'
import { readInstalled, writeInstalled, readConfig } from '../src/state.js'
import { CLI_INVOCATION, DEFAULT_REMOTE_URL } from '../src/constants.js'
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

test('runAdd --all falha com mensagem clara quando não há store (biblioteca vazia)', async (t) => {
  const home = await tmpHome(t)
  await mkdir(path.join(home, '.claude'), { recursive: true })
  const output = []

  const code = await runAdd(home, { all: true }, { log: (l) => output.push(l), gitStore: new FakeGitStore() })

  assert.equal(code, 1)
  assert.match(output.join('\n'), /biblioteca vazia.*login/s)
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

test('runUpdate falha com mensagem clara quando não há store', async (t) => {
  const home = await tmpHome(t)
  const output = []

  const code = await runUpdate(home, {}, { log: (l) => output.push(l), gitStore: new FakeGitStore({ cloned: false }) })

  assert.equal(code, 1)
  assert.match(output.join('\n'), /biblioteca vazia.*login/s)
})

test('runUpdate --force descarta a edição local ANTES do pull', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const git = new FakeGitStore({ modified: ['skills/code-review/SKILL.md'] })

  await runUpdate(home, { force: true }, { log: () => {}, gitStore: git })

  // A ordem é o contrato: `pull --ff-only` aborta se a árvore ainda estiver suja.
  assert.deepEqual(git.calls, ['fetch', 'reset', 'pull'])
  assert.deepEqual(await git.locallyModified(), [])
})

test('runUpdate não diz "atualizado" para artefato pulado em todos os harnesses', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  // Instalado (registrado no codex, que não existe nesta máquina) mas com o destino
  // do claude ocupado por um diretório do usuário — nada pode ser religado ali.
  await writeInstalled(home, [{
    name: 'code-review', kind: 'skill', harness: 'codex',
    dest: path.join(home, '.codex', 'skills', 'code-review'), mode: 'link', sha: 'aaaa111',
  }])
  const dest = path.join(home, '.claude', 'skills', 'code-review')
  await mkdir(dest, { recursive: true })
  await writeFile(path.join(dest, 'SKILL.md'), 'do usuário')
  const output = []

  await runUpdate(home, {}, { log: (l) => output.push(l), gitStore: new FakeGitStore() })

  assert.ok(!output.join('\n').includes('✓ code-review atualizado'))
  assert.match(output.join('\n'), /code-review → claude: já existe/)
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

test('runLogin sem URL e sem config usa a URL padrão da biblioteca e clona', async (t) => {
  const home = await tmpHome(t)
  const fake = new FakeGitStore({ cloned: false })
  const output = []

  const code = await runLogin(
    home,
    { _: [] },
    {
      log: (l) => output.push(l),
      env: { GITHUB_TOKEN: 'ghp_url_padrao' },
      GitStoreClass: gitStoreClassFor(fake),
      readGhToken: async () => null,
    },
  )

  assert.equal(code, 0)
  const config = await readConfig(home)
  assert.equal(config.remoteUrl, DEFAULT_REMOTE_URL)
  assert.ok(fake.calls.includes(`clone:${DEFAULT_REMOTE_URL}`))
})

test('runLogin com URL explícita usa essa URL, não a padrão', async (t) => {
  const home = await tmpHome(t)
  const fake = new FakeGitStore({ cloned: false })

  const code = await runLogin(
    home,
    { _: ['https://github.com/outra/lib.git'] },
    {
      log: () => {},
      env: { GITHUB_TOKEN: 'ghp_url_explicita' },
      GitStoreClass: gitStoreClassFor(fake),
      readGhToken: async () => null,
    },
  )

  assert.equal(code, 0)
  const config = await readConfig(home)
  assert.equal(config.remoteUrl, 'https://github.com/outra/lib.git')
  assert.ok(fake.calls.includes('clone:https://github.com/outra/lib.git'))
  assert.ok(!fake.calls.some((c) => c === `clone:${DEFAULT_REMOTE_URL}`))
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

test('mensagens de biblioteca vazia e de login usam CLI_INVOCATION, nunca `npx aec-skills` puro', async (t) => {
  const home = await tmpHome(t)
  const output = []
  const log = (l) => output.push(l)

  await runAdd(home, { all: true }, { log, gitStore: new FakeGitStore() })
  await runList(home, {}, { log })
  await runUpdate(home, {}, { log, gitStore: new FakeGitStore({ cloned: false }) })
  // env com GITHUB_TOKEN: sem ele, resolveToken cai no prompt interativo e o teste
  // trava lendo o stdin real. O que se verifica aqui é a mensagem, não a credencial.
  const env = { GITHUB_TOKEN: 'ghp_mensagens' }
  await runLogin(
    home,
    { _: [] },
    { log, env, GitStoreClass: gitStoreClassFor(new FakeGitStore({ cloned: false })), readGhToken: async () => null },
  )
  await runLogin(
    home,
    { _: [] },
    { log, env, GitStoreClass: gitStoreClassFor(new FakeGitStore({ cloned: true })), readGhToken: async () => null },
  )

  const text = output.join('\n')
  assert.ok(text.includes(CLI_INVOCATION), 'deveria usar o comando npx real, github:Andersonfdc/aec-skills')
  assert.equal(text.includes('npx aec-skills'), false, 'não deveria sugerir o comando quebrado `npx aec-skills`')
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

test('GEMINI.md lista só a skill instalada e encolhe no remove', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const { repo } = storePaths(home)
  await mkdir(path.join(repo, 'skills', 'diagnose'), { recursive: true })
  await writeFile(
    path.join(repo, 'skills', 'diagnose', 'SKILL.md'),
    '---\nname: diagnose\ndescription: Diagnostica.\n---\n# D\n',
  )
  await mkdir(path.join(home, '.gemini'), { recursive: true })
  const geminiFile = path.join(home, '.gemini', 'GEMINI.md')

  await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  const afterAdd = await readFile(geminiFile, 'utf8')
  assert.match(afterAdd, /code-review/)
  assert.ok(!afterAdd.includes('diagnose'), 'skill não instalada não entra em todo prompt do Gemini')

  await runRemove(home, { _: ['code-review'] }, { log: () => {} })

  const afterRemove = await readFile(geminiFile, 'utf8')
  assert.ok(!afterRemove.includes('code-review'))
})

test('runRemove não cria ~/.gemini numa máquina que não usa Gemini', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  await runRemove(home, { _: ['code-review'] }, { log: () => {} })

  await assert.rejects(() => access(path.join(home, '.gemini')))
})

/** Semeia uma skill no store, mas SEM ~/.claude — só ~/.gemini, simulando uma máquina só com Gemini. */
async function seedGeminiOnly(home) {
  const { repo } = storePaths(home)
  await mkdir(path.join(repo, 'skills', 'code-review'), { recursive: true })
  await writeFile(
    path.join(repo, 'skills', 'code-review', 'SKILL.md'),
    '---\nname: code-review\ndescription: Revisa código.\n---\n# R\n',
  )
  await mkdir(path.join(home, '.gemini'), { recursive: true })
}

test('runAdd numa máquina só com Gemini registra a skill via índice (a ponte funciona sozinha)', async (t) => {
  const home = await tmpHome(t)
  await seedGeminiOnly(home)
  const output = []

  const code = await runAdd(home, { _: ['code-review'] }, { log: (l) => output.push(l), gitStore: new FakeGitStore() })

  assert.equal(code, 0)
  assert.match(output.join('\n'), /✓ code-review → gemini \(índice\)/)
  const entries = await readInstalled(home)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].harness, 'gemini')
  assert.equal(entries[0].kind, 'skill')
  assert.equal(entries[0].mode, 'index')
  const geminiContent = await readFile(path.join(home, '.gemini', 'GEMINI.md'), 'utf8')
  assert.match(geminiContent, /code-review/)
})

test('runRemove numa máquina só com Gemini encolhe o índice e não apaga o GEMINI.md', async (t) => {
  const home = await tmpHome(t)
  await seedGeminiOnly(home)
  const geminiFile = path.join(home, '.gemini', 'GEMINI.md')
  await writeFile(geminiFile, '# Meu contexto pessoal\n')
  await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })
  assert.match(await readFile(geminiFile, 'utf8'), /code-review/)

  const code = await runRemove(home, { _: ['code-review'] }, { log: () => {} })

  assert.equal(code, 0)
  const afterRemove = await readFile(geminiFile, 'utf8')
  assert.ok(!afterRemove.includes('code-review'))
  assert.match(afterRemove, /# Meu contexto pessoal/)
  assert.deepEqual(await readInstalled(home), [])
})

test('runUninstall --yes numa máquina só com Gemini apaga o store mas NUNCA o GEMINI.md do usuário', async (t) => {
  const home = await tmpHome(t)
  await seedGeminiOnly(home)
  const geminiFile = path.join(home, '.gemini', 'GEMINI.md')
  await writeFile(geminiFile, '# Meu contexto pessoal\n')
  await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  const code = await runUninstall(home, { yes: true }, { log: () => {}, gitStore: new FakeGitStore() })

  assert.equal(code, 0)
  // Mutation-proof: se uninstallArtifact tratasse a entrada 'index' como uma
  // cópia comum (unlinkPath em modo 'copy' apaga `dest` se existir), o
  // GEMINI.md do usuário — que É o `dest` de uma entrada 'index' — sumiria
  // aqui. access() rejeita se o arquivo não existir mais.
  await access(geminiFile)
  const content = await readFile(geminiFile, 'utf8')
  assert.match(content, /# Meu contexto pessoal/)
  assert.ok(!content.includes('code-review'))
  await assert.rejects(() => access(storePaths(home).store))
})

test('runAdd --harness=gemini não cria ~/.claude para instalar um hook', async (t) => {
  const home = await tmpHome(t)
  await seedHook(home)
  await rm(path.join(home, '.claude'), { recursive: true, force: true })
  const output = []

  const code = await runAdd(
    home,
    { _: ['check-updates'], harness: 'gemini' },
    { log: (l) => output.push(l), gitStore: new FakeGitStore(), confirm: async () => true },
  )

  assert.equal(code, 0)
  await assert.rejects(() => access(path.join(home, '.claude')))
  assert.match(output.join('\n'), /claude não está entre os harnesses alvo/)
})

test('runRemove de hook recusado (confirm: false) não toca settings.json', async (t) => {
  const home = await tmpHome(t)
  await seedHook(home)
  const settingsFile = path.join(home, '.claude', 'settings.json')
  await runAdd(home, { _: ['check-updates'] }, { log: () => {}, gitStore: new FakeGitStore(), confirm: async () => true })
  const before = await readFile(settingsFile, 'utf8')
  const output = []

  const code = await runRemove(home, { _: ['check-updates'] }, { log: (l) => output.push(l), confirm: async () => false })

  assert.equal(code, 0)
  assert.equal(await readFile(settingsFile, 'utf8'), before)
  assert.match(output.join('\n'), /pulado: check-updates/)
})

test('runRemove de hook confirmado tira só a nossa entrada e mostra o diff', async (t) => {
  const home = await tmpHome(t)
  await seedHook(home)
  const settingsFile = path.join(home, '.claude', 'settings.json')
  await writeFile(settingsFile, JSON.stringify({ hooks: { SessionStart: [{ command: 'meu-hook' }] } }, null, 2))
  await runAdd(home, { _: ['check-updates'] }, { log: () => {}, gitStore: new FakeGitStore(), confirm: async () => true })
  const output = []

  const code = await runRemove(home, { _: ['check-updates'] }, { log: (l) => output.push(l), confirm: async () => true })

  assert.equal(code, 0)
  assert.match(output.join('\n'), /- SessionStart:.*aec-skills status/)
  const settings = JSON.parse(await readFile(settingsFile, 'utf8'))
  assert.deepEqual(settings.hooks.SessionStart, [{ command: 'meu-hook' }])
  assert.deepEqual(await readInstalled(home), [])
})

test('runUninstall tira o hook do settings.json antes de apagar o store', async (t) => {
  const home = await tmpHome(t)
  await seedHook(home)
  const settingsFile = path.join(home, '.claude', 'settings.json')
  await writeFile(settingsFile, JSON.stringify({ hooks: { SessionStart: [{ command: 'meu-hook' }] } }, null, 2))
  await runAdd(home, { _: ['check-updates'] }, { log: () => {}, gitStore: new FakeGitStore(), confirm: async () => true })

  const code = await runUninstall(home, { yes: true }, { log: () => {}, gitStore: new FakeGitStore() })

  assert.equal(code, 0)
  const settings = JSON.parse(await readFile(settingsFile, 'utf8'))
  assert.deepEqual(settings.hooks.SessionStart, [{ command: 'meu-hook' }])
  await assert.rejects(() => access(storePaths(home).store))
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

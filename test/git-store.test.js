import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { GitStore } from '../src/git-store.js'
import { FakeGitStore } from './helpers/fake-git-store.js'
import { tmpHome } from './helpers/tmp-home.js'

const run = promisify(execFile)

test('isClone devolve false quando o diretório não é um repositório', async (t) => {
  const dir = await tmpHome(t)
  assert.equal(await new GitStore(path.join(dir, 'repo')).isClone(), false)
})

test('head devolve o SHA curto do commit atual', async (t) => {
  const repo = await tmpHome(t)
  await run('git', ['init', '-q'], { cwd: repo })
  await writeFile(path.join(repo, 'a.txt'), 'x')
  await run('git', ['add', '.'], { cwd: repo })
  await run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: repo })

  const store = new GitStore(repo)
  assert.equal(await store.isClone(), true)
  assert.match(await store.head(), /^[0-9a-f]{7,}$/)
})

test('locallyModified lista os arquivos alterados na cópia de trabalho', async (t) => {
  const repo = await tmpHome(t)
  await run('git', ['init', '-q'], { cwd: repo })
  await writeFile(path.join(repo, 'a.txt'), 'x')
  await run('git', ['add', '.'], { cwd: repo })
  await run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: repo })
  await writeFile(path.join(repo, 'a.txt'), 'modificado')

  assert.deepEqual(await new GitStore(repo).locallyModified(), ['a.txt'])
})

test('locallyModified devolve vazio numa árvore limpa', async (t) => {
  const repo = await tmpHome(t)
  await run('git', ['init', '-q'], { cwd: repo })
  await writeFile(path.join(repo, 'a.txt'), 'x')
  await run('git', ['add', '.'], { cwd: repo })
  await run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: repo })

  assert.deepEqual(await new GitStore(repo).locallyModified(), [])
})

test('clone nunca grava o token em .git/config', async (t) => {
  const dir = await tmpHome(t)
  const remoteDir = path.join(dir, 'remote.git')
  await run('git', ['init', '--bare', '-q', remoteDir])

  const cloneDir = path.join(dir, 'clone')
  const token = 'ghp_super_secret_token_123'
  await new GitStore(cloneDir, token).clone(remoteDir)

  const config = await readFile(path.join(cloneDir, '.git', 'config'), 'utf8')
  assert.equal(config.includes(token), false)
})

test('authArgs escopa o header http.extraHeader à URL do remote, nunca unscoped', async (t) => {
  const dir = await tmpHome(t)
  const token = 'ghp_super_secret_token_789'
  const remoteUrl = 'https://github.com/org/aec-skills-library.git'
  // dir existe mas não é um clone git: fetch() falha ao rodar `git fetch`,
  // expondo o `-c http.<url>.extraHeader=...` montado em error.cmd.
  const store = new GitStore(dir, token, remoteUrl)

  await assert.rejects(
    () => store.fetch(),
    (error) => {
      assert.match(error.cmd ?? '', new RegExp(`http\\.${remoteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.extraHeader=`))
      assert.equal(/(?<!\.)http\.extraHeader=/.test(error.cmd ?? ''), false)
      return true
    }
  )
})

test('erro de git não vaza o token nem seu header base64', async (t) => {
  const dir = await tmpHome(t)
  const token = 'ghp_super_secret_token_456'
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
  const missingRemote = path.join(dir, 'nao-existe')
  const store = new GitStore(path.join(dir, 'clone'), token)

  await assert.rejects(
    () => store.clone(missingRemote),
    (error) => {
      const serialized = JSON.stringify(error)
      for (const leak of [token, basic]) {
        assert.equal((error.message ?? '').includes(leak), false)
        assert.equal((error.stack ?? '').includes(leak), false)
        assert.equal((error.cmd ?? '').includes(leak), false)
        assert.equal((error.stderr ?? '').includes(leak), false)
        assert.equal(serialized.includes(leak), false)
      }
      return true
    }
  )
})

test('fetch com token mas sem remoteUrl conhecida lança erro nomeando a URL ausente', async (t) => {
  const dir = await tmpHome(t)
  const store = new GitStore(dir, 'ghp_super_secret_token_999')

  await assert.rejects(
    () => store.fetch(),
    (error) => {
      assert.match(error.message, /remoteUrl/)
      return true
    }
  )
})

test('fetch sem token e sem remoteUrl não lança pelo motivo de URL ausente (caminho do credential helper)', async (t) => {
  const dir = await tmpHome(t)
  const store = new GitStore(dir)

  await assert.rejects(
    () => store.fetch(),
    (error) => {
      assert.equal(/remoteUrl/.test(error.message ?? ''), false)
      return true
    }
  )
})

test('FakeGitStore seeda estado via options bag (regressão do construtor posicional)', async () => {
  const fake = new FakeGitStore({ head: 'zzz999' })
  assert.equal(await fake.head(), 'zzz999')
})

test('clone funciona numa instalação nova, com o store (~/.aec-skills) ainda inexistente', async (t) => {
  // Regressão do smoke test: sem mkdir, execFile falhava com ENOENT no cwd
  // ausente, e o catch confundia isso com "git não instalado" (mesmo code).
  const dir = await tmpHome(t)
  const remoteDir = path.join(dir, 'remote.git')
  await run('git', ['init', '--bare', '-q', remoteDir])

  const store = path.join(dir, 'fresh-home', '.aec-skills')
  const repoDir = path.join(store, 'repo')
  await new GitStore(repoDir).clone(remoteDir)

  assert.equal(await new GitStore(repoDir).isClone(), true)
})

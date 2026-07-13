import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile, stat, lstat } from 'node:fs/promises'
import path from 'node:path'
import { linkPath, unlinkPath, DestinationOccupiedError } from '../src/linker.js'
import { tmpHome } from './helpers/tmp-home.js'

test('linkPath liga um diretório e o conteúdo fica legível pelo destino', async (t) => {
  const home = await tmpHome(t)
  const source = path.join(home, 'store', 'code-review')
  await mkdir(source, { recursive: true })
  await writeFile(path.join(source, 'SKILL.md'), 'conteúdo')

  const dest = path.join(home, '.claude', 'skills', 'code-review')
  const mode = await linkPath(source, dest)

  assert.ok(mode === 'link' || mode === 'copy')
  assert.equal(await readFile(path.join(dest, 'SKILL.md'), 'utf8'), 'conteúdo')
})

test('linkPath cria os diretórios-pai que faltam', async (t) => {
  const home = await tmpHome(t)
  const source = path.join(home, 'store', 'x')
  await mkdir(source, { recursive: true })
  const dest = path.join(home, '.copilot', 'skills', 'x')

  await linkPath(source, dest)
  assert.ok((await stat(path.join(home, '.copilot', 'skills'))).isDirectory())
})

test('linkPath é idempotente: religar o mesmo par não falha', async (t) => {
  const home = await tmpHome(t)
  const source = path.join(home, 'store', 'x')
  await mkdir(source, { recursive: true })
  const dest = path.join(home, '.claude', 'skills', 'x')

  await linkPath(source, dest)
  await linkPath(source, dest)
  assert.ok(await lstat(dest))
})

test('linkPath recusa destino ocupado por conteúdo do usuário', async (t) => {
  const home = await tmpHome(t)
  const source = path.join(home, 'store', 'x')
  await mkdir(source, { recursive: true })

  const dest = path.join(home, '.claude', 'skills', 'x')
  await mkdir(dest, { recursive: true })
  await writeFile(path.join(dest, 'SKILL.md'), 'do usuário')

  await assert.rejects(() => linkPath(source, dest), DestinationOccupiedError)
  assert.equal(await readFile(path.join(dest, 'SKILL.md'), 'utf8'), 'do usuário')
})

test('unlinkPath remove o que é nosso', async (t) => {
  const home = await tmpHome(t)
  const source = path.join(home, 'store', 'x')
  await mkdir(source, { recursive: true })
  const dest = path.join(home, '.claude', 'skills', 'x')
  await linkPath(source, dest)

  assert.equal(await unlinkPath(dest, source), true)
  await assert.rejects(() => lstat(dest))
})

test('unlinkPath não remove conteúdo do usuário', async (t) => {
  const home = await tmpHome(t)
  const source = path.join(home, 'store', 'x')
  await mkdir(source, { recursive: true })
  const dest = path.join(home, '.claude', 'skills', 'x')
  await mkdir(dest, { recursive: true })
  await writeFile(path.join(dest, 'SKILL.md'), 'do usuário')

  assert.equal(await unlinkPath(dest, source), false)
  assert.equal(await readFile(path.join(dest, 'SKILL.md'), 'utf8'), 'do usuário')
})

test('unlinkPath devolve false quando o destino não existe', async (t) => {
  const home = await tmpHome(t)
  assert.equal(await unlinkPath(path.join(home, 'nada'), path.join(home, 'src')), false)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runCli } from '../src/cli.js'

test('runCli sem argumentos imprime ajuda e retorna 1', async () => {
  const output = []
  const code = await runCli([], { log: (line) => output.push(line) })
  assert.equal(code, 1)
  assert.match(output.join('\n'), /aec-skills <comando>/)
})

test('runCli --version imprime a versão', async () => {
  const output = []
  const code = await runCli(['--version'], { log: (line) => output.push(line) })
  assert.equal(code, 0)
  assert.match(output.join('\n'), /^\d+\.\d+\.\d+$/)
})

test('runCli com comando desconhecido retorna 1', async () => {
  const output = []
  const code = await runCli(['inventado'], { log: (line) => output.push(line) })
  assert.equal(code, 1)
  assert.match(output.join('\n'), /comando desconhecido: inventado/)
})

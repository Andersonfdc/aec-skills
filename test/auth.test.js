import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable, Writable } from 'node:stream'
import { resolveToken } from '../src/auth.js'

/**
 * Streams de entrada/saída falsos para o prompt — não-TTY, então
 * `promptForToken` lê a linha normalmente sem tentar mascarar eco.
 * @param {string} answerLine linha que o "usuário" vai "digitar"
 * @returns {{ input: Readable, output: Writable, written: string[] }}
 */
function fakeIo(answerLine) {
  const input = Readable.from([`${answerLine}\n`])
  const written = []
  const output = new Writable({
    write(chunk, _enc, cb) { written.push(chunk.toString()); cb() },
  })
  return { input, output, written }
}

test('usa GITHUB_TOKEN quando o gh CLI não devolve nada', async () => {
  const token = await resolveToken(
    { GITHUB_TOKEN: '  ghp_env_token  ' },
    { readGhToken: async () => null },
  )
  assert.equal(token, 'ghp_env_token')
})

test('usa o prompt quando nem gh nem GITHUB_TOKEN fornecem um token', async () => {
  const { input, output } = fakeIo('ghp_prompted_token')
  const token = await resolveToken(
    {},
    { readGhToken: async () => null, input, output },
  )
  assert.equal(token, 'ghp_prompted_token')
})

test('resposta vazia/whitespace no prompt lança erro orientando gh auth login ou GITHUB_TOKEN', async () => {
  const { input, output } = fakeIo('   ')
  await assert.rejects(
    () => resolveToken({}, { readGhToken: async () => null, input, output }),
    (error) => {
      assert.match(error.message, /gh auth login/)
      assert.match(error.message, /GITHUB_TOKEN/)
      return true
    },
  )
})

test('o token retornado vem aparado (trim), do gh, do env e do prompt', async () => {
  const fromEnv = await resolveToken(
    { GITHUB_TOKEN: '  ghp_env_padded  ' },
    { readGhToken: async () => null },
  )
  assert.equal(fromEnv, 'ghp_env_padded')

  const { input, output } = fakeIo('  ghp_prompt_padded  ')
  const fromPrompt = await resolveToken(
    {},
    { readGhToken: async () => null, input, output },
  )
  assert.equal(fromPrompt, 'ghp_prompt_padded')
})

test('erro de token ausente nunca inclui um token na mensagem', async () => {
  const decoyToken = 'ghp_should_never_leak_1234567890'
  const { input, output } = fakeIo('')
  await assert.rejects(
    () => resolveToken({ GITHUB_TOKEN: '' }, { readGhToken: async () => null, input, output }),
    (error) => {
      assert.equal(error.message.includes(decoyToken), false)
      assert.equal(JSON.stringify(error).includes(decoyToken), false)
      return true
    },
  )
})

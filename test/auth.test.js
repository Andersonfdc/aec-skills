import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable, Writable } from 'node:stream'
import { resolveToken } from '../src/auth.js'

/**
 * Streams de entrada/saída falsos para o prompt — não-TTY, então lê a linha
 * normalmente, sem raw mode.
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

/**
 * Um stdin que se diz TTY, para o prompt ler as teclas em raw mode.
 * @param {string} [answerLine]
 */
function ttyIo(answerLine = '') {
  const { input, output, written } = fakeIo(answerLine)
  input.isTTY = true
  input.setRawMode = () => {}
  return { input, output, written }
}

test('o token já salvo vence tudo — quem está logado não vê prompt', async () => {
  let asked = false
  const token = await resolveToken(
    { GITHUB_TOKEN: 'ghp_env' },
    {
      savedToken: '  ghp_salvo  ',
      readGhToken: async () => { asked = true; return 'ghp_gh' },
    },
  )

  assert.equal(token, 'ghp_salvo')
  assert.equal(asked, false)
})

test('usa o gh CLI antes do GITHUB_TOKEN', async () => {
  const token = await resolveToken(
    { GITHUB_TOKEN: 'ghp_env' },
    { readGhToken: async () => 'ghp_do_gh' },
  )
  assert.equal(token, 'ghp_do_gh')
})

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

test('o prompt pede o token da biblioteca, não um token da conta do usuário', async () => {
  const { input, output, written } = fakeIo('ghp_x')
  await resolveToken({}, { readGhToken: async () => null, input, output })

  assert.match(written.join(''), /biblioteca/i)
  assert.match(written.join(''), /mantenedor/i)
})

// Regressão: o mascaramento antigo sobrescrevia `rl._writeToOutput`, que não
// existe na Interface de readline/promises no Node 24 — o prompt estourava
// TypeError em qualquer terminal de verdade. Nenhum teste tinha TTY, então
// ninguém viu.
test('num TTY o prompt funciona e não ecoa o que foi digitado', async () => {
  const { input, output, written } = ttyIo('ghp_segredo\r')

  const token = await resolveToken({}, { readGhToken: async () => null, input, output })

  assert.equal(token, 'ghp_segredo')
  assert.doesNotMatch(written.join(''), /ghp_segredo/)
  assert.match(written.join(''), /Token de acesso/)
})

test('num TTY, backspace apaga o último caractere digitado', async () => {
  const { input, output } = ttyIo('ghp_abxc\r')

  const token = await resolveToken({}, { readGhToken: async () => null, input, output })
  assert.equal(token, 'ghp_abc')
})

test('resposta vazia lança erro orientando a pedir o token ou definir GITHUB_TOKEN', async () => {
  const { input, output } = fakeIo('   ')
  await assert.rejects(
    () => resolveToken({}, { readGhToken: async () => null, input, output }),
    (error) => {
      assert.match(error.message, /mantenedor/)
      assert.match(error.message, /GITHUB_TOKEN/)
      return true
    },
  )
})

test('o token retornado vem aparado (trim), do env e do prompt', async () => {
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

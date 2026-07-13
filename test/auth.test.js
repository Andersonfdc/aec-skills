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

test('o token já salvo vence tudo — quem está logado não vê prompt nem menu', async () => {
  let asked = false
  const token = await resolveToken(
    { GITHUB_TOKEN: 'ghp_env' },
    {
      savedToken: '  ghp_salvo  ',
      readGhToken: async () => { asked = true; return 'ghp_gh' },
      chooseMethod: async () => { asked = true; return ['pat'] },
    },
  )

  assert.equal(token, 'ghp_salvo')
  assert.equal(asked, false)
})

/**
 * Um stdin que se diz TTY: resolveToken abre o menu em vez de cair direto no
 * prompt, e o prompt de PAT lê as teclas em raw mode.
 * @param {string} [answerLine]
 */
function ttyIo(answerLine = '') {
  const { input, output, written } = fakeIo(answerLine)
  input.isTTY = true
  input.setRawMode = () => {}
  return { input, output, written }
}

// Regressão: o mascaramento antigo sobrescrevia `rl._writeToOutput`, que não
// existe na Interface de readline/promises no Node 24 — o prompt estourava
// TypeError em qualquer terminal de verdade. Nenhum teste tinha TTY, então
// ninguém viu.
test('num TTY o prompt de PAT funciona e não ecoa o que foi digitado', async () => {
  const { input, output, written } = ttyIo('ghp_segredo\r')

  const token = await resolveToken({}, {
    readGhToken: async () => null,
    log: () => {},
    input,
    output,
    chooseMethod: async () => ['pat'],
  })

  assert.equal(token, 'ghp_segredo')
  const echoed = written.join('')
  assert.doesNotMatch(echoed, /ghp_segredo/)
  assert.match(echoed, /Personal Access Token/)
})

test('sem credencial nenhuma, num TTY, oferece o menu de métodos', async () => {
  const { input, output } = ttyIo('ghp_colado')
  let offered = null

  const token = await resolveToken({}, {
    readGhToken: async () => null,
    log: () => {},
    input,
    output,
    clientId: 'Iv1.abc',
    chooseMethod: async (items) => {
      offered = items.map((i) => i.name)
      return ['pat']
    },
  })

  assert.deepEqual(offered, ['device', 'pat', 'gh'])
  assert.equal(token, 'ghp_colado')
})

test('sem OAuth App registrado, o menu esconde a opção de navegador', async () => {
  const { input, output } = ttyIo('ghp_colado')
  let offered = null

  await resolveToken({}, {
    readGhToken: async () => null,
    log: () => {},
    input,
    output,
    clientId: '',
    chooseMethod: async (items) => {
      offered = items.map((i) => i.name)
      return ['pat']
    },
  })

  assert.deepEqual(offered, ['pat', 'gh'])
})

test('escolher o navegador roda o device flow e devolve o token dele', async () => {
  const { input, output } = ttyIo()
  let seenClientId = null

  const token = await resolveToken({}, {
    readGhToken: async () => null,
    log: () => {},
    input,
    output,
    clientId: 'Iv1.abc',
    chooseMethod: async () => ['device'],
    deviceLoginImpl: async (clientId) => {
      seenClientId = clientId
      return 'gho_do_device_flow'
    },
  })

  assert.equal(seenClientId, 'Iv1.abc')
  assert.equal(token, 'gho_do_device_flow')
})

test('escolher o PAT mostra onde criar o token, com o escopo repo na URL', async () => {
  const { input, output } = ttyIo('ghp_colado')
  const lines = []

  await resolveToken({}, {
    readGhToken: async () => null,
    log: (line) => lines.push(line),
    input,
    output,
    chooseMethod: async () => ['pat'],
  })

  assert.match(lines.join('\n'), /github\.com\/settings\/tokens\/new\?scopes=repo/)
})

test('escolher o gh CLI diz o comando a rodar em vez de fingir que autenticou', async () => {
  const { input, output } = ttyIo()

  await assert.rejects(
    () => resolveToken({}, {
      readGhToken: async () => null,
      log: () => {},
      input,
      output,
      chooseMethod: async () => ['gh'],
    }),
    /gh auth login/,
  )
})

test('sair do menu cancela o login', async () => {
  const { input, output } = ttyIo()

  await assert.rejects(
    () => resolveToken({}, {
      readGhToken: async () => null,
      log: () => {},
      input,
      output,
      chooseMethod: async () => null,
    }),
    /cancelado/,
  )
})

test('num pipe (não-TTY) o menu não abre — cai no prompt, que lê a linha', async () => {
  const { input, output } = fakeIo('ghp_do_pipe')
  let menuOpened = false

  const token = await resolveToken({}, {
    readGhToken: async () => null,
    input,
    output,
    chooseMethod: async () => { menuOpened = true; return ['pat'] },
  })

  assert.equal(menuOpened, false)
  assert.equal(token, 'ghp_do_pipe')
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

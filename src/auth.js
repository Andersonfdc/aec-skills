import { execFile } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { emitKeypressEvents } from 'node:readline'
import { promisify } from 'node:util'
import { deviceLogin } from './auth-device.js'
import { selectFromMenu } from './tui.js'
import { OAUTH_CLIENT_ID } from './constants.js'

const run = promisify(execFile)

const PAT_URL = 'https://github.com/settings/tokens/new?scopes=repo&description=aec-skills'

/**
 * Resolve a credencial do GitHub. Ordem: token já salvo → gh CLI → GITHUB_TOKEN
 * → escolha do método (só num TTY; num pipe/CI, vai direto ao prompt de PAT).
 *
 * "Já estar logado" é justamente as três primeiras fontes: quem tem qualquer uma
 * delas nunca vê o menu.
 *
 * O token nunca é impresso nem logado; o prompt interativo mascara a digitação.
 * @param {NodeJS.ProcessEnv} env
 * @param {{ savedToken?: string|null, readGhToken?: () => Promise<string|null>, chooseMethod?: typeof selectFromMenu, deviceLoginImpl?: typeof deviceLogin, clientId?: string, log?: (line: string) => void, input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream }} [io]
 * @returns {Promise<string>}
 * @throws {Error} quando nenhuma fonte fornece um token
 */
export async function resolveToken(env, io = {}) {
  const saved = io.savedToken?.trim()
  if (saved) return saved

  const readGhToken = io.readGhToken ?? tokenFromGh
  const fromGh = await readGhToken()
  if (fromGh) return fromGh

  const fromEnv = env.GITHUB_TOKEN?.trim()
  if (fromEnv) return fromEnv

  const input = io.input ?? process.stdin
  // Fora de um TTY não há como desenhar o menu — mantém o prompt de PAT, que
  // funciona lendo uma linha do pipe.
  if (!input.isTTY) return promptForToken(io)

  return chooseAndRun(io)
}

/**
 * @param {object} io
 * @returns {Promise<string>}
 */
async function chooseAndRun(io) {
  const log = io.log ?? console.log
  const clientId = io.clientId ?? OAUTH_CLIENT_ID
  const choose = io.chooseMethod ?? selectFromMenu

  const methods = [
    ...(clientId ? [{ name: 'device', description: 'Autorizar pelo navegador (código de device)' }] : []),
    { name: 'pat', description: 'Colar um Personal Access Token' },
    { name: 'gh', description: 'Autenticar com o gh CLI' },
  ]

  log('')
  log('  Você ainda não tem acesso à biblioteca.')
  const picked = await choose(methods, {
    title: 'Como quer autenticar?',
    single: true,
    input: io.input,
    output: io.output,
  })

  if (picked === null) throw new Error('login cancelado')

  switch (picked[0]) {
    case 'device':
      return deviceFlow(clientId, io)
    case 'gh':
      throw new Error('rode `gh auth login` e tente de novo')
    default:
      log('')
      log(`  Crie um token (escopo repo) em:\n    ${PAT_URL}`)
      log('')
      return promptForToken(io)
  }
}

/**
 * @param {string} clientId
 * @param {object} io
 * @returns {Promise<string>}
 */
function deviceFlow(clientId, io) {
  const impl = io.deviceLoginImpl ?? deviceLogin
  return impl(clientId, { log: io.log ?? console.log })
}

/** @returns {Promise<string|null>} */
async function tokenFromGh() {
  try {
    const { stdout } = await run('gh', ['auth', 'token'])
    return stdout.trim() || null
  } catch {
    return null
  }
}

const PAT_QUESTION = 'Personal Access Token do GitHub (escopo repo): '

/**
 * Pede o PAT. Em TTY a digitação não é ecoada; num pipe/CI lê a linha normal.
 * @param {{ input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream }} io
 * @returns {Promise<string>}
 */
export async function promptForToken(io) {
  const input = io.input ?? process.stdin
  const output = io.output ?? process.stdout

  const answer = input.isTTY
    ? await readHidden(PAT_QUESTION, input, output)
    : await readLine(PAT_QUESTION, input, output)

  const token = answer.trim()
  if (!token) throw new Error('nenhum token fornecido — rode `gh auth login` ou defina GITHUB_TOKEN')
  return token
}

/**
 * @param {string} question
 * @param {NodeJS.ReadableStream} input
 * @param {NodeJS.WritableStream} output
 * @returns {Promise<string>}
 */
async function readLine(question, input, output) {
  const rl = createInterface({ input, output, terminal: false })
  try {
    return await rl.question(question)
  } finally {
    rl.close()
  }
}

/**
 * Lê a resposta sem eco algum, para que o PAT não apareça em screen shares,
 * gravações de terminal (asciinema/script) ou para quem estiver por perto.
 *
 * Não usa `readline` aqui: mascarar por lá exigia sobrescrever `_writeToOutput`,
 * que não existe na Interface de `readline/promises` (Node 24) — o prompt
 * estourava TypeError num terminal de verdade. Em raw mode o terminal não ecoa
 * nada por conta própria, então basta não escrever a tecla lida.
 * @param {string} question
 * @param {NodeJS.ReadableStream} input
 * @param {NodeJS.WritableStream} output
 * @returns {Promise<string>}
 */
function readHidden(question, input, output) {
  return new Promise((resolve, reject) => {
    output.write(question)
    let value = ''

    const finish = () => {
      input.off('keypress', onKey)
      if (input.setRawMode) input.setRawMode(false)
      input.pause()
      output.write('\n')
    }

    const onKey = (str, key = {}) => {
      if (key.name === 'return' || key.name === 'enter') {
        finish()
        return resolve(value)
      }
      if (key.ctrl && key.name === 'c') {
        finish()
        return reject(new Error('login cancelado'))
      }
      if (key.name === 'backspace') {
        value = value.slice(0, -1)
        return
      }
      // Só caracteres imprimíveis: setas, F-keys e afins chegam como sequências
      // de escape e não podem entrar no token.
      if (str && !key.ctrl && !key.meta && str >= ' ') value += str
    }

    emitKeypressEvents(input)
    if (input.setRawMode) input.setRawMode(true)
    input.resume()
    input.on('keypress', onKey)
  })
}

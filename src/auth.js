import { execFile } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { emitKeypressEvents } from 'node:readline'
import { promisify } from 'node:util'

const run = promisify(execFile)

const PAT_QUESTION = 'Token de acesso à biblioteca (enviado pelo mantenedor): '

/**
 * Resolve a credencial de leitura da biblioteca. Ordem: token já salvo → gh CLI
 * → GITHUB_TOKEN → o usuário cola o token.
 *
 * "Já estar logado" é justamente as três primeiras fontes: quem tem qualquer uma
 * delas nunca vê um prompt.
 *
 * O token colado é o **token da biblioteca**, distribuído pelo mantenedor — não
 * um token da conta do usuário. As contas dos usuários são empresariais e não
 * podem ser colaboradoras do repositório privado, então um token pessoal delas
 * daria 404 no clone.
 *
 * O token nunca é impresso nem logado; em TTY a digitação não é ecoada.
 * @param {NodeJS.ProcessEnv} env
 * @param {{ savedToken?: string|null, readGhToken?: () => Promise<string|null>, input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream }} [io]
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

  return promptForToken(io)
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

/**
 * Pede o token. Em TTY a digitação não é ecoada; num pipe/CI lê a linha normal.
 * @param {{ input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream }} io
 * @returns {Promise<string>}
 */
async function promptForToken(io) {
  const input = io.input ?? process.stdin
  const output = io.output ?? process.stdout

  const answer = input.isTTY
    ? await readHidden(PAT_QUESTION, input, output)
    : await readLine(PAT_QUESTION, input, output)

  const token = answer.trim()
  if (!token) throw new Error('nenhum token fornecido — peça o token de acesso ao mantenedor da biblioteca, ou defina GITHUB_TOKEN')
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
 * Lê a resposta sem eco algum, para que o token não apareça em screen shares,
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

import { execFile } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Resolve a credencial do GitHub, nesta ordem: gh CLI → GITHUB_TOKEN → prompt.
 * O token nunca é impresso nem logado; o prompt interativo mascara a digitação.
 * @param {NodeJS.ProcessEnv} env
 * @param {{ readGhToken?: () => Promise<string|null>, input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream }} [io]
 *   `readGhToken` injeta a checagem do `gh` CLI (default: `tokenFromGh`) — usado nos testes.
 * @returns {Promise<string>}
 * @throws {Error} quando nenhuma fonte fornece um token
 */
export async function resolveToken(env, io = {}) {
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
 * Pede o PAT interativamente. Em TTY, a digitação é mascarada (sem eco) —
 * em stdin não-TTY (pipe/CI), lê a linha normalmente sem travar.
 * @param {{ input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream }} io
 * @returns {Promise<string>}
 */
async function promptForToken(io) {
  const input = io.input ?? process.stdin
  const output = io.output ?? process.stdout
  const isTty = Boolean(input.isTTY)
  const rl = createInterface({ input, output, terminal: isTty })
  if (isTty) muteEcho(rl)
  try {
    const answer = await rl.question(
      'Personal Access Token do GitHub (escopo repo:read): ',
    )
    if (isTty) output.write('\n')
    const token = answer.trim()
    if (!token) throw new Error('nenhum token fornecido — rode `gh auth login` ou defina GITHUB_TOKEN')
    return token
  } finally {
    rl.close()
  }
}

/**
 * Suprime o eco dos caracteres digitados após o prompt inicial, para que o
 * PAT não apareça em screen shares, gravações de terminal (asciinema/script)
 * ou para quem estiver por perto.
 * @param {import('node:readline/promises').Interface} rl
 * @returns {void}
 */
function muteEcho(rl) {
  const writeToOutput = rl._writeToOutput.bind(rl)
  let promptShown = false
  rl._writeToOutput = (chunk) => {
    if (promptShown) return
    promptShown = true
    writeToOutput(chunk)
  }
}

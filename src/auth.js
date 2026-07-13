import { execFile } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Resolve a credencial do GitHub, nesta ordem: gh CLI → GITHUB_TOKEN → prompt.
 * O token nunca é impresso nem logado.
 * @param {NodeJS.ProcessEnv} env
 * @param {{ input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream }} [io]
 * @returns {Promise<string>}
 * @throws {Error} quando nenhuma fonte fornece um token
 */
export async function resolveToken(env, io = {}) {
  const fromGh = await tokenFromGh()
  if (fromGh) return fromGh
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN
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
 * @param {{ input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream }} io
 * @returns {Promise<string>}
 */
async function promptForToken(io) {
  const rl = createInterface({
    input: io.input ?? process.stdin,
    output: io.output ?? process.stdout,
  })
  try {
    const answer = await rl.question(
      'Personal Access Token do GitHub (escopo repo:read): ',
    )
    const token = answer.trim()
    if (!token) throw new Error('nenhum token fornecido — rode `gh auth login` ou defina GITHUB_TOKEN')
    return token
  } finally {
    rl.close()
  }
}

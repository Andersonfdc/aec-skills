import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const run = promisify(execFile)

/** O consumidor não tem git instalado. */
export class GitNotInstalledError extends Error {
  constructor() {
    super('git não encontrado no PATH — instale em https://git-scm.com/downloads')
    this.name = 'GitNotInstalledError'
  }
}

/** Encapsula todas as operações git sobre o clone local. Nenhum outro módulo executa git. */
export class GitStore {
  /** @param {string} repoDir caminho do clone (`~/.aec-skills/repo`) */
  constructor(repoDir) {
    this.repoDir = repoDir
  }

  /**
   * Clona o repositório privado. O token entra pela URL e NUNCA é logado.
   * @param {string} remoteUrl ex. `https://github.com/org/aec-skills-library.git`
   * @param {string} token
   * @returns {Promise<void>}
   */
  async clone(remoteUrl, token) {
    const authUrl = remoteUrl.replace('https://', `https://x-access-token:${token}@`)
    try {
      await this.#git(['clone', '--depth', '1', authUrl, this.repoDir], path.dirname(this.repoDir))
    } catch (error) {
      throw this.#redactToken(error, token)
    }
    await this.#git(['remote', 'set-url', 'origin', remoteUrl])
  }

  /**
   * `execFile` embute args/stderr no erro (message, stack, cmd, stdout,
   * stderr) — sem isso o token vazaria em qualquer falha de clone.
   * @param {Error} error
   * @param {string} token
   * @returns {Error}
   */
  #redactToken(error, token) {
    const redact = (value) => (typeof value === 'string' ? value.split(token).join('***') : value)
    for (const field of ['message', 'stack', 'cmd', 'stdout', 'stderr']) {
      if (error[field]) error[field] = redact(error[field])
    }
    return error
  }

  /** @returns {Promise<void>} */
  async fetch() {
    await this.#git(['fetch', '--quiet', 'origin'])
  }

  /** @returns {Promise<void>} */
  async pull() {
    await this.#git(['pull', '--quiet', '--ff-only', 'origin', 'HEAD'])
  }

  /** @returns {Promise<string>} SHA curto do HEAD local */
  async head() {
    return this.#git(['rev-parse', '--short', 'HEAD'])
  }

  /** @returns {Promise<string>} SHA curto do HEAD remoto já buscado */
  async remoteHead() {
    return this.#git(['rev-parse', '--short', 'FETCH_HEAD'])
  }

  /** @returns {Promise<string[]>} arquivos que mudaram entre o HEAD local e o remoto */
  async changedFiles() {
    const out = await this.#git(['diff', '--name-only', 'HEAD', 'FETCH_HEAD'])
    return out.split('\n').filter(Boolean)
  }

  /** @returns {Promise<string[]>} arquivos editados localmente (não commitados) */
  async locallyModified() {
    const out = await this.#git(['status', '--porcelain'])
    return out.split('\n').filter(Boolean).map((line) => line.slice(3).trim())
  }

  /** @returns {Promise<boolean>} */
  async isClone() {
    try {
      await this.#git(['rev-parse', '--git-dir'])
      return true
    } catch {
      return false
    }
  }

  /**
   * @param {string[]} args
   * @param {string} [cwd]
   * @returns {Promise<string>} stdout, sem a quebra de linha final
   */
  async #git(args, cwd = this.repoDir) {
    try {
      const { stdout } = await run('git', args, { cwd })
      // ponytail: trim() apagava o espaço inicial da 1ª linha do `status
      // --porcelain` (" M a.txt" -> "M a.txt"), quebrando o parsing de
      // colunas em locallyModified(). Remove só a quebra de linha final.
      return stdout.replace(/\r?\n$/, '')
    } catch (error) {
      if (error.code === 'ENOENT') throw new GitNotInstalledError()
      throw error
    }
  }
}

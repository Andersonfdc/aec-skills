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
  /**
   * @param {string} repoDir caminho do clone (`~/.aec-skills/repo`)
   * @param {string|null} [token] token de acesso; `null` usa o credential helper do ambiente (ex. `gh`)
   */
  constructor(repoDir, token = null) {
    this.repoDir = repoDir
    this.token = token
  }

  /**
   * Clona o repositório privado. O token nunca entra na URL — vai via
   * `-c http.extraHeader`, aplicado só a este processo e nunca gravado em
   * `.git/config`, então `origin` fica limpo desde a criação.
   * @param {string} remoteUrl ex. `https://github.com/org/aec-skills-library.git`
   * @returns {Promise<void>}
   */
  async clone(remoteUrl) {
    const args = [...this.#authArgs(), 'clone', '--depth', '1', remoteUrl, this.repoDir]
    await this.#git(args, path.dirname(this.repoDir))
  }

  /**
   * Override de credencial por invocação — nunca persiste em `.git/config`.
   * @returns {string[]} `['-c', 'http.extraHeader=...']` com token, `[]` sem token
   */
  #authArgs() {
    if (!this.token) return []
    const basic = Buffer.from(`x-access-token:${this.token}`).toString('base64')
    return ['-c', `http.extraHeader=Authorization: Basic ${basic}`]
  }

  /**
   * `execFile` embute args/stderr no erro (message, stack, cmd, stdout,
   * stderr, spawnargs, path) — sem isso o token, ou seu header em base64,
   * vazaria em qualquer falha de git. No-op sem token configurado.
   * @param {Error} error
   * @returns {Error}
   */
  #redactToken(error) {
    if (!this.token) return error
    const basic = Buffer.from(`x-access-token:${this.token}`).toString('base64')
    const redact = (value) => (typeof value === 'string' ? value.split(this.token).join('***').split(basic).join('***') : value)
    for (const field of ['message', 'stack', 'cmd', 'stdout', 'stderr', 'path']) {
      if (error[field]) error[field] = redact(error[field])
    }
    if (Array.isArray(error.spawnargs)) error.spawnargs = error.spawnargs.map(redact)
    return error
  }

  /** @returns {Promise<void>} */
  async fetch() {
    await this.#git([...this.#authArgs(), 'fetch', '--quiet', 'origin'])
  }

  /** @returns {Promise<void>} */
  async pull() {
    await this.#git([...this.#authArgs(), 'pull', '--quiet', '--ff-only', 'origin', 'HEAD'])
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
      throw this.#redactToken(error)
    }
  }
}

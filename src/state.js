import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { storePaths } from './paths.js'

/**
 * @typedef {object} InstalledEntry
 * @property {string} name
 * @property {'skill'|'agent'|'command'|'hook'} kind
 * @property {import('./harness.js').HarnessId} harness
 * @property {string} dest caminho criado no harness
 * @property {'link'|'copy'} mode como foi criado — `copy` precisa ser removido explicitamente
 * @property {string} sha SHA do store no momento da instalação
 */

/**
 * @param {string} homeDir
 * @returns {Promise<{ remoteUrl?: string, token?: string, lastFetch?: number }>}
 */
export async function readConfig(homeDir) {
  return readJson(storePaths(homeDir).configFile, {})
}

/**
 * Grava a configuração com permissão 0600 — contém o token.
 * @param {string} homeDir
 * @param {{ remoteUrl?: string, token?: string, lastFetch?: number }} config
 * @returns {Promise<void>}
 */
export async function writeConfig(homeDir, config) {
  await writeJson(storePaths(homeDir).configFile, config, 0o600)
}

/**
 * @param {string} homeDir
 * @returns {Promise<InstalledEntry[]>}
 */
export async function readInstalled(homeDir) {
  return readJson(storePaths(homeDir).installedFile, [])
}

/**
 * @param {string} homeDir
 * @param {InstalledEntry[]} entries
 * @returns {Promise<void>}
 */
export async function writeInstalled(homeDir, entries) {
  await writeJson(storePaths(homeDir).installedFile, entries, 0o644)
}

/**
 * @template T
 * @param {string} file
 * @param {T} fallback
 * @returns {Promise<T>}
 */
async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

/**
 * @param {string} file
 * @param {unknown} value
 * @param {number} mode
 * @returns {Promise<void>}
 */
async function writeJson(file, value, mode) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode })
}

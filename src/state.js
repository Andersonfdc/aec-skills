import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { storePaths } from './paths.js'

/**
 * @typedef {object} InstalledEntry
 * @property {string} name
 * @property {'skill'|'agent'|'command'|'hook'} kind
 * @property {import('./harness.js').HarnessId} harness
 * @property {string} dest caminho criado no harness; no hook, o próprio settings.json
 * @property {'link'|'copy'|'merge'|'index'} mode como foi criado — `copy` precisa ser removido explicitamente; `merge` é edição dentro de um arquivo do usuário, nunca apagável; `index` é uma entrada no índice do GEMINI.md (skill em harness `gemini`), sem arquivo próprio
 * @property {string} sha SHA do store no momento da instalação
 * @property {{ hooks: Record<string, object[]> }} [fragment] só em `kind: 'hook'` — o fragmento aplicado, guardado aqui para que `uninstall` consiga desfazê-lo DEPOIS de o store (e o repo) já terem sido apagados
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
 * Insere ou substitui entradas em installed.json, preservando as demais.
 *
 * Duas entradas são a mesma quando coincidem name+harness+dest. `dest` sozinho
 * não serve: todo hook do Claude Code tem o mesmo `dest` (o settings.json), e
 * chavear só por ele faria um hook expulsar o outro do registro.
 * @param {string} homeDir
 * @param {InstalledEntry[]} added
 * @returns {Promise<void>}
 */
export async function upsertInstalled(homeDir, added) {
  if (added.length === 0) return
  const key = (e) => `${e.name}|${e.harness}|${e.dest}`
  const replaced = new Set(added.map(key))
  const current = await readInstalled(homeDir)
  await writeInstalled(homeDir, [...current.filter((e) => !replaced.has(key(e))), ...added])
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
  // `mode` no writeFile só se aplica na criação — reforça em toda gravação,
  // senão um config.json pré-existente com permissões mais abertas nunca aperta.
  await chmodIfPosix(file, mode)
}

/**
 * Windows não implementa bits de permissão POSIX — fs.chmod lá é um
 * no-op inofensivo, então pulamos para não gastar uma syscall sem efeito.
 * @param {string} file
 * @param {number} mode
 * @returns {Promise<void>}
 */
async function chmodIfPosix(file, mode) {
  if (process.platform === 'win32') return
  await chmod(file, mode)
}

import { cp, lstat, mkdir, readlink, realpath, rm, symlink } from 'node:fs/promises'
import path from 'node:path'

/** Destino existe e não foi criado por nós — nunca sobrescrever. */
export class DestinationOccupiedError extends Error {
  /** @param {string} dest */
  constructor(dest) {
    super(`destino já existe e não foi criado pelo aec-skills: ${dest}`)
    this.name = 'DestinationOccupiedError'
    this.dest = dest
  }
}

/**
 * Liga `source` em `dest`. Usa junction no Windows (não exige privilégio de
 * administrador) e symlink nos demais SOs. Se o SO recusar o link (EPERM),
 * cai para cópia — o chamador registra o modo em installed.json.
 * @param {string} source caminho absoluto dentro do store
 * @param {string} dest caminho absoluto no harness
 * @returns {Promise<'link'|'copy'>}
 * @throws {DestinationOccupiedError} quando `dest` existe e não aponta para `source`
 */
export async function linkPath(source, dest) {
  if (await pointsTo(dest, source)) return 'link'
  if (await pathExists(dest)) throw new DestinationOccupiedError(dest)

  await mkdir(path.dirname(dest), { recursive: true })
  try {
    await symlink(source, dest, await linkType(source))
    return 'link'
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error
    await cp(source, dest, { recursive: true })
    return 'copy'
  }
}

/**
 * Remove `dest` de acordo com o modo em que foi instalado.
 * Em modo 'link' (padrão), remove apenas se `dest` for um link nosso apontando
 * para `source` — verificado via `pointsTo`. Em modo 'copy', remove `dest` se
 * existir; isso é seguro porque o chamador só passa 'copy' para destinos que
 * ele mesmo registrou em installed.json como cópia de fallback criada por nós.
 * @param {string} dest
 * @param {string} source
 * @param {'link'|'copy'} [mode]
 * @returns {Promise<boolean>} true se removeu
 */
export async function unlinkPath(dest, source, mode = 'link') {
  const shouldRemove = mode === 'copy' ? await pathExists(dest) : await pointsTo(dest, source)
  if (!shouldRemove) return false
  await rm(dest, { recursive: true, force: true })
  return true
}

/** @param {string} source @returns {Promise<'junction'|'dir'|'file'>} */
async function linkType(source) {
  const info = await lstat(source)
  if (!info.isDirectory()) return 'file'
  return process.platform === 'win32' ? 'junction' : 'dir'
}

/** @param {string} dest @param {string} source @returns {Promise<boolean>} */
async function pointsTo(dest, source) {
  try {
    const info = await lstat(dest)
    if (!info.isSymbolicLink()) return false
    const target = await readlink(dest)
    return path.resolve(await realpath(target)) === path.resolve(await realpath(source))
  } catch {
    return false
  }
}

/** @param {string} target @returns {Promise<boolean>} */
async function pathExists(target) {
  try {
    await lstat(target)
    return true
  } catch {
    return false
  }
}

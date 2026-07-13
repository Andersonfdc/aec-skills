import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * Cria um diretório temporário real e registra a limpeza no contexto do teste.
 * @param {import('node:test').TestContext} t
 * @returns {Promise<string>}
 */
export async function tmpHome(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'aec-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

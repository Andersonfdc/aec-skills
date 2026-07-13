import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { HARNESSES } from './harness.js'
import { mergeJsonHooks, removeJsonHooks } from './merge-block.js'
import { upsertInstalled } from './state.js'

/** Hooks só existem no Claude Code. */
const HOOK_HARNESS = 'claude'

/** @param {string} homeDir @returns {string} */
function settingsFile(homeDir) {
  return path.join(HARNESSES[HOOK_HARNESS].root(homeDir), 'settings.json')
}

/**
 * Lê o fragmento do hook e monta um diff legível do que será injetado.
 * O comando `add` mostra esse diff e pede confirmação antes de chamar `installHook`.
 * @param {string} homeDir
 * @param {import('./library.js').Artifact} artifact
 * @returns {Promise<{ fragment: { hooks: Record<string, object[]> }, diff: string }>}
 */
export async function previewHook(homeDir, artifact) {
  const fragment = await readFragment(artifact)
  const lines = Object.entries(fragment.hooks).flatMap(([event, entries]) =>
    entries.map((entry) => `  + ${event}: ${JSON.stringify(entry)}`),
  )
  return { fragment, diff: lines.join('\n') }
}

/**
 * Injeta o hook no settings.json do Claude Code e registra a instalação em
 * installed.json. Faz backup antes de escrever e preserva tudo o que já estava
 * no arquivo.
 *
 * A entrada carrega o próprio fragmento aplicado. É o que permite ao `uninstall`
 * tirar o hook do settings.json ANTES de apagar o store: depois do `rm`, o
 * `hook.json` do repo já não existe, e um hook órfão apontando para um script
 * dentro do store apagado dispararia em toda sessão, sem nada que o removesse.
 * @param {string} homeDir
 * @param {import('./library.js').Artifact} artifact
 * @param {string} [sha] SHA do store no momento da instalação
 * @returns {Promise<void>}
 */
export async function installHook(homeDir, artifact, sha = 'desconhecido') {
  const fragment = await readFragment(artifact)
  await updateSettings(homeDir, (settings) => mergeJsonHooks(settings, fragment))
  await upsertInstalled(homeDir, [{
    name: artifact.name,
    kind: 'hook',
    harness: HOOK_HARNESS,
    dest: settingsFile(homeDir),
    mode: 'merge',
    sha,
    fragment,
  }])
}

/**
 * Remove do settings.json exatamente as entradas deste hook, lendo o fragmento
 * do repo. Não mexe em installed.json — quem cuida disso é `uninstallArtifact`.
 * @param {string} homeDir
 * @param {import('./library.js').Artifact} artifact
 * @returns {Promise<void>}
 */
export async function uninstallHook(homeDir, artifact) {
  await removeHookFragment(homeDir, await readFragment(artifact))
}

/**
 * Remove do settings.json exatamente as entradas de um fragmento já conhecido —
 * sem tocar no repo, que pode já ter sido apagado (ver `installHook`).
 *
 * O casamento com o que já está no arquivo é por igualdade profunda, não por
 * proveniência (ver `removeJsonHooks` em merge-block.js): se o usuário tiver
 * escrito, por conta própria, uma entrada byte-idêntica à nossa, ela também é
 * removida. Não há campo marcador para diferenciar — injetar um exigiria
 * confirmar que o Claude Code tolera campos desconhecidos num hook, o que não
 * está verificado. O chamador deve mostrar ao usuário o que será removido antes
 * de chamar esta função (é o que `remove` faz, via `previewHook`).
 * @param {string} homeDir
 * @param {{ hooks: Record<string, object[]> }} fragment
 * @returns {Promise<void>}
 */
export async function removeHookFragment(homeDir, fragment) {
  await updateSettings(homeDir, (settings) => removeJsonHooks(settings, fragment))
}

/**
 * Lê, transforma e regrava o settings.json: nunca sobrescreve às cegas.
 * JSON inválido interrompe antes de qualquer escrita ou backup — o arquivo do
 * usuário permanece intocado e o erro nomeia o arquivo e a causa. Quando o
 * JSON é válido, o conteúdo anterior vai para `settings.json.bak` (um único
 * snapshot, sobrescrito a cada instalação — não é histórico) antes da escrita
 * atômica do novo conteúdo.
 * @param {string} homeDir
 * @param {(settings: Record<string, unknown>) => Record<string, unknown>} transform
 * @returns {Promise<void>}
 */
async function updateSettings(homeDir, transform) {
  const file = settingsFile(homeDir)
  await mkdir(path.dirname(file), { recursive: true })

  const raw = await readFileOrNull(file)
  const settings = raw === null ? {} : parseSettings(raw, file)

  if (raw !== null) await copyFile(file, `${file}.bak`)
  await writeAtomic(file, `${JSON.stringify(transform(settings), null, 2)}\n`)
}

/**
 * @param {string} raw
 * @param {string} file
 * @returns {Record<string, unknown>}
 * @throws {Error} quando `raw` não é JSON válido
 */
function parseSettings(raw, file) {
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `${file}: JSON inválido (${error.message}) — o arquivo não foi tocado; corrija-o manualmente antes de instalar hooks. Esperado um objeto JSON, recebido: ${raw.slice(0, 80)}`,
    )
  }
}

/**
 * Escreve num arquivo temporário no mesmo diretório e só então o renomeia por
 * cima do destino, para que um crash a meio da escrita nunca deixe o
 * settings.json truncado — o rename é a única operação que troca o conteúdo
 * visível, e é atômica no mesmo volume (POSIX e Windows).
 * @param {string} file
 * @param {string} content
 * @returns {Promise<void>}
 */
async function writeAtomic(file, content) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(4).toString('hex')}.tmp`)
  await writeFile(tmp, content)
  await rename(tmp, file)
}

/**
 * @param {import('./library.js').Artifact} artifact
 * @returns {Promise<{ hooks: Record<string, object[]> }>}
 */
async function readFragment(artifact) {
  const raw = await readFile(path.join(artifact.sourcePath, 'hook.json'), 'utf8')
  const fragment = JSON.parse(raw)
  if (!fragment.hooks) {
    throw new Error(`hook "${artifact.name}": hook.json precisa ter a chave "hooks", recebido ${Object.keys(fragment)}`)
  }
  return fragment
}

/** @param {string} file @returns {Promise<string|null>} */
async function readFileOrNull(file) {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseFrontmatter } from './frontmatter.js'
import { validateSkill, validateAgent } from './validate.js'

/**
 * @typedef {object} Artifact
 * @property {'skill'|'agent'|'command'|'hook'} kind
 * @property {string} name
 * @property {string} sourcePath diretório (skill, hook) ou arquivo (agent, command)
 * @property {Record<string, unknown>} attrs
 * @property {string} body
 * @property {string[]} errors vazio quando o artefato é válido
 */

/**
 * Lê o inventário completo do clone. Artefato inválido é devolvido com `errors`
 * preenchido — quem decide o que fazer é o comando `add`.
 * @param {string} repoDir raiz do clone (`~/.aec-skills/repo`)
 * @returns {Promise<Artifact[]>} ordenado por kind, depois name
 */
export async function readLibrary(repoDir) {
  const artifacts = [
    ...(await readSkills(path.join(repoDir, 'skills'))),
    ...(await readMarkdownDir(path.join(repoDir, 'agents'), 'agent')),
    ...(await readMarkdownDir(path.join(repoDir, 'commands'), 'command')),
    ...(await readHooks(path.join(repoDir, 'hooks'))),
  ]
  return artifacts.sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`))
}

/**
 * @param {Artifact[]} artifacts
 * @param {string} name
 * @returns {Artifact|undefined}
 */
export function findArtifact(artifacts, name) {
  return artifacts.find((a) => a.name === name)
}

/** @param {string} dir @returns {Promise<Artifact[]>} */
async function readSkills(dir) {
  const names = await listDirs(dir)
  const artifacts = []
  for (const name of names) {
    const skillFile = path.join(dir, name, 'SKILL.md')
    const parsed = await readArtifactFile(skillFile)
    if (!parsed) continue
    artifacts.push({
      kind: 'skill',
      name,
      sourcePath: path.join(dir, name),
      attrs: parsed.attrs,
      body: parsed.body,
      errors: parsed.errors ?? validateSkill(parsed.attrs, name),
    })
  }
  return artifacts
}

/** @param {string} dir @param {'agent'|'command'} kind @returns {Promise<Artifact[]>} */
async function readMarkdownDir(dir, kind) {
  const files = (await listFiles(dir)).filter((f) => f.endsWith('.md'))
  const artifacts = []
  for (const file of files) {
    const parsed = await readArtifactFile(path.join(dir, file))
    if (!parsed) continue
    const name = file.replace(/\.md$/, '')
    artifacts.push({
      kind,
      name,
      sourcePath: path.join(dir, file),
      attrs: parsed.attrs,
      body: parsed.body,
      errors: parsed.errors ?? (kind === 'agent' ? validateAgent(parsed.attrs, file) : []),
    })
  }
  return artifacts
}

/** @param {string} dir @returns {Promise<Artifact[]>} */
async function readHooks(dir) {
  const names = await listDirs(dir)
  return names.map((name) => ({
    kind: 'hook',
    name,
    sourcePath: path.join(dir, name),
    attrs: {},
    body: '',
    errors: [],
  }))
}

/**
 * Lê e parseia um artefato markdown. YAML malformado não é um erro de I/O — vira
 * um artefato com `errors` preenchido em vez de rejeitar o inventário inteiro.
 * @param {string} file
 * @returns {Promise<{attrs: Record<string, unknown>, body: string, errors?: string[]}|null>}
 */
async function readArtifactFile(file) {
  let content
  try {
    content = await readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  try {
    return parseFrontmatter(content)
  } catch (error) {
    return { attrs: {}, body: '', errors: [`${file}: ${error.message}`] }
  }
}

/** @param {string} dir @returns {Promise<string[]>} */
async function listDirs(dir) {
  const entries = await readdirSafe(dir)
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

/** @param {string} dir @returns {Promise<string[]>} */
async function listFiles(dir) {
  const entries = await readdirSafe(dir)
  return entries.filter((e) => e.isFile()).map((e) => e.name)
}

/** @param {string} dir @returns {Promise<import('node:fs').Dirent[]>} */
async function readdirSafe(dir) {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

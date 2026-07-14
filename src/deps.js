import { findArtifact } from './library.js'

/**
 * Um artefato `internal: true` é **componente, não produto**: ele existe para
 * servir a outro artefato, e não aparece no menu nem no `list`. É o caso dos
 * subagentes que a `white-box-qa` despacha — quem instala a skill quer a skill,
 * não quer decidir sobre as peças dela.
 *
 * Continua instalável por nome (`add wbqa-refuter`), para quem sabe o que quer.
 * @param {import('./library.js').Artifact} artifact
 * @returns {boolean}
 */
export function isInternal(artifact) {
  return artifact.attrs?.internal === true
}

/**
 * O que o usuário deve ver: os produtos, sem as peças.
 * @param {import('./library.js').Artifact[]} artifacts
 * @returns {import('./library.js').Artifact[]}
 */
export function publicArtifacts(artifacts) {
  return artifacts.filter((a) => !isInternal(a))
}

/**
 * O que um artefato declara precisar, no frontmatter (`requires:`). Aceita uma
 * string única ou uma lista.
 * @param {import('./library.js').Artifact} artifact
 * @returns {string[]}
 */
export function requiredNames(artifact) {
  const requires = artifact.attrs?.requires
  if (typeof requires === 'string') return [requires]
  if (!Array.isArray(requires)) return []
  return requires.filter((name) => typeof name === 'string' && name.trim() !== '')
}

/**
 * Expande os nomes pedidos com tudo que eles exigem, em cascata.
 *
 * O pedido vem antes das dependências na lista: instalar a skill e só depois os
 * subagentes dela deixa o log legível na ordem em que a pessoa pensa.
 * @param {import('./library.js').Artifact[]} artifacts a biblioteca inteira
 * @param {string[]} names o que o usuário escolheu
 * @returns {{ names: string[], missing: string[] }} `missing`: requires que não existem na biblioteca
 */
export function expandRequires(artifacts, names) {
  const resolved = []
  const seen = new Set()
  const missing = new Set()

  const visit = (name) => {
    if (seen.has(name)) return // também é o guard de ciclo
    seen.add(name)

    const artifact = findArtifact(artifacts, name)
    if (!artifact) {
      missing.add(name)
      return
    }
    resolved.push(name)
    for (const required of requiredNames(artifact)) visit(required)
  }

  for (const name of names) visit(name)
  return { names: resolved, missing: [...missing] }
}

/**
 * Componentes que ficaram sem dono: internos que nenhum artefato ainda instalado
 * exige. É o que o `remove` precisa varrer para não deixar subagente órfão
 * apontando para um store que ninguém mais usa.
 *
 * Um produto nunca é órfão — ele foi instalado porque alguém o quis, não porque
 * outra coisa precisava dele.
 * @param {import('./library.js').Artifact[]} artifacts
 * @param {string[]} stillInstalled nomes que permanecem instalados
 * @returns {string[]}
 */
export function orphanedInternals(artifacts, stillInstalled) {
  // As raízes da varredura são só os PRODUTOS ainda instalados. Incluir os
  // próprios componentes faria cada um "exigir a si mesmo" — nenhum ficaria
  // órfão nunca, e o `remove` deixaria os quatro subagentes para trás.
  const roots = stillInstalled.filter((name) => {
    const artifact = findArtifact(artifacts, name)
    return artifact !== undefined && !isInternal(artifact)
  })

  const wanted = new Set(expandRequires(artifacts, roots).names)
  return artifacts
    .filter((a) => isInternal(a) && !wanted.has(a.name))
    .map((a) => a.name)
}

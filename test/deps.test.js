import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isInternal, publicArtifacts, expandRequires, orphanedInternals } from '../src/deps.js'

/** @param {string} name @param {object} [attrs] @returns {import('../src/library.js').Artifact} */
function artifact(name, attrs = {}) {
  return { kind: 'agent', name, sourcePath: `/x/${name}.md`, attrs, body: '', errors: [] }
}

const LIBRARY = [
  artifact('hello-aec', {}),
  { ...artifact('white-box-qa', { requires: ['white-box-qa-specialist', 'wbqa-refuter'] }), kind: 'skill' },
  artifact('white-box-qa-specialist', { internal: true, requires: ['security-auditor', 'wbqa-refuter'] }),
  artifact('security-auditor', { internal: true }),
  artifact('wbqa-refuter', { internal: true }),
]

test('internal marca o artefato como componente, não produto', () => {
  assert.equal(isInternal(artifact('x', { internal: true })), true)
  assert.equal(isInternal(artifact('x', {})), false)
  assert.equal(isInternal(artifact('x', { internal: false })), false)
})

test('o menu só enxerga o que é produto', () => {
  assert.deepEqual(publicArtifacts(LIBRARY).map((a) => a.name), ['hello-aec', 'white-box-qa'])
})

test('escolher a skill traz os subagentes dela, em cascata', () => {
  const { names } = expandRequires(LIBRARY, ['white-box-qa'])

  assert.deepEqual(names.sort(), [
    'security-auditor', 'wbqa-refuter', 'white-box-qa', 'white-box-qa-specialist',
  ], 'security-auditor entra via o specialist, que entra via a skill')
})

test('o artefato pedido vem primeiro — as dependências são instaladas depois dele', () => {
  const { names } = expandRequires(LIBRARY, ['white-box-qa'])
  assert.equal(names[0], 'white-box-qa')
})

test('dependência repetida por dois caminhos aparece uma vez só', () => {
  // wbqa-refuter é exigido pela skill E pelo specialist.
  const { names } = expandRequires(LIBRARY, ['white-box-qa'])
  assert.equal(names.filter((n) => n === 'wbqa-refuter').length, 1)
})

test('artefato sem requires não arrasta ninguém', () => {
  assert.deepEqual(expandRequires(LIBRARY, ['hello-aec']).names, ['hello-aec'])
})

test('requires apontando para nome inexistente é reportado, não ignorado', () => {
  const quebrado = [artifact('x', { requires: ['nao-existe'] })]
  const { missing } = expandRequires(quebrado, ['x'])

  assert.deepEqual(missing, ['nao-existe'])
})

test('ciclo entre requires não trava o expand', () => {
  const ciclo = [
    artifact('a', { requires: ['b'] }),
    artifact('b', { requires: ['a'] }),
  ]
  const { names } = expandRequires(ciclo, ['a'])
  assert.deepEqual(names.sort(), ['a', 'b'])
})

test('requires aceita string única, não só lista', () => {
  const lib = [artifact('a', { requires: 'b' }), artifact('b', {})]
  assert.deepEqual(expandRequires(lib, ['a']).names.sort(), ['a', 'b'])
})

test('internos órfãos são os que ninguém mais instalado exige', () => {
  // hello-aec e white-box-qa instalados; ao remover white-box-qa, os 3 internos
  // dela ficam sem dono.
  const orfaos = orphanedInternals(LIBRARY, ['hello-aec'])

  assert.deepEqual(orfaos.sort(), ['security-auditor', 'wbqa-refuter', 'white-box-qa-specialist'])
})

test('interno exigido por algo que continua instalado não é órfão', () => {
  const orfaos = orphanedInternals(LIBRARY, ['white-box-qa'])
  assert.deepEqual(orfaos, [], 'a skill segue instalada, então os subagentes dela ficam')
})

test('produto nunca é tratado como órfão, mesmo sem ninguém o exigir', () => {
  assert.equal(orphanedInternals(LIBRARY, []).includes('hello-aec'), false)
})

// Regressão: `installed.json` lista TUDO que está em disco, componentes inclusive.
// Usar essa lista como raiz fazia cada componente exigir a si mesmo — nenhum ficava
// órfão, e o `remove` da skill deixava os quatro subagentes para trás.
test('componente instalado não se sustenta sozinho como raiz', () => {
  // Estado real logo após remover a white-box-qa: os 4 internos seguem em disco.
  const aindaEmDisco = [
    'white-box-qa-specialist', 'security-auditor', 'wbqa-refuter',
  ]
  const orfaos = orphanedInternals(LIBRARY, aindaEmDisco)

  assert.deepEqual(orfaos.sort(), ['security-auditor', 'wbqa-refuter', 'white-box-qa-specialist'],
    'sem nenhum produto instalado, todos os componentes estão órfãos')
})

test('produto instalado ainda segura os componentes dele, mesmo listados junto', () => {
  const orfaos = orphanedInternals(LIBRARY, ['white-box-qa', 'white-box-qa-specialist', 'wbqa-refuter'])
  assert.deepEqual(orfaos, [])
})

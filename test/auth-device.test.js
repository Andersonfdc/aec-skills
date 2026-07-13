import test from 'node:test'
import assert from 'node:assert/strict'
import { deviceLogin } from '../src/auth-device.js'

/**
 * `fetch` falso: devolve as respostas na ordem em que foram enfileiradas e
 * registra o que foi pedido.
 * @param {object[]} responses
 */
function fakeFetch(responses) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, body: Object.fromEntries(new URLSearchParams(init.body)) })
    const next = responses.shift()
    if (!next) throw new Error('fetch chamado mais vezes que o esperado')
    return {
      ok: next.status === undefined || next.status < 400,
      status: next.status ?? 200,
      json: async () => next.json,
    }
  }
  impl.calls = calls
  return impl
}

/** @param {typeof fetch} impl @param {string[]} [lines] */
function io(impl, lines = []) {
  return { fetch: impl, log: (l) => lines.push(l), sleep: async () => {}, now: () => 0 }
}

test('devolve o token quando o usuário autoriza', async () => {
  const impl = fakeFetch([
    { json: { device_code: 'dev1', user_code: 'WDJB-MJHT', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 900 } },
    { json: { access_token: 'gho_secreto' } },
  ])

  assert.equal(await deviceLogin('Iv1.abc', io(impl)), 'gho_secreto')
})

test('mostra o código e a URL, e nunca imprime o token', async () => {
  const lines = []
  const impl = fakeFetch([
    { json: { device_code: 'dev1', user_code: 'WDJB-MJHT', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 900 } },
    { json: { access_token: 'gho_secreto' } },
  ])

  await deviceLogin('Iv1.abc', io(impl, lines))
  const out = lines.join('\n')

  assert.match(out, /WDJB-MJHT/)
  assert.match(out, /https:\/\/github\.com\/login\/device/)
  assert.doesNotMatch(out, /gho_secreto/)
})

test('pede o escopo repo — a biblioteca é um repo privado', async () => {
  const impl = fakeFetch([
    { json: { device_code: 'dev1', user_code: 'W', verification_uri: 'u', interval: 5, expires_in: 900 } },
    { json: { access_token: 't' } },
  ])

  await deviceLogin('Iv1.abc', io(impl))
  assert.equal(impl.calls[0].body.scope, 'repo')
  assert.equal(impl.calls[0].body.client_id, 'Iv1.abc')
})

test('continua esperando enquanto o GitHub responde authorization_pending', async () => {
  const impl = fakeFetch([
    { json: { device_code: 'dev1', user_code: 'W', verification_uri: 'u', interval: 5, expires_in: 900 } },
    { json: { error: 'authorization_pending' } },
    { json: { error: 'authorization_pending' } },
    { json: { access_token: 'gho_ok' } },
  ])

  assert.equal(await deviceLogin('Iv1.abc', io(impl)), 'gho_ok')
  assert.equal(impl.calls.length, 4)
})

test('slow_down aumenta o intervalo entre as tentativas', async () => {
  const waits = []
  const impl = fakeFetch([
    { json: { device_code: 'dev1', user_code: 'W', verification_uri: 'u', interval: 5, expires_in: 900 } },
    { json: { error: 'slow_down', interval: 10 } },
    { json: { access_token: 't' } },
  ])

  await deviceLogin('Iv1.abc', {
    fetch: impl,
    log: () => {},
    now: () => 0,
    sleep: async (ms) => { waits.push(ms) },
  })

  assert.deepEqual(waits, [5000, 10000])
})

test('autorização negada no navegador vira erro legível', async () => {
  const impl = fakeFetch([
    { json: { device_code: 'dev1', user_code: 'W', verification_uri: 'u', interval: 5, expires_in: 900 } },
    { json: { error: 'access_denied' } },
  ])

  await assert.rejects(() => deviceLogin('Iv1.abc', io(impl)), /negada/)
})

test('device flow desabilitado no OAuth App vira erro que diz o que fazer', async () => {
  const impl = fakeFetch([{ json: { error: 'device_flow_disabled' } }])

  await assert.rejects(() => deviceLogin('Iv1.abc', io(impl)), /device flow/i)
})

test('o código expira e o loop termina em vez de rodar para sempre', async () => {
  let clock = 0
  const impl = fakeFetch([
    { json: { device_code: 'dev1', user_code: 'W', verification_uri: 'u', interval: 5, expires_in: 10 } },
    { json: { error: 'authorization_pending' } },
    { json: { error: 'authorization_pending' } },
    { json: { error: 'authorization_pending' } },
  ])

  await assert.rejects(
    () => deviceLogin('Iv1.abc', {
      fetch: impl,
      log: () => {},
      now: () => clock,
      sleep: async (ms) => { clock += ms },
    }),
    /expirou/,
  )
})

test('HTTP quebrado vira erro com o status', async () => {
  const impl = fakeFetch([{ status: 503, json: {} }])
  await assert.rejects(() => deviceLogin('Iv1.abc', io(impl)), /503/)
})

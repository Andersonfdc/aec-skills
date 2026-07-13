const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

// A biblioteca é um repositório privado: sem `repo`, o clone falha com 404.
const SCOPE = 'repo'

/**
 * OAuth Device Flow do GitHub: o usuário abre uma URL, digita um código curto e
 * autoriza no navegador. Nenhum segredo do app é necessário — é por isso que o
 * `client_id` pode viver no código, em claro.
 *
 * O token nunca é impresso: só o `user_code` (que é público e inútil sozinho).
 *
 * @param {string} clientId Client ID do OAuth App, com device flow habilitado
 * @param {{ fetch?: typeof fetch, log?: (line: string) => void, sleep?: (ms: number) => Promise<void>, now?: () => number }} [io]
 * @returns {Promise<string>} o access token
 * @throws {Error} quando o usuário nega, o código expira ou o GitHub recusa
 */
export async function deviceLogin(clientId, io = {}) {
  const doFetch = io.fetch ?? fetch
  const log = io.log ?? console.log
  const sleep = io.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  const now = io.now ?? Date.now

  const start = await postForm(doFetch, DEVICE_CODE_URL, { client_id: clientId, scope: SCOPE })
  if (start.error) throw new Error(explain(start))

  log('')
  log(`  Abra no navegador:  ${start.verification_uri}`)
  log(`  E digite o código:  ${start.user_code}`)
  log('')
  log('  aguardando autorização...')

  let interval = (start.interval ?? 5) * 1000
  const expiresAt = now() + (start.expires_in ?? 900) * 1000

  while (now() < expiresAt) {
    await sleep(interval)
    const result = await postForm(doFetch, ACCESS_TOKEN_URL, {
      client_id: clientId,
      device_code: start.device_code,
      grant_type: GRANT_TYPE,
    })

    if (result.access_token) return result.access_token
    if (result.error === 'authorization_pending') continue
    if (result.error === 'slow_down') {
      // O GitHub manda o novo intervalo; sem ele, a recomendação do RFC 8628 é +5s.
      interval = (result.interval ?? interval / 1000 + 5) * 1000
      continue
    }
    throw new Error(explain(result))
  }

  throw new Error('o código expirou antes da autorização — rode o login de novo')
}

/**
 * @param {typeof fetch} doFetch
 * @param {string} url
 * @param {Record<string, string>} body
 * @returns {Promise<Record<string, any>>}
 */
async function postForm(doFetch, url, body) {
  const response = await doFetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: new URLSearchParams(body),
  })
  if (!response.ok) throw new Error(`o GitHub respondeu ${response.status} em ${url}`)
  return response.json()
}

/**
 * @param {{ error?: string, error_description?: string }} result
 * @returns {string}
 */
function explain(result) {
  switch (result.error) {
    case 'access_denied':
      return 'autorização negada no navegador'
    case 'expired_token':
      return 'o código expirou antes da autorização — rode o login de novo'
    case 'device_flow_disabled':
      return 'o OAuth App não tem device flow habilitado — ligue a opção "Enable Device Flow" nas configurações do app'
    default:
      return result.error_description ?? result.error ?? 'o GitHub recusou a autenticação'
  }
}

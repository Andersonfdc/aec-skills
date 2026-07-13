/**
 * Comando real de invocação do CLI. Não há publicação no npm — `aec-skills`
 * sozinho no `npx` resolve para o registry e falha com 404. Fonte única para
 * toda mensagem que sugere um comando ao usuário; mover para o npm no futuro
 * vira uma troca de uma linha aqui.
 */
export const CLI_INVOCATION = 'npx github:Andersonfdc/aec-skills'

/**
 * URL padrão da biblioteca: o CLI e a biblioteca vivem no mesmo repositório.
 */
export const DEFAULT_REMOTE_URL = 'https://github.com/Andersonfdc/aec-skills.git'

/**
 * Client ID do OAuth App usado no device flow. NÃO é um segredo: o device flow
 * existe justamente para clientes públicos, que não conseguem guardar um
 * client_secret — o GitHub nunca pede um aqui.
 *
 * Vazio significa "não registrado ainda": nesse caso o menu de login esconde a
 * opção de navegador e oferece só PAT e gh CLI.
 *
 * Para preencher: https://github.com/settings/applications/new → marque
 * "Enable Device Flow" → copie o Client ID.
 */
export const OAUTH_CLIENT_ID = ''

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

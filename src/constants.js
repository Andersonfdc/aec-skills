/**
 * Comando real de invocação do CLI. Não há publicação no npm — `aec-skills`
 * sozinho no `npx` resolve para o registry e falha com 404. Fonte única para
 * toda mensagem que sugere um comando ao usuário; mover para o npm no futuro
 * vira uma troca de uma linha aqui.
 */
export const CLI_INVOCATION = 'npx github:Andersonfdc/aec-skills'

/**
 * A biblioteca vive em OUTRO repositório, privado — este, o do CLI, é público.
 *
 * Tem que ser assim: `npx github:...` clona este repositório para poder rodar.
 * Se ele fosse privado, quem não tem acesso não baixaria nem o CLI, e morreria
 * antes de chegar à tela onde colaria o token. Alguma coisa precisa ser pública,
 * e o CLI é a parte que não guarda segredo nenhum.
 */
export const DEFAULT_REMOTE_URL = 'https://github.com/Andersonfdc/aec-skills-library.git'

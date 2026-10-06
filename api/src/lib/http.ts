export class ApiError extends Error {
  statusCode: number
  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

export const naoEncontrado = (recurso: string) => new ApiError(404, `${recurso} não encontrado`)
export const invalido = (mensagem: string) => new ApiError(400, mensagem)

export const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const

export const UUID_OPCIONAL = { type: ['string', 'null'], pattern: UUID.pattern } as const

export const DATA = { type: 'string', format: 'date' } as const
export const DATA_OPCIONAL = { type: ['string', 'null'], format: 'date' } as const
export const DINHEIRO = { type: 'number', exclusiveMinimum: 0, maximum: 99999999.99 } as const
export const TEXTO = { type: 'string', minLength: 1, maxLength: 200 } as const
export const TEXTO_LONGO = { type: 'string', maxLength: 2000 } as const

export const paramsId = { type: 'object', required: ['id'], properties: { id: UUID } } as const

export const termoBusca = (texto?: string) =>
  texto ? `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null

export const LIMITE_MAXIMO = 100

export const queryPaginacao = {
  pagina: { type: 'integer', minimum: 1, default: 1 },
  limite: { type: 'integer', minimum: 1, maximum: LIMITE_MAXIMO, default: 20 },
} as const

export const queryOrdem = (colunas: Record<string, string>) => ({
  ordem: { type: 'string', enum: Object.keys(colunas) },
  direcao: { type: 'string', enum: ['asc', 'desc'] },
})

export function ordenacao(
  query: { ordem?: string; direcao?: string },
  colunas: Record<string, string>,
  padrao: string,
  desempate: string,
) {
  const coluna = query.ordem ? colunas[query.ordem] : undefined
  return coluna ? `${coluna} ${query.direcao === 'desc' ? 'desc' : 'asc'} nulls last, ${desempate}` : padrao
}

export function paginar(query: { pagina?: number; limite?: number }) {
  const pagina = query.pagina ?? 1
  const limite = Math.min(query.limite ?? 20, LIMITE_MAXIMO)
  return { pagina, limite, offset: (pagina - 1) * limite }
}

export function resposta<T extends { total?: string | number }>(linhas: T[], pagina: number, limite: number) {
  const total = Number(linhas[0]?.total ?? 0)
  const dados = linhas.map(({ total: _total, ...resto }) => resto)
  return { dados, total, pagina, limite, paginas: Math.ceil(total / limite) }
}

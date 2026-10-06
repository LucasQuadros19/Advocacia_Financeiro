import { router } from './router.ts'
import { usuario } from './sessao.ts'

async function pedir<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch(`/api${caminho}`, {
    method: metodo,
    headers: corpo === undefined ? {} : { 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })

  if (resposta.status === 401 && !caminho.startsWith('/auth/login')) {
    usuario.value = null
    router.push({ name: 'login', query: { de: router.currentRoute.value.fullPath } })
    throw new Error('Sessão expirada')
  }
  if (resposta.status === 204) return undefined as T
  const dados = await resposta.json().catch(() => ({}))
  if (!resposta.ok) throw new Error((dados as { erro?: string }).erro ?? 'Não foi possível concluir a operação')
  return dados as T
}

export const api = {
  get: <T>(caminho: string) => pedir<T>('GET', caminho),
  post: <T>(caminho: string, corpo?: unknown) => pedir<T>('POST', caminho, corpo ?? {}),
  put: <T>(caminho: string, corpo?: unknown) => pedir<T>('PUT', caminho, corpo ?? {}),
  patch: <T>(caminho: string, corpo?: unknown) => pedir<T>('PATCH', caminho, corpo ?? {}),
  delete: <T>(caminho: string) => pedir<T>('DELETE', caminho),
}

export type Pagina<T> = { dados: T[]; total: number; pagina: number; limite: number; paginas: number }

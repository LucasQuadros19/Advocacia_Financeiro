import { reactive } from 'vue'

export type Direcao = 'asc' | 'desc'
export type Ordem = { campo: string; direcao: Direcao }

export function useOrdenacao(aoMudar: () => void) {
  const ordem = reactive<Ordem>({ campo: '', direcao: 'asc' })

  function ordenar(campo: string, inicial: Direcao) {
    if (ordem.campo === campo) ordem.direcao = ordem.direcao === 'asc' ? 'desc' : 'asc'
    else Object.assign(ordem, { campo, direcao: inicial })
    aoMudar()
  }

  const query = () => (ordem.campo ? `&ordem=${ordem.campo}&direcao=${ordem.direcao}` : '')

  return { ordem, ordenar, query }
}

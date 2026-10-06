export type Participante = { advogado_id: string; nome: string; percentual: number; ajustado: boolean }

const centesimos = (valor: number) => Math.round((Number(valor) || 0) * 100)

export function redistribuir(lista: Participante[]): Participante[] {
  const automaticos = lista.filter((p) => !p.ajustado).length
  if (!automaticos) return lista
  const definido = lista.reduce((soma, p) => (p.ajustado ? soma + centesimos(p.percentual) : soma), 0)
  const restante = Math.max(10000 - definido, 0)
  const base = Math.floor(restante / automaticos)
  const sobra = restante - base * automaticos
  let indice = 0
  return lista.map((p) => {
    if (p.ajustado) return p
    const valor = base + (indice < sobra ? 1 : 0)
    indice += 1
    return { ...p, percentual: valor / 100 }
  })
}

export function garantirAutomatico(lista: Participante[]): Participante[] {
  if (!lista.length || lista.some((p) => !p.ajustado)) return lista
  return lista.map((p, i) => (i === lista.length - 1 ? { ...p, ajustado: false } : p))
}

export const totalDistribuido = (lista: Participante[]) =>
  lista.reduce((soma, p) => soma + centesimos(p.percentual), 0) / 100

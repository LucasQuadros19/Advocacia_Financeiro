export type Repasse = { advogado_id: string; percentual: number }

const centesimos = (valor: number) => Math.round((Number(valor) || 0) * 100)

export const restante = (linhas: Repasse[]) =>
  (10000 - linhas.reduce((soma, r) => soma + centesimos(r.percentual), 0)) / 100

export const parteDe = (valor: number, percentual: number) => Math.round(valor * (Number(percentual) || 0)) / 100

export const restanteEmDinheiro = (valor: number, linhas: Repasse[]) =>
  Math.round((valor - linhas.reduce((soma, r) => soma + parteDe(valor, r.percentual), 0)) * 100) / 100

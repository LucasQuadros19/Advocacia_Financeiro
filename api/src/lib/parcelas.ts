export function adicionarMeses(data: string, meses: number): string {
  const [ano, mes, dia] = data.split('-').map(Number) as [number, number, number]
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1))
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(dia, ultimoDia))
  return alvo.toISOString().slice(0, 10)
}

export function dividirCentavos(totalCentavos: number, quantidade: number): number[] {
  const base = Math.floor(totalCentavos / quantidade)
  const resto = totalCentavos - base * quantidade
  return Array.from({ length: quantidade }, (_, i) => base + (i < resto ? 1 : 0))
}

export type ParcelaGerada = { numero: number; valor: number; vencimento: string; entrada: boolean }

export type Parcelamento = {
  valor_total: number
  entrada?: number
  entrada_vencimento?: string
  quantidade_parcelas?: number
  primeiro_vencimento: string
}

export function gerarParcelas(valorTotal: number, quantidade: number, primeiroVencimento: string): ParcelaGerada[] {
  const centavos = Math.round(valorTotal * 100)
  if (!Number.isInteger(quantidade) || quantidade < 1) throw new Error('Quantidade de parcelas inválida')
  if (centavos < quantidade) throw new Error('Valor insuficiente para o número de parcelas')
  return dividirCentavos(centavos, quantidade).map((valor, i) => ({
    numero: i + 1,
    valor: valor / 100,
    vencimento: adicionarMeses(primeiroVencimento, i),
    entrada: false,
  }))
}

export function montarParcelas(c: Parcelamento): ParcelaGerada[] {
  const quantidade = c.quantidade_parcelas ?? 1
  const entradaCentavos = Math.round((c.entrada ?? 0) * 100)
  if (entradaCentavos < 0) throw new Error('A entrada não pode ser negativa')
  if (!entradaCentavos) return gerarParcelas(c.valor_total, quantidade, c.primeiro_vencimento)

  const restanteCentavos = Math.round(c.valor_total * 100) - entradaCentavos
  if (restanteCentavos < 1) throw new Error('A entrada precisa ser menor que o valor total')

  const entrada = {
    numero: 1,
    valor: entradaCentavos / 100,
    vencimento: c.entrada_vencimento ?? c.primeiro_vencimento,
    entrada: true,
  }
  const restantes = gerarParcelas(restanteCentavos / 100, quantidade, c.primeiro_vencimento)
  return [entrada, ...restantes.map((p) => ({ ...p, numero: p.numero + 1 }))]
}

const formatadorMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const moeda = (valor: string | number | null | undefined) => formatadorMoeda.format(Number(valor ?? 0))

export const paraNumero = (valor: string | number) => {
  const texto = String(valor).trim()
  if (!texto) return 0
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto
  const numero = Number(normalizado.replace(/[^\d.-]/g, ''))
  return Number.isFinite(numero) ? numero : 0
}

export const resumoCobranca = (valorTotal: string, entradaTexto: string, parcelas: number | string) => {
  const total = paraNumero(valorTotal)
  const entrada = paraNumero(entradaTexto)
  const quantidade = Math.max(1, Math.trunc(Number(parcelas) || 1))
  const restante = Math.round((total - entrada) * 100) / 100
  return {
    total,
    entrada,
    quantidade,
    restante,
    parcela: restante / quantidade,
    exato: Math.round(restante * 100) % quantidade === 0,
    pagamentos: quantidade + (entrada > 0 ? 1 : 0),
  }
}

export const data = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—'

export const percentual = (valor: string | number | null | undefined) =>
  `${Number(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

export const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter((parte) => parte.length > 2 || /^[A-ZÀ-Ý]/.test(parte))
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('')

export const hoje = () => new Date().toLocaleDateString('en-CA')

export const dataHora = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const quando = new Date(iso)
  if (Number.isNaN(quando.getTime())) return '—'
  const hora = quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dia = quando.toLocaleDateString('en-CA')
  if (dia === hoje()) return `hoje às ${hora}`
  if (dia === new Date(Date.now() - 86400000).toLocaleDateString('en-CA')) return `ontem às ${hora}`
  return `${data(dia)} às ${hora}`
}

export const prazo = (dias: number) =>
  dias < 0 ? `${Math.abs(dias)} dia(s) em atraso` : dias === 0 ? 'vence hoje' : `em ${dias} dia(s)`

export const rotuloParcela = (p: { entrada: boolean; numero: number; total_parcelas: number }) =>
  p.entrada ? 'Entrada' : `${p.numero}/${p.total_parcelas}`

export const rotuloSituacao: Record<string, string> = {
  pendente: 'Pendente',
  proxima: 'Próxima',
  vencida: 'Vencida',
  pago: 'Pago',
  parcial: 'Parcial',
  ativo: 'Ativo',
  encerrado: 'Encerrado',
  arquivado: 'Arquivado',
}

export const FORMAS_PAGAMENTO = [
  ['pix', 'PIX'],
  ['dinheiro', 'Dinheiro'],
  ['transferencia', 'Transferência'],
  ['boleto', 'Boleto'],
  ['cartao', 'Cartão'],
  ['cheque', 'Cheque'],
  ['outro', 'Outro'],
] as const

export const rotuloForma = (forma: string | null | undefined) =>
  forma ? (FORMAS_PAGAMENTO.find(([valor]) => valor === forma)?.[1] ?? forma) : null

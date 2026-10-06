export type Coluna<T> = { titulo: string; valor: (linha: T) => string | number | null | undefined; dinheiro?: boolean }

const formatarDinheiro = (valor: string | number) => Number(valor).toFixed(2).replace('.', ',')

function celula(valor: string | number | null | undefined, dinheiro?: boolean) {
  if (valor === null || valor === undefined || valor === '') return ''
  if (dinheiro) return formatarDinheiro(valor)
  let texto = String(valor)
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

export function paraCsv<T>(colunas: Coluna<T>[], linhas: T[]) {
  const cabecalho = colunas.map((c) => celula(c.titulo)).join(';')
  const corpo = linhas.map((linha) => colunas.map((c) => celula(c.valor(linha), c.dinheiro)).join(';'))
  return `﻿${[cabecalho, ...corpo].join('\r\n')}\r\n`
}

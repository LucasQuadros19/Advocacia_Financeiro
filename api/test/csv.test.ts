import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { paraCsv } from '../src/lib/csv.ts'
import { valorBuscado } from '../src/modules/busca.ts'

describe('paraCsv', () => {
  const colunas = [
    { titulo: 'Nome', valor: (l: { nome: string; valor: number }) => l.nome },
    { titulo: 'Valor', valor: (l: { nome: string; valor: number }) => l.valor, dinheiro: true },
  ]

  it('usa ponto e vírgula, vírgula decimal e BOM para o Excel', () => {
    assert.equal(paraCsv(colunas, [{ nome: 'Ana', valor: 1500.5 }]), '﻿Nome;Valor\r\nAna;1500,50\r\n')
  })

  it('protege aspas, quebras de linha e fórmulas', () => {
    const csv = paraCsv(colunas, [
      { nome: 'Diz "oi"; tchau', valor: -10 },
      { nome: '=SOMA(A1)', valor: 0 },
      { nome: '-2+3', valor: 1 },
    ])
    const linhas = csv.slice(1).split('\r\n')
    assert.equal(linhas[1], '"Diz ""oi""; tchau";-10,00')
    assert.equal(linhas[2], "'=SOMA(A1);0,00")
    assert.equal(linhas[3], "'-2+3;1,00")
  })
})

describe('valorBuscado', () => {
  it('entende valor em reais escrito de vários jeitos', () => {
    assert.equal(valorBuscado('1.500,00'), 1500)
    assert.equal(valorBuscado('R$ 250,5'), 250.5)
    assert.equal(valorBuscado('1500.75'), 1500.75)
    assert.equal(valorBuscado('1.500'), 1500)
    assert.equal(valorBuscado('300'), 300)
  })

  it('ignora texto e números que não são dinheiro', () => {
    assert.equal(valorBuscado('João'), null)
    assert.equal(valorBuscado('123.456.789-00'), null)
    assert.equal(valorBuscado('0'), null)
    assert.equal(valorBuscado('12,345'), null)
  })
})

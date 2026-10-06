import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dataHora, paraNumero, porExtenso, resumoCobranca } from '../src/format.ts'

describe('paraNumero', () => {
  it('aceita os formatos que o usuário digita', () => {
    assert.equal(paraNumero('1500'), 1500)
    assert.equal(paraNumero('1500,50'), 1500.5)
    assert.equal(paraNumero('1.500,50'), 1500.5)
    assert.equal(paraNumero('1500.50'), 1500.5)
    assert.equal(paraNumero('R$ 1.234,56'), 1234.56)
  })

  it('devolve zero para texto vazio ou inválido', () => {
    assert.equal(paraNumero(''), 0)
    assert.equal(paraNumero('   '), 0)
    assert.equal(paraNumero('abc'), 0)
  })
})

describe('dataHora', () => {
  it('usa hoje e ontem quando cabe', () => {
    const agora = new Date()
    agora.setHours(14, 32, 0, 0)
    assert.match(dataHora(agora.toISOString()), /^hoje às \d{2}:\d{2}$/)

    const ontem = new Date(Date.now() - 86400000)
    ontem.setHours(9, 5, 0, 0)
    assert.match(dataHora(ontem.toISOString()), /^ontem às \d{2}:\d{2}$/)
  })

  it('cai para a data cheia e tolera valor ausente', () => {
    assert.match(dataHora('2020-03-08T12:00:00.000Z'), /^08\/03\/2020 às \d{2}:\d{2}$/)
    assert.equal(dataHora(null), '—')
    assert.equal(dataHora('nada'), '—')
  })
})

describe('resumoCobranca', () => {
  it('divide o total quando não há entrada', () => {
    const r = resumoCobranca('1200', '', 3)
    assert.equal(r.total, 1200)
    assert.equal(r.entrada, 0)
    assert.equal(r.restante, 1200)
    assert.equal(r.parcela, 400)
    assert.equal(r.exato, true)
    assert.equal(r.pagamentos, 3)
  })

  it('desconta a entrada antes de parcelar e conta o pagamento extra', () => {
    const r = resumoCobranca('1.500,00', '300,00', 4)
    assert.equal(r.entrada, 300)
    assert.equal(r.restante, 1200)
    assert.equal(r.parcela, 300)
    assert.equal(r.pagamentos, 5)
  })

  it('marca como inexato quando a divisão deixa centavos', () => {
    const r = resumoCobranca('100', '', 3)
    assert.equal(r.exato, false)
  })

  it('nunca parcela em menos de uma vez', () => {
    assert.equal(resumoCobranca('900', '', 0).quantidade, 1)
    assert.equal(resumoCobranca('900', '', -5).quantidade, 1)
  })
})

describe('porExtenso', () => {
  const casos: [number, string][] = [
    [0, 'zero reais'],
    [1, 'um real'],
    [0.01, 'um centavo'],
    [0.5, 'cinquenta centavos'],
    [100, 'cem reais'],
    [101, 'cento e um reais'],
    [21.21, 'vinte e um reais e vinte e um centavos'],
    [1500.5, 'mil e quinhentos reais e cinquenta centavos'],
    [1100, 'mil e cem reais'],
    [1234.56, 'mil duzentos e trinta e quatro reais e cinquenta e seis centavos'],
    [2050, 'dois mil e cinquenta reais'],
    [2_000_000, 'dois milhões de reais'],
    [1_200_000, 'um milhão e duzentos mil reais'],
    [1_000_001, 'um milhão e um reais'],
    [
      99_999_999.99,
      'noventa e nove milhões novecentos e noventa e nove mil novecentos e noventa e nove reais e noventa e nove centavos',
    ],
  ]
  for (const [valor, esperado] of casos) {
    it(`${valor} → ${esperado}`, () => assert.equal(porExtenso(valor), esperado))
  }

  it('aceita o texto numérico que vem da API', () => {
    assert.equal(porExtenso('300.00'), 'trezentos reais')
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dataHora, paraNumero, resumoCobranca } from '../src/format.ts'

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

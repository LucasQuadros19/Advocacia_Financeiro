import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { adicionarMeses, dividirCentavos, gerarParcelas, montarParcelas } from '../src/lib/parcelas.ts'

describe('dividirCentavos', () => {
  it('divide sem perder centavos', () => {
    const partes = dividirCentavos(10000, 3)
    assert.deepEqual(partes, [3334, 3333, 3333])
    assert.equal(partes.reduce((a, b) => a + b, 0), 10000)
  })

  it('mantém a soma para qualquer quantidade', () => {
    for (let n = 1; n <= 24; n++) {
      assert.equal(dividirCentavos(123457, n).reduce((a, b) => a + b, 0), 123457)
    }
  })
})

describe('adicionarMeses', () => {
  it('avança meses simples', () => {
    assert.equal(adicionarMeses('2026-01-10', 1), '2026-02-10')
    assert.equal(adicionarMeses('2026-01-10', 12), '2027-01-10')
  })

  it('ajusta para o último dia do mês', () => {
    assert.equal(adicionarMeses('2026-01-31', 1), '2026-02-28')
    assert.equal(adicionarMeses('2024-01-31', 1), '2024-02-29')
    assert.equal(adicionarMeses('2026-08-31', 1), '2026-09-30')
  })
})

describe('gerarParcelas', () => {
  it('gera parcelas mensais somando o total', () => {
    const parcelas = gerarParcelas(1000, 3, '2026-03-15')
    assert.deepEqual(
      parcelas.map((p) => p.vencimento),
      ['2026-03-15', '2026-04-15', '2026-05-15'],
    )
    assert.equal(parcelas.reduce((soma, p) => soma + Math.round(p.valor * 100), 0), 100000)
    assert.deepEqual(parcelas.map((p) => p.valor), [333.34, 333.33, 333.33])
  })

  it('à vista gera uma única parcela', () => {
    assert.deepEqual(gerarParcelas(800, 1, '2026-09-16'), [
      { numero: 1, valor: 800, vencimento: '2026-09-16', entrada: false },
    ])
  })

  it('recusa parcelamento impossível', () => {
    assert.throws(() => gerarParcelas(0.02, 3, '2026-01-01'), /Valor insuficiente/)
  })
})

describe('montarParcelas', () => {
  it('sem entrada gera apenas o parcelamento', () => {
    const parcelas = montarParcelas({ valor_total: 900, quantidade_parcelas: 3, primeiro_vencimento: '2026-03-10' })
    assert.equal(parcelas.length, 3)
    assert.ok(parcelas.every((p) => !p.entrada))
  })

  it('entrada vira a primeira parcela e o restante é parcelado', () => {
    const parcelas = montarParcelas({
      valor_total: 4000,
      entrada: 1000,
      entrada_vencimento: '2026-03-01',
      quantidade_parcelas: 3,
      primeiro_vencimento: '2026-04-01',
    })
    assert.deepEqual(
      parcelas.map((p) => [p.numero, p.valor, p.vencimento, p.entrada]),
      [
        [1, 1000, '2026-03-01', true],
        [2, 1000, '2026-04-01', false],
        [3, 1000, '2026-05-01', false],
        [4, 1000, '2026-06-01', false],
      ],
    )
  })

  it('não perde centavos com entrada quebrada', () => {
    const parcelas = montarParcelas({
      valor_total: 1000,
      entrada: 333.33,
      quantidade_parcelas: 3,
      primeiro_vencimento: '2026-04-01',
    })
    assert.equal(parcelas.reduce((soma, p) => soma + Math.round(p.valor * 100), 0), 100000)
  })

  it('recusa entrada maior ou igual ao total', () => {
    const cobranca = { valor_total: 500, quantidade_parcelas: 2, primeiro_vencimento: '2026-04-01' }
    assert.throws(() => montarParcelas({ ...cobranca, entrada: 500 }), /menor que o valor total/)
    assert.throws(() => montarParcelas({ ...cobranca, entrada: 600 }), /menor que o valor total/)
  })
})

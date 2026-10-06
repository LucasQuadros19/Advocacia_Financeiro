import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parteDe, restante, restanteEmDinheiro } from '../src/distribuicao.ts'

const r = (percentual: number) => ({ advogado_id: String(percentual), percentual })

describe('restante do principal', () => {
  it('sem divisão fica com 100%', () => {
    assert.equal(restante([]), 100)
  })

  it('é 100% menos os outros', () => {
    assert.equal(restante([r(30), r(25.5)]), 44.5)
  })

  it('fica negativo quando passa de 100%', () => {
    assert.equal(restante([r(80), r(40)]), -20)
  })

  it('não perde centésimos com decimais', () => {
    assert.equal(restante([r(33.33), r(33.33)]), 33.34)
  })
})

describe('partes em dinheiro', () => {
  it('arredonda cada parte para centavos', () => {
    assert.equal(parteDe(100, 33.33), 33.33)
    assert.equal(parteDe(10, 33.335), 3.33)
  })

  it('o principal fica com o que sobra, sem sumir centavo', () => {
    const linhas = [r(33.33), r(33.33)]
    const outros = linhas.reduce((s, l) => s + parteDe(1000.01, l.percentual), 0)
    assert.equal(Math.round((outros + restanteEmDinheiro(1000.01, linhas)) * 100), 100001)
  })
})

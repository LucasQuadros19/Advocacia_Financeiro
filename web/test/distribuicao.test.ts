import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { garantirAutomatico, redistribuir, totalDistribuido } from '../src/distribuicao.ts'
import type { Participante } from '../src/tipos.ts'

const advogado = (nome: string, percentual: number, ajustado: boolean): Participante => ({
  advogado_id: nome,
  nome,
  percentual,
  ajustado,
})

const percentuais = (lista: Participante[]) => lista.map((p) => p.percentual)

describe('redistribuir', () => {
  it('advogado único fica com 100%', () => {
    assert.deepEqual(percentuais(redistribuir([advogado('Lucas', 0, false)])), [100])
  })

  it('divide igualmente entre os automáticos', () => {
    const lista = [advogado('Lucas', 0, false), advogado('Ana', 0, false)]
    assert.deepEqual(percentuais(redistribuir(lista)), [50, 50])
  })

  it('o outro recebe o restante quando um é definido', () => {
    const lista = [advogado('Lucas', 33, true), advogado('Ana', 0, false)]
    assert.deepEqual(percentuais(redistribuir(lista)), [33, 67])
  })

  it('preserva os percentuais definidos manualmente', () => {
    const lista = [advogado('Lucas', 60, true), advogado('Ana', 25, true), advogado('Bruno', 0, false)]
    assert.deepEqual(percentuais(redistribuir(lista)), [60, 25, 15])
  })

  it('distribui centésimos sem perder soma', () => {
    const lista = [advogado('A', 0, false), advogado('B', 0, false), advogado('C', 0, false)]
    const resultado = redistribuir(lista)
    assert.deepEqual(percentuais(resultado), [33.34, 33.33, 33.33])
    assert.equal(totalDistribuido(resultado), 100)
  })

  it('zera o automático quando os definidos passam de 100%', () => {
    const lista = [advogado('Lucas', 80, true), advogado('Ana', 40, true), advogado('Bruno', 0, false)]
    assert.deepEqual(percentuais(redistribuir(lista)), [80, 40, 0])
    assert.equal(totalDistribuido(redistribuir(lista)), 120)
  })

  it('não altera nada quando todos são manuais', () => {
    const lista = [advogado('Lucas', 33, true), advogado('Ana', 20, true)]
    assert.deepEqual(percentuais(redistribuir(lista)), [33, 20])
  })
})

describe('garantirAutomatico', () => {
  it('torna o último automático quando todos são manuais', () => {
    const lista = garantirAutomatico([advogado('Lucas', 60, true), advogado('Ana', 40, true)])
    assert.deepEqual(lista.map((p) => p.ajustado), [true, false])
  })

  it('mantém a lista quando já existe um automático', () => {
    const original = [advogado('Lucas', 60, true), advogado('Ana', 40, false)]
    assert.equal(garantirAutomatico(original), original)
  })
})

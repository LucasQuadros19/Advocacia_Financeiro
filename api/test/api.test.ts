import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { FastifyInstance } from 'fastify'
import { pool } from '../src/db.ts'
import { gerarHash } from '../src/lib/senha.ts'
import { migrar } from '../src/migrate.ts'
import { criarApp } from '../src/server.ts'

let app: FastifyInstance
let cookie = ''

const emDias = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10)

async function chamar(method: string, url: string, payload?: unknown) {
  return app.inject({ method: method as 'GET', url, payload: payload as object, headers: cookie ? { cookie } : {} })
}

async function recebimentosDe(parcelaId: string) {
  const { dados } = (await chamar('GET', '/api/caixa/lancamentos?origem=recebimento&limite=100')).json()
  return dados.filter((l: { pai_id: string }) => l.pai_id === parcelaId) as { id: string; valor: string }[]
}

before(async () => {
  await migrar()
  await pool.query(
    'truncate parcelas, contas, caso_advogados, casos, clientes, advogados, despesas, lancamentos, transferencias, carteiras, auditoria, usuarios restart identity cascade',
  )
  await pool.query(`insert into usuarios (nome, login, senha_hash) values ('Usuária de Teste', 'teste', $1)`, [
    await gerarHash(process.env.SENHA_TESTE!),
  ])
  app = await criarApp()
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: 'teste', senha: process.env.SENHA_TESTE },
  })
  assert.equal(login.statusCode, 200)
  cookie = String(login.headers['set-cookie']).split(';')[0]!
})

after(async () => {
  await app.close()
  await pool.end()
})

describe('autenticação', () => {
  it('bloqueia acesso sem sessão', async () => {
    const semCookie = await app.inject({ method: 'GET', url: '/api/clientes' })
    assert.equal(semCookie.statusCode, 401)
  })

  it('recusa senha inválida', async () => {
    const erro = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'teste', senha: 'errada' } })
    assert.equal(erro.statusCode, 401)
    const inexistente = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'ninguem', senha: 'errada' },
    })
    assert.equal(inexistente.json().erro, erro.json().erro, 'não revela se o usuário existe')
  })
})

describe('fluxo financeiro', () => {
  let clienteId = ''
  let casoId = ''
  let lucasId = ''
  let anaId = ''
  let parcelas: { id: string; numero: number; valor: string; situacao: string }[] = []

  it('cadastra cliente', async () => {
    const criado = await chamar('POST', '/api/clientes', { nome: 'João da Silva', documento: '123.456.789-00' })
    assert.equal(criado.statusCode, 201)
    clienteId = criado.json().id

    const lista = await chamar('GET', '/api/clientes?limite=10')
    assert.equal(lista.json().total, 1)
  })

  it('recusa cliente sem nome', async () => {
    const erro = await chamar('POST', '/api/clientes', { documento: '000' })
    assert.equal(erro.statusCode, 400)
  })

  it('cadastra advogados e define o principal', async () => {
    const lucas = await chamar('POST', '/api/advogados', { nome: 'Lucas', oab: 'OAB/SP 1', principal: true })
    const ana = await chamar('POST', '/api/advogados', { nome: 'Ana', oab: 'OAB/SP 2' })
    lucasId = lucas.json().id
    anaId = ana.json().id
    assert.equal(lucas.json().principal, true)
  })

  it('cria caso com distribuição entre advogados', async () => {
    const caso = await chamar('POST', '/api/casos', {
      cliente_id: clienteId,
      titulo: 'Ação Trabalhista',
      valor: 30000,
      advogados: [
        { advogado_id: lucasId, percentual: 60 },
        { advogado_id: anaId, percentual: 40 },
      ],
    })
    assert.equal(caso.statusCode, 201)
    casoId = caso.json().id

    const detalhe = await chamar('GET', `/api/casos/${casoId}`)
    assert.equal(Number(detalhe.json().percentual_principal), 60)
    assert.equal(detalhe.json().advogados.length, 2)
  })

  it('recusa distribuição acima de 100%', async () => {
    const erro = await chamar('PUT', `/api/casos/${casoId}/advogados`, {
      advogados: [
        { advogado_id: lucasId, percentual: 60 },
        { advogado_id: anaId, percentual: 50 },
      ],
    })
    assert.equal(erro.statusCode, 400)
    const detalhe = await chamar('GET', `/api/casos/${casoId}`)
    assert.equal(detalhe.json().advogados.length, 2)
  })

  it('cria conta parcelada com parcelas geradas', async () => {
    const conta = await chamar('POST', '/api/contas', {
      cliente_id: clienteId,
      caso_id: casoId,
      descricao: 'Honorários',
      valor_total: 900,
      quantidade_parcelas: 3,
      primeiro_vencimento: emDias(-40),
      forma_pagamento: 'pix',
    })
    assert.equal(conta.statusCode, 201)

    const detalhe = await chamar('GET', `/api/contas/${conta.json().id}`)
    parcelas = detalhe.json().parcelas
    assert.equal(parcelas.length, 3)
    assert.equal(parcelas.reduce((soma, p) => soma + Number(p.valor), 0), 900)
    assert.equal(parcelas[0]!.situacao, 'vencida')
  })

  it('recusa conta com caso de outro cliente', async () => {
    const outro = await chamar('POST', '/api/clientes', { nome: 'Maria' })
    const erro = await chamar('POST', '/api/contas', {
      cliente_id: outro.json().id,
      caso_id: casoId,
      descricao: 'Teste',
      valor_total: 100,
      primeiro_vencimento: emDias(1),
    })
    assert.equal(erro.statusCode, 400)
  })

  it('registra pagamento de parcela com o repasse da divisão', async () => {
    const pago = await chamar('POST', `/api/parcelas/${parcelas[0]!.id}/pagamento`, {
      data_pagamento: emDias(-5),
      repasses: [{ advogado_id: anaId, percentual: 40 }],
    })
    assert.equal(pago.statusCode, 200)
    assert.equal(pago.json().situacao, 'pago')

    const repetido = await chamar('POST', `/api/parcelas/${parcelas[0]!.id}/pagamento`, { data_pagamento: emDias(-5) })
    assert.equal(repetido.statusCode, 409)
  })

  it('minha parte recebida é o que entrou menos os repasses', async () => {
    const caixa = await chamar('GET', '/api/caixa')
    const totais = caixa.json().totais
    assert.equal(Number(totais.escritorio_recebido), 300)
    assert.equal(Number(totais.repassado), 120)
    assert.equal(Number(totais.recebido), 180)
    assert.equal(Number(totais.a_receber), 360)
    assert.equal(caixa.json().advogado.nome, 'Lucas')
  })

  it('consolida o dashboard com dados reais', async () => {
    const dash = (await chamar('GET', '/api/dashboard')).json()
    assert.equal(Number(dash.financeiro.recebido), 300)
    assert.equal(Number(dash.financeiro.a_receber), 600)
    assert.equal(Number(dash.financeiro.vencido), 300)
    assert.equal(Number(dash.contagens.clientes), 2)
    assert.equal(Number(dash.advogado.recebido), 180)
    assert.ok(dash.proximos.length >= 1)
    assert.equal(dash.meses.length, 6)
    assert.equal(
      dash.meses.reduce((soma: number, m: { recebido: string; previsto: string }) => soma + Number(m.recebido) + Number(m.previsto), 0),
      900,
    )
  })

  it('lista o que está vencido no caixa', async () => {
    const vencidas = (await chamar('GET', '/api/caixa/lancamentos?origem=parcela&situacao=vencida')).json()
    assert.equal(vencidas.total, 1)
    assert.equal(vencidas.dados[0].contraparte, 'João da Silva')
  })

  it('protege o histórico financeiro na exclusão', async () => {
    const erro = await chamar('DELETE', `/api/clientes/${clienteId}`)
    assert.equal(erro.statusCode, 409)
  })

  it('estorna pagamento e leva junto o repasse', async () => {
    const [recebimento] = await recebimentosDe(parcelas[0]!.id)
    const estorno = await chamar('DELETE', `/api/recebimentos/${recebimento!.id}`)
    assert.equal(estorno.statusCode, 200)
    assert.equal(estorno.json().situacao, 'vencida')
    assert.equal(Number((await chamar('GET', '/api/caixa')).json().totais.repassado), 0)
  })
})

describe('validação de entrada', () => {
  let parcelaId = ''

  before(async () => {
    const cliente = await chamar('POST', '/api/clientes', { nome: 'Cliente Validação' })
    const conta = await chamar('POST', '/api/contas', {
      cliente_id: cliente.json().id,
      descricao: 'Consulta',
      valor_total: 100,
      primeiro_vencimento: emDias(1),
    })
    parcelaId = (await chamar('GET', `/api/contas/${conta.json().id}`)).json().parcelas[0].id
  })

  it('recusa data de calendário inexistente sem quebrar', async () => {
    const conta = await chamar('POST', '/api/contas', {
      cliente_id: '00000000-0000-0000-0000-000000000001',
      descricao: 'x',
      valor_total: 10,
      primeiro_vencimento: '2026-02-30',
    })
    assert.equal(conta.statusCode, 400)

    const parcela = await chamar('PATCH', `/api/parcelas/${parcelaId}`, { vencimento: '2026-13-45' })
    assert.equal(parcela.statusCode, 400)
  })

  it('recusa pagamento com data futura', async () => {
    const futuro = await chamar('POST', `/api/parcelas/${parcelaId}/pagamento`, { data_pagamento: emDias(1) })
    assert.equal(futuro.statusCode, 400)

    const hoje = await chamar('POST', `/api/parcelas/${parcelaId}/pagamento`, { data_pagamento: emDias(0) })
    assert.equal(hoje.statusCode, 200)
  })

  it('trata % e _ da busca como texto literal', async () => {
    const tudo = await chamar('GET', '/api/clientes?limite=100')
    assert.ok(tudo.json().total > 1)

    const curinga = await chamar('GET', '/api/clientes?busca=%25')
    assert.equal(curinga.json().total, 0)
  })
})

describe('caso com cobrança e entrada', () => {
  let clienteId = ''

  before(async () => {
    clienteId = (await chamar('POST', '/api/clientes', { nome: 'Cliente Entrada' })).json().id
  })

  it('cria caso, conta e parcelas em uma única chamada', async () => {
    const criado = await chamar('POST', '/api/casos', {
      cliente_id: clienteId,
      titulo: 'Ação com entrada',
      valor: 4000,
      conta: {
        descricao: 'Honorários',
        valor_total: 4000,
        entrada: 1000,
        entrada_vencimento: emDias(0),
        entrada_paga: true,
        quantidade_parcelas: 3,
        primeiro_vencimento: emDias(30),
        forma_pagamento: 'pix',
      },
    })
    assert.equal(criado.statusCode, 201)

    const caso = (await chamar('GET', `/api/casos/${criado.json().id}`)).json()
    assert.equal(caso.contas.length, 1)
    assert.equal(Number(caso.recebido), 1000)
    assert.equal(Number(caso.pendente), 3000)

    const conta = (await chamar('GET', `/api/contas/${caso.contas[0].id}`)).json()
    assert.equal(conta.parcelas.length, 4)
    assert.deepEqual(
      conta.parcelas.map((p: { entrada: boolean; status: string; valor: string }) => [p.entrada, p.status, p.valor]),
      [
        [true, 'pago', '1000.00'],
        [false, 'pendente', '1000.00'],
        [false, 'pendente', '1000.00'],
        [false, 'pendente', '1000.00'],
      ],
    )
    assert.equal(conta.parcelas[0].forma_pagamento, 'pix')
  })

  it('recusa entrada já paga com data futura', async () => {
    const erro = await chamar('POST', '/api/contas', {
      cliente_id: clienteId,
      descricao: 'Adiantada',
      valor_total: 500,
      entrada: 100,
      entrada_vencimento: emDias(5),
      entrada_paga: true,
      quantidade_parcelas: 2,
      primeiro_vencimento: emDias(35),
    })
    assert.equal(erro.statusCode, 400)
    assert.match(erro.json().erro, /entrada não pode ser futura/)
  })

  it('não deixa caso órfão quando a cobrança é inválida', async () => {
    const antes = (await chamar('GET', '/api/casos?limite=100')).json().total
    const erro = await chamar('POST', '/api/casos', {
      cliente_id: clienteId,
      titulo: 'Caso inválido',
      conta: { descricao: 'x', valor_total: 100, entrada: 100, quantidade_parcelas: 2, primeiro_vencimento: emDias(10) },
    })
    assert.equal(erro.statusCode, 400)
    assert.equal((await chamar('GET', '/api/casos?limite=100')).json().total, antes)
  })
})

describe('notas', () => {
  let clienteId = ''
  let casoId = ''
  let notaId = ''

  before(async () => {
    clienteId = (await chamar('POST', '/api/clientes', { nome: 'Cliente Notas' })).json().id
    casoId = (await chamar('POST', '/api/casos', { cliente_id: clienteId, titulo: 'Caso Notas' })).json().id
  })

  it('registra e lista notas do cliente e do caso separadamente', async () => {
    const doCliente = await chamar('POST', '/api/notas', {
      cliente_id: clienteId,
      texto: '  Cliente pediu para ligar na sexta.  ',
    })
    assert.equal(doCliente.statusCode, 201)
    assert.equal(doCliente.json().autor, 'Usuária de Teste', 'o autor é quem está logado')
    assert.equal(doCliente.json().texto, 'Cliente pediu para ligar na sexta.')
    notaId = doCliente.json().id

    await chamar('POST', '/api/notas', { caso_id: casoId, texto: 'Audiência remarcada.' })

    const notasCliente = (await chamar('GET', `/api/notas?cliente_id=${clienteId}`)).json()
    assert.equal(notasCliente.total, 1)
    assert.equal(notasCliente.dados[0].texto, 'Cliente pediu para ligar na sexta.')

    const notasCaso = (await chamar('GET', `/api/notas?caso_id=${casoId}`)).json()
    assert.equal(notasCaso.total, 1)
    assert.equal(notasCaso.dados[0].texto, 'Audiência remarcada.')
  })

  it('junta as notas do caso e do cliente quando pedido', async () => {
    const juntas = (await chamar('GET', `/api/notas?caso_id=${casoId}&com_cliente=true`)).json()
    assert.equal(juntas.total, 2)
    assert.ok(juntas.dados.some((n: { cliente_id: string }) => n.cliente_id === clienteId))
    assert.ok(juntas.dados.some((n: { caso_id: string }) => n.caso_id === casoId))
  })

  it('recusa nota sem alvo, com dois alvos ou vazia', async () => {
    const semAlvo = await chamar('POST', '/api/notas', { texto: 'oi' })
    assert.equal(semAlvo.statusCode, 400)

    const doisAlvos = await chamar('POST', '/api/notas', {
      cliente_id: clienteId,
      caso_id: casoId,
      texto: 'oi',
    })
    assert.equal(doisAlvos.statusCode, 400)

    const vazia = await chamar('POST', '/api/notas', { cliente_id: clienteId, texto: '   ' })
    assert.equal(vazia.statusCode, 400)

    const listaSemFiltro = await chamar('GET', '/api/notas')
    assert.equal(listaSemFiltro.statusCode, 400)
  })

  it('exclui nota', async () => {
    assert.equal((await chamar('DELETE', `/api/notas/${notaId}`)).statusCode, 204)
    assert.equal((await chamar('GET', `/api/notas?cliente_id=${clienteId}`)).json().total, 0)
    assert.equal((await chamar('DELETE', `/api/notas/${notaId}`)).statusCode, 404)
  })

  it('remove as notas junto com o caso', async () => {
    await chamar('POST', '/api/notas', { caso_id: casoId, texto: 'some junto' })
    assert.equal((await chamar('DELETE', `/api/casos/${casoId}`)).statusCode, 204)
    assert.equal((await chamar('GET', `/api/notas?caso_id=${casoId}`)).json().total, 0)
  })
})

describe('despesas programadas', () => {
  const mesDe = (data: string) => data.slice(0, 7)
  let despesaId = ''

  it('recusa dia de vencimento fora do mês', async () => {
    const erro = await chamar('POST', '/api/despesas', {
      descricao: 'Inválida',
      valor: 100,
      dia_vencimento: 32,
      inicio: emDias(0),
    })
    assert.equal(erro.statusCode, 400)
  })

  it('recusa data final anterior ao início', async () => {
    const erro = await chamar('POST', '/api/despesas', {
      descricao: 'Inválida',
      valor: 100,
      dia_vencimento: 10,
      inicio: emDias(0),
      fim: emDias(-30),
    })
    assert.equal(erro.statusCode, 400)
  })

  it('cria a regra e gera um lançamento por mês desde o início', async () => {
    const criada = await chamar('POST', '/api/despesas', {
      descricao: 'Aluguel da sala',
      categoria: 'Estrutura',
      valor: 2000,
      dia_vencimento: 10,
      inicio: emDias(-70),
    })
    assert.equal(criada.statusCode, 201)
    despesaId = criada.json().id

    const lista = await chamar('GET', `/api/despesas/lancamentos?despesa_id=${despesaId}&limite=50`)
    assert.equal(lista.statusCode, 200)
    const { dados } = lista.json()
    assert.ok(dados.length >= 3, `esperava pelo menos 3 meses, veio ${dados.length}`)
    assert.ok(dados.every((l: { valor: string }) => Number(l.valor) === 2000))
    const competencias = dados.map((l: { competencia: string }) => mesDe(l.competencia))
    assert.equal(new Set(competencias).size, competencias.length, 'competências duplicadas')
  })

  it('não duplica lançamentos quando a listagem é chamada de novo', async () => {
    const antes = (await chamar('GET', `/api/despesas/lancamentos?despesa_id=${despesaId}&limite=50`)).json().total
    await chamar('GET', '/api/despesas')
    await chamar('GET', `/api/despesas/lancamentos?despesa_id=${despesaId}&limite=50`)
    const depois = (await chamar('GET', `/api/despesas/lancamentos?despesa_id=${despesaId}&limite=50`)).json().total
    assert.equal(depois, antes)
  })

  it('encaixa o vencimento no último dia quando o mês é curto', async () => {
    const criada = await chamar('POST', '/api/despesas', {
      descricao: 'Contador',
      valor: 500,
      dia_vencimento: 31,
      inicio: '2026-01-01',
      fim: '2026-04-30',
    })
    assert.equal(criada.statusCode, 201)
    const id = criada.json().id
    const { dados } = (await chamar('GET', `/api/despesas/lancamentos?despesa_id=${id}&limite=50`)).json()
    const porMes = Object.fromEntries(
      dados.map((l: { competencia: string; vencimento: string }) => [mesDe(l.competencia), l.vencimento]),
    )
    assert.equal(porMes['2026-01'], '2026-01-31')
    assert.equal(porMes['2026-02'], '2026-02-28')
    assert.equal(porMes['2026-04'], '2026-04-30')
    assert.equal(dados.length, 4, 'não deve passar da data final')
  })

  it('registra e estorna o pagamento de um lançamento', async () => {
    const { dados } = (await chamar('GET', `/api/despesas/lancamentos?despesa_id=${despesaId}&situacao=vencida`)).json()
    const alvo = dados[0]
    assert.ok(alvo, 'esperava um lançamento vencido')

    const futuro = await chamar('POST', `/api/despesas/lancamentos/${alvo.id}/pagamento`, {
      data_pagamento: emDias(3),
    })
    assert.equal(futuro.statusCode, 400)

    const pago = await chamar('POST', `/api/despesas/lancamentos/${alvo.id}/pagamento`, {
      data_pagamento: emDias(0),
      forma_pagamento: 'pix',
    })
    assert.equal(pago.statusCode, 200)
    assert.equal(pago.json().status, 'pago')

    const repetido = await chamar('POST', `/api/despesas/lancamentos/${alvo.id}/pagamento`, {
      data_pagamento: emDias(0),
    })
    assert.equal(repetido.statusCode, 409)

    const travado = await chamar('PATCH', `/api/despesas/lancamentos/${alvo.id}`, { valor: 10 })
    assert.equal(travado.statusCode, 409)

    const estorno = await chamar('DELETE', `/api/despesas/lancamentos/${alvo.id}/pagamento`)
    assert.equal(estorno.statusCode, 200)
    assert.equal(estorno.json().status, 'pendente')
  })

  it('ajusta o valor de um mês sem mexer na regra', async () => {
    const { dados } = (await chamar('GET', `/api/despesas/lancamentos?despesa_id=${despesaId}&limite=50`)).json()
    const alvo = dados.find((l: { status: string }) => l.status === 'pendente')
    const ajustado = await chamar('PATCH', `/api/despesas/lancamentos/${alvo.id}`, { valor: 2150.5 })
    assert.equal(ajustado.statusCode, 200)
    assert.equal(Number(ajustado.json().valor), 2150.5)

    const regra = (await chamar('GET', '/api/despesas')).json().dados.find((d: { id: string }) => d.id === despesaId)
    assert.equal(Number(regra.valor), 2000)
  })

  it('reajuste da regra alcança os pendentes e preserva os pagos', async () => {
    const { dados } = (await chamar('GET', `/api/despesas/lancamentos?despesa_id=${despesaId}&limite=50`)).json()
    const pagar = dados.find((l: { status: string }) => l.status === 'pendente')
    const valorAoPagar = Number(pagar.valor)
    await chamar('POST', `/api/despesas/lancamentos/${pagar.id}/pagamento`, { data_pagamento: emDias(0) })

    const reajuste = await chamar('PUT', `/api/despesas/${despesaId}`, {
      descricao: 'Aluguel da sala',
      categoria: 'Estrutura',
      valor: 2300,
      dia_vencimento: 10,
      inicio: emDias(-70),
    })
    assert.equal(reajuste.statusCode, 200)

    const depois = (await chamar('GET', `/api/despesas/lancamentos?despesa_id=${despesaId}&limite=50`)).json().dados
    const reajustado = depois.find((l: { id: string }) => l.id === pagar.id)
    assert.equal(Number(reajustado.valor), valorAoPagar, 'lançamento pago é histórico e não acompanha o reajuste')
    for (const l of depois) {
      if (l.status === 'pendente') assert.equal(Number(l.valor), 2300)
    }
  })

  it('não gera lançamento que venceria antes do início', async () => {
    const inicio = `${mesDe(emDias(-40))}-20`
    const criada = await chamar('POST', '/api/despesas', { descricao: 'Software', valor: 90, dia_vencimento: 5, inicio })
    const { dados } = (await chamar('GET', `/api/despesas/lancamentos?despesa_id=${criada.json().id}&limite=50`)).json()
    assert.ok(dados.length > 0)
    assert.ok(dados.every((l: { vencimento: string }) => l.vencimento >= inicio))
  })

  it('desativar remove os meses futuros em aberto e mantém os vencidos', async () => {
    const corpo = { descricao: 'Internet', valor: 150, dia_vencimento: 10, inicio: emDias(-70) }
    const id = (await chamar('POST', '/api/despesas', corpo)).json().id
    const listar = async () =>
      (await chamar('GET', `/api/despesas/lancamentos?despesa_id=${id}&limite=50`)).json().dados as {
        vencimento: string
        situacao: string
      }[]
    const vencidasAntes = (await listar()).filter((l) => l.situacao === 'vencida').length
    assert.ok((await listar()).some((l) => l.vencimento > emDias(0)), 'esperava um mês futuro em aberto')

    await chamar('PUT', `/api/despesas/${id}`, { ...corpo, ativa: false })
    const depois = await listar()
    assert.ok(depois.every((l) => l.vencimento <= emDias(0)), 'mês futuro de conta desativada não é dívida')
    assert.equal(depois.filter((l) => l.situacao === 'vencida').length, vencidasAntes)
  })

  it('data final remove os meses em aberto que passam dela', async () => {
    const corpo = { descricao: 'Estacionamento', valor: 80, dia_vencimento: 28, inicio: emDias(-70) }
    const id = (await chamar('POST', '/api/despesas', corpo)).json().id
    const fim = emDias(-1)
    await chamar('PUT', `/api/despesas/${id}`, { ...corpo, fim })
    const { dados } = (await chamar('GET', `/api/despesas/lancamentos?despesa_id=${id}&limite=50`)).json()
    assert.ok(dados.every((l: { vencimento: string }) => l.vencimento <= fim))
  })

  it('não exclui despesa com pagamento registrado', async () => {
    const bloqueada = await chamar('DELETE', `/api/despesas/${despesaId}`)
    assert.equal(bloqueada.statusCode, 409)
  })

  it('soma os totais do período filtrado', async () => {
    const resposta = await chamar('GET', `/api/despesas/lancamentos?despesa_id=${despesaId}&limite=50`)
    const { dados, totais } = resposta.json()
    const somaPaginada = dados.reduce((s: number, l: { valor: string }) => s + Number(l.valor), 0)
    assert.equal(Number(totais.total_geral), somaPaginada)
    assert.equal(
      Number(totais.pago) + Number(totais.pendente),
      Number(totais.total_geral),
    )
  })
})

describe('repasse a outro advogado', () => {
  let parcelaId = ''
  let outroAdvogado = ''
  let principal = ''

  const repasseDoOutro = async () =>
    (await chamar('GET', '/api/caixa/lancamentos?origem=repasse&limite=100')).json().dados.find(
      (l: { advogado_id: string; pai_descricao: string }) =>
        l.advogado_id === outroAdvogado && l.pai_descricao === 'Honorários divididos',
    ) as { id: string; valor: string } | undefined

  before(async () => {
    const advogados = (await chamar('GET', '/api/advogados?limite=100')).json().dados
    principal = advogados.find((a: { principal: boolean }) => a.principal).id
    outroAdvogado = advogados.find((a: { principal: boolean }) => !a.principal).id

    const cliente = await chamar('POST', '/api/clientes', { nome: 'Cliente do Repasse' })
    const conta = await chamar('POST', '/api/contas', {
      cliente_id: cliente.json().id,
      descricao: 'Honorários divididos',
      valor_total: 1000,
      quantidade_parcelas: 1,
      primeiro_vencimento: emDias(-1),
    })
    parcelaId = (await chamar('GET', `/api/contas/${conta.json().id}`)).json().parcelas[0].id
  })

  it('recusa repasse acima de 100% do que entrou', async () => {
    const erro = await chamar('POST', `/api/parcelas/${parcelaId}/pagamento`, {
      data_pagamento: emDias(0),
      repasses: [{ advogado_id: outroAdvogado, percentual: 70 }, { advogado_id: principal, percentual: 40 }],
    })
    assert.equal(erro.statusCode, 400)
  })

  it('recusa o mesmo advogado duas vezes', async () => {
    const erro = await chamar('POST', `/api/parcelas/${parcelaId}/pagamento`, {
      data_pagamento: emDias(0),
      repasses: [{ advogado_id: outroAdvogado, percentual: 20 }, { advogado_id: outroAdvogado, percentual: 20 }],
    })
    assert.equal(erro.statusCode, 400)
  })

  it('não marca a parcela como paga quando o repasse é inválido', async () => {
    const lista = await chamar('GET', '/api/caixa/lancamentos?origem=parcela&situacao=vencida&limite=100')
    const alvo = lista.json().dados.find((l: { id: string }) => l.id === parcelaId)
    assert.equal(alvo.status, 'pendente', 'a transação precisa ter revertido tudo')
  })

  it('entra o valor cheio e nasce a saída do repasse', async () => {
    const pago = await chamar('POST', `/api/parcelas/${parcelaId}/pagamento`, {
      data_pagamento: emDias(0),
      forma_pagamento: 'pix',
      repasses: [{ advogado_id: outroAdvogado, percentual: 50 }],
    })
    assert.equal(pago.statusCode, 200)

    const lancamentos = (await chamar('GET', '/api/caixa/lancamentos?limite=100')).json()
    const entrada = lancamentos.dados.find((l: { pai_id: string; origem: string }) => l.origem === 'recebimento' && l.pai_id === parcelaId)
    assert.equal(entrada.tipo, 'entrada')
    assert.equal(Number(entrada.valor), 1000, 'o caixa recebe o valor cheio')
    assert.equal(entrada.status, 'pago')

    const repasse = lancamentos.dados.find(
      (l: { origem: string; advogado_id: string }) => l.origem === 'repasse' && l.advogado_id === outroAdvogado,
    )
    assert.ok(repasse, 'esperava a saída do repasse')
    assert.equal(repasse.tipo, 'saida')
    assert.equal(Number(repasse.valor), 500)
    assert.equal(repasse.status, 'pendente')
  })

  it('o saldo é a entrada cheia menos o que já saiu', async () => {
    const { totais } = (await chamar('GET', '/api/caixa/lancamentos?limite=100')).json()
    assert.equal(
      Number(totais.saldo),
      Number(totais.entrou) - Number(totais.saiu),
      'saldo = entradas pagas - saídas pagas',
    )

    const repasse = (await repasseDoOutro())!
    assert.equal(Number(repasse.valor), 500)

    const antes = Number((await chamar('GET', '/api/caixa/lancamentos?limite=100')).json().totais.saiu)
    await chamar('POST', `/api/repasses/${repasse.id}/pagamento`, { data_pagamento: emDias(0), forma_pagamento: 'pix' })
    const depois = Number((await chamar('GET', '/api/caixa/lancamentos?limite=100')).json().totais.saiu)
    assert.equal(depois, antes + 500, 'pagar o repasse aumenta o que saiu')
  })

  it('não estorna o recebimento enquanto o repasse estiver pago', async () => {
    const [recebimento] = await recebimentosDe(parcelaId)
    const bloqueado = await chamar('DELETE', `/api/recebimentos/${recebimento!.id}`)
    assert.equal(bloqueado.statusCode, 409)

    await chamar('DELETE', `/api/repasses/${(await repasseDoOutro())!.id}/pagamento`)

    const liberado = await chamar('DELETE', `/api/recebimentos/${recebimento!.id}`)
    assert.equal(liberado.statusCode, 200)
    assert.equal(await repasseDoOutro(), undefined, 'estornado o pagamento, o repasse deixa de existir')
  })
})

describe('lançamento manual no caixa', () => {
  let outro = ''

  before(async () => {
    const advogados = (await chamar('GET', '/api/advogados?limite=100')).json().dados
    outro = advogados.find((a: { principal: boolean }) => !a.principal).id
  })

  it('recusa data futura', async () => {
    const erro = await chamar('POST', '/api/caixa/lancamentos', {
      tipo: 'entrada',
      descricao: 'Consulta avulsa',
      valor: 500,
      data: emDias(2),
    })
    assert.equal(erro.statusCode, 400)
  })

  it('recusa repasse em saída', async () => {
    const erro = await chamar('POST', '/api/caixa/lancamentos', {
      tipo: 'saida',
      descricao: 'Cartório',
      valor: 200,
      data: emDias(0),
      repasses: [{ advogado_id: outro, percentual: 50 }],
    })
    assert.equal(erro.statusCode, 400)
  })

  it('entrada manual entra cheia e gera a saída do repasse', async () => {
    const criado = await chamar('POST', '/api/caixa/lancamentos', {
      tipo: 'entrada',
      descricao: 'Consulta avulsa no balcão',
      categoria: 'Consultoria',
      valor: 1000,
      data: emDias(0),
      forma_pagamento: 'dinheiro',
      repasses: [{ advogado_id: outro, percentual: 40 }],
    })
    assert.equal(criado.statusCode, 201)
    const id = criado.json().id

    const { dados, totais } = (await chamar('GET', '/api/caixa/lancamentos?limite=100')).json()
    const entrada = dados.find((l: { id: string }) => l.id === id)
    assert.equal(entrada.tipo, 'entrada')
    assert.equal(entrada.origem, 'manual')
    assert.equal(Number(entrada.valor), 1000, 'o caixa recebe o valor cheio')
    assert.equal(entrada.status, 'pago', 'lançamento manual já nasce quitado')

    const repasse = dados.find((l: { origem: string; pai_id: string }) => l.origem === 'repasse' && l.pai_id === id)
    assert.ok(repasse, 'esperava a saída do repasse ligada ao lançamento')
    assert.equal(Number(repasse.valor), 400)
    assert.equal(repasse.status, 'pendente')
    assert.equal(repasse.pai_descricao, 'Consulta avulsa no balcão', 'a saída aponta de onde veio')
    assert.ok(Number(totais.entrou) >= 1000)
  })

  it('saída manual sai do caixa sem repasse', async () => {
    const antes = Number((await chamar('GET', '/api/caixa/lancamentos?limite=100')).json().totais.saiu)
    const criado = await chamar('POST', '/api/caixa/lancamentos', {
      tipo: 'saida',
      descricao: 'Custas processuais',
      valor: 150,
      data: emDias(0),
    })
    assert.equal(criado.statusCode, 201)
    const depois = Number((await chamar('GET', '/api/caixa/lancamentos?limite=100')).json().totais.saiu)
    assert.equal(depois, antes + 150)
  })

  it('excluir o lançamento leva junto o repasse que ele criou', async () => {
    const { dados } = (await chamar('GET', '/api/caixa/lancamentos?origem=manual&limite=100')).json()
    const entrada = dados.find((l: { descricao: string }) => l.descricao === 'Consulta avulsa no balcão')

    const repasse = (await chamar('GET', '/api/caixa/lancamentos?origem=repasse&limite=100')).json().dados.find(
      (l: { pai_id: string }) => l.pai_id === entrada.id,
    )
    await chamar('POST', `/api/repasses/${repasse.id}/pagamento`, { data_pagamento: emDias(0) })

    const bloqueado = await chamar('DELETE', `/api/caixa/lancamentos/${entrada.id}`)
    assert.equal(bloqueado.statusCode, 409, 'não pode sumir dinheiro que já saiu')

    await chamar('DELETE', `/api/repasses/${repasse.id}/pagamento`)
    const removido = await chamar('DELETE', `/api/caixa/lancamentos/${entrada.id}`)
    assert.equal(removido.statusCode, 204)

    const sobrou = (await chamar('GET', '/api/caixa/lancamentos?origem=repasse&limite=100')).json().dados.filter(
      (l: { pai_id: string }) => l.pai_id === entrada.id,
    )
    assert.equal(sobrou.length, 0)
  })

  it('recusa caso de outro cliente', async () => {
    const dono = (await chamar('POST', '/api/clientes', { nome: 'Dono do caso' })).json().id
    const outroCliente = (await chamar('POST', '/api/clientes', { nome: 'Outro cliente' })).json().id
    const caso = (await chamar('POST', '/api/casos', { cliente_id: dono, titulo: 'Caso alheio' })).json().id
    const erro = await chamar('POST', '/api/caixa/lancamentos', {
      tipo: 'entrada',
      descricao: 'Errado',
      valor: 10,
      data: emDias(0),
      cliente_id: outroCliente,
      caso_id: caso,
    })
    assert.equal(erro.statusCode, 400)
  })
})

describe('extrato do caixa', () => {
  it('pagamento atrasado entra no mês em que foi pago, não no do vencimento', async () => {
    const cliente = (await chamar('POST', '/api/clientes', { nome: 'Pagou atrasado' })).json().id
    const vencimento = `${emDias(-40).slice(0, 7)}-10`
    const conta = await chamar('POST', '/api/contas', {
      cliente_id: cliente,
      descricao: 'Honorários atrasados',
      valor_total: 777,
      primeiro_vencimento: vencimento,
    })
    const parcela = (await chamar('GET', `/api/contas/${conta.json().id}`)).json().parcelas[0]
    await chamar('POST', `/api/parcelas/${parcela.id}/pagamento`, { data_pagamento: emDias(0) })

    const noMes = async (mes: string) =>
      (await chamar('GET', `/api/caixa/lancamentos?mes=${mes}&status=pago&limite=100`))
        .json()
        .dados.some((l: { pai_id: string }) => l.pai_id === parcela.id)
    assert.equal(await noMes(emDias(0).slice(0, 7)), true)
    assert.equal(await noMes(vencimento.slice(0, 7)), false)
  })

  it('status=pendente traz só o que está em aberto, paginado no banco', async () => {
    const { dados, total } = (await chamar('GET', '/api/caixa/lancamentos?status=pendente&limite=100')).json()
    assert.ok(total > 0)
    assert.ok(dados.every((l: { status: string }) => l.status === 'pendente'))
  })
})

describe('pagamento parcial', () => {
  let parcelaId = ''

  before(async () => {
    const cliente = (await chamar('POST', '/api/clientes', { nome: 'Cliente Parcial' })).json().id
    const conta = await chamar('POST', '/api/contas', {
      cliente_id: cliente,
      descricao: 'Honorários em partes',
      valor_total: 1000,
      primeiro_vencimento: emDias(-3),
    })
    parcelaId = (await chamar('GET', `/api/contas/${conta.json().id}`)).json().parcelas[0].id
  })

  it('recebe parte e o restante continua em aberto', async () => {
    const parcial = await chamar('POST', `/api/parcelas/${parcelaId}/pagamento`, { valor: 400, data_pagamento: emDias(0) })
    assert.equal(parcial.statusCode, 200)
    assert.equal(parcial.json().status, 'pendente')
    assert.equal(Number(parcial.json().valor_pago), 400)
    assert.equal(Number(parcial.json().restante), 600)

    const aberto = (await chamar('GET', '/api/caixa/lancamentos?origem=parcela&status=pendente&limite=100')).json()
    const linha = aberto.dados.find((l: { id: string }) => l.id === parcelaId)
    assert.equal(Number(linha.valor), 600, 'em aberto aparece só o que falta')
    assert.equal(Number(linha.valor_parcela), 1000)
  })

  it('recusa receber mais do que falta', async () => {
    const erro = await chamar('POST', `/api/parcelas/${parcelaId}/pagamento`, { valor: 600.01, data_pagamento: emDias(0) })
    assert.equal(erro.statusCode, 400)
  })

  it('não deixa o valor da parcela ficar abaixo do já recebido', async () => {
    const erro = await chamar('PATCH', `/api/parcelas/${parcelaId}`, { valor: 399 })
    assert.equal(erro.statusCode, 400)
  })

  it('sem valor informado, recebe o restante e quita', async () => {
    const quitada = await chamar('POST', `/api/parcelas/${parcelaId}/pagamento`, { data_pagamento: emDias(0) })
    assert.equal(quitada.json().status, 'pago')
    assert.equal(Number(quitada.json().restante), 0)
    const partes = await recebimentosDe(parcelaId)
    assert.deepEqual(partes.map((r) => Number(r.valor)).sort((a, b) => a - b), [400, 600])
  })

  it('estornar uma parte reabre só aquela parte', async () => {
    const partes = await recebimentosDe(parcelaId)
    const seiscentos = partes.find((r) => Number(r.valor) === 600)!
    const reaberta = (await chamar('DELETE', `/api/recebimentos/${seiscentos.id}`)).json()
    assert.equal(reaberta.status, 'pendente')
    assert.equal(Number(reaberta.restante), 600)
  })

  it('dar desconto no restante quita a parcela', async () => {
    const quitada = await chamar('PATCH', `/api/parcelas/${parcelaId}`, { valor: 400 })
    assert.equal(quitada.statusCode, 200)
    assert.equal(quitada.json().status, 'pago')
  })

  it('o repasse acompanha o valor que entrou, não a parcela inteira', async () => {
    const advogados = (await chamar('GET', '/api/advogados?limite=100')).json().dados
    const outro = advogados.find((a: { principal: boolean }) => !a.principal).id
    const cliente = (await chamar('POST', '/api/clientes', { nome: 'Cliente Repasse Parcial' })).json().id
    const conta = await chamar('POST', '/api/contas', {
      cliente_id: cliente,
      descricao: 'Repasse parcial',
      valor_total: 1000,
      primeiro_vencimento: emDias(0),
    })
    const parcela = (await chamar('GET', `/api/contas/${conta.json().id}`)).json().parcelas[0].id
    await chamar('POST', `/api/parcelas/${parcela}/pagamento`, {
      valor: 300,
      data_pagamento: emDias(0),
      repasses: [{ advogado_id: outro, percentual: 50 }],
    })
    const [recebimento] = await recebimentosDe(parcela)
    const repasse = (await chamar('GET', '/api/caixa/lancamentos?origem=repasse&limite=100')).json().dados.find(
      (l: { pai_id: string }) => l.pai_id === recebimento!.id,
    )
    assert.equal(Number(repasse.valor), 150)
  })
})

describe('bancos e dinheiro', () => {
  let banco = ''
  let dinheiro = ''
  let clienteId = ''
  const mes = emDias(0).slice(0, 7)
  const saldoDe = async (id: string) =>
    (await chamar('GET', `/api/carteiras?mes=${mes}`)).json().dados.find((c: { id: string }) => c.id === id) as {
      saldo: string
      entrou_mes: string
      saiu_mes: string
    }

  before(async () => {
    clienteId = (await chamar('POST', '/api/clientes', { nome: 'Cliente do Banco' })).json().id
  })

  it('cadastra banco e dinheiro com saldo inicial', async () => {
    const criado = await chamar('POST', '/api/carteiras', { nome: 'Banco do Brasil', tipo: 'banco', saldo_inicial: 1000 })
    assert.equal(criado.statusCode, 201)
    banco = criado.json().id
    dinheiro = (await chamar('POST', '/api/carteiras', { nome: 'Dinheiro', tipo: 'dinheiro' })).json().id
    assert.equal(Number((await saldoDe(banco)).saldo), 1000)

    const repetido = await chamar('POST', '/api/carteiras', { nome: 'banco do brasil', tipo: 'banco' })
    assert.equal(repetido.statusCode, 409)
  })

  it('recebimento entra no banco escolhido', async () => {
    const conta = await chamar('POST', '/api/contas', {
      cliente_id: clienteId,
      descricao: 'Honorários no banco',
      valor_total: 500,
      primeiro_vencimento: emDias(0),
    })
    const parcela = (await chamar('GET', `/api/contas/${conta.json().id}`)).json().parcelas[0].id
    await chamar('POST', `/api/parcelas/${parcela}/pagamento`, { data_pagamento: emDias(0), carteira_id: banco })
    const saldo = await saldoDe(banco)
    assert.equal(Number(saldo.saldo), 1500)
    assert.equal(Number(saldo.entrou_mes), 500)
  })

  it('entrada já recebida no cadastro cai na conta informada', async () => {
    await chamar('POST', '/api/contas', {
      cliente_id: clienteId,
      descricao: 'Com entrada em dinheiro',
      valor_total: 900,
      entrada: 100,
      entrada_vencimento: emDias(0),
      entrada_paga: true,
      entrada_carteira_id: dinheiro,
      quantidade_parcelas: 2,
      primeiro_vencimento: emDias(30),
    })
    assert.equal(Number((await saldoDe(dinheiro)).saldo), 100)
  })

  it('saída sai da conta e transferência muda só onde o dinheiro está', async () => {
    await chamar('POST', '/api/caixa/lancamentos', {
      tipo: 'saida',
      descricao: 'Cartório',
      valor: 40,
      data: emDias(0),
      carteira_id: dinheiro,
    })
    assert.equal(Number((await saldoDe(dinheiro)).saldo), 60)

    const antes = (await chamar('GET', `/api/caixa/lancamentos?mes=${mes}&status=pago&limite=100`)).json().totais
    const transferencia = await chamar('POST', '/api/caixa/transferencias', {
      de_carteira_id: banco,
      para_carteira_id: dinheiro,
      valor: 200,
      data: emDias(0),
    })
    assert.equal(transferencia.statusCode, 201)
    assert.equal(Number((await saldoDe(banco)).saldo), 1300)
    assert.equal(Number((await saldoDe(dinheiro)).saldo), 260)

    const depois = (await chamar('GET', `/api/caixa/lancamentos?mes=${mes}&status=pago&limite=100`)).json().totais
    assert.equal(depois.entrou, antes.entrou, 'transferência não é entrada')
    assert.equal(depois.saiu, antes.saiu, 'transferência não é saída')

    const doBanco = (await chamar('GET', `/api/caixa/lancamentos?carteira_id=${banco}&limite=100`)).json().dados
    assert.ok(doBanco.some((l: { origem: string }) => l.origem === 'transferencia'))

    const mesma = await chamar('POST', '/api/caixa/transferencias', {
      de_carteira_id: banco,
      para_carteira_id: banco,
      valor: 1,
      data: emDias(0),
    })
    assert.equal(mesma.statusCode, 400)

    assert.equal((await chamar('DELETE', `/api/caixa/transferencias/${transferencia.json().id}`)).statusCode, 204)
    assert.equal(Number((await saldoDe(banco)).saldo), 1500)
  })

  it('troca a conta de um movimento já registrado', async () => {
    const { dados } = (await chamar('GET', `/api/caixa/lancamentos?carteira_id=${dinheiro}&origem=manual&limite=100`)).json()
    const trocado = await chamar('PATCH', `/api/caixa/movimentos/manual/${dados[0].id}`, { carteira_id: banco })
    assert.equal(trocado.statusCode, 200)
    assert.equal(Number((await saldoDe(dinheiro)).saldo), 100)
    assert.equal(Number((await saldoDe(banco)).saldo), 1460)
  })

  it('movimento sem conta aparece separado e não some do total', async () => {
    const { sem_carteira } = (await chamar('GET', `/api/carteiras?mes=${mes}`)).json()
    assert.ok(sem_carteira, 'pagamentos antigos sem conta precisam aparecer')
  })

  it('banco com movimento não é excluído, e desativado não recebe', async () => {
    const bloqueado = await chamar('DELETE', `/api/carteiras/${banco}`)
    assert.equal(bloqueado.statusCode, 409)

    await chamar('PUT', `/api/carteiras/${banco}`, { nome: 'Banco do Brasil', tipo: 'banco', saldo_inicial: 1000, ativa: false })
    const recusado = await chamar('POST', '/api/caixa/lancamentos', {
      tipo: 'entrada',
      descricao: 'x',
      valor: 1,
      data: emDias(0),
      carteira_id: banco,
    })
    assert.equal(recusado.statusCode, 400)

    const vazio = (await chamar('POST', '/api/carteiras', { nome: 'Conta nova', tipo: 'banco' })).json().id
    assert.equal((await chamar('DELETE', `/api/carteiras/${vazio}`)).statusCode, 204)
  })
})

describe('divisão do caso como sugestão', () => {
  it('o que ninguém recebeu fica com o principal', async () => {
    const advogados = (await chamar('GET', '/api/advogados?limite=100')).json().dados
    const outro = advogados.find((a: { principal: boolean }) => !a.principal).id
    const cliente = (await chamar('POST', '/api/clientes', { nome: 'Cliente Divisão' })).json().id
    const caso = await chamar('POST', '/api/casos', {
      cliente_id: cliente,
      titulo: 'Caso sem o principal na lista',
      advogados: [{ advogado_id: outro, percentual: 40 }],
      conta: { descricao: 'Honorários', valor_total: 1000, primeiro_vencimento: emDias(10) },
    })
    const detalhe = (await chamar('GET', `/api/casos/${caso.json().id}`)).json()
    assert.equal(Number(detalhe.percentual_principal), 60)
    assert.equal(Number(detalhe.advogado_a_receber), 600)
  })
})

describe('ordenação e busca', () => {
  it('ordena clientes pelo valor a receber', async () => {
    const { dados } = (await chamar('GET', '/api/clientes?ordem=pendente&direcao=desc&limite=100')).json()
    const valores = dados.map((c: { pendente: string }) => Number(c.pendente))
    assert.deepEqual(valores, [...valores].sort((a: number, b: number) => b - a))
  })

  it('recusa coluna de ordenação desconhecida', async () => {
    const erro = await chamar('GET', '/api/clientes?ordem=nome;drop table clientes')
    assert.equal(erro.statusCode, 400)
  })

  it('acha o CPF com ou sem pontuação', async () => {
    const semPontos = (await chamar('GET', '/api/clientes?busca=12345678900')).json()
    assert.ok(semPontos.dados.some((c: { nome: string }) => c.nome === 'João da Silva'))
    const outroFormato = (await chamar('GET', '/api/clientes?busca=456-789')).json()
    assert.ok(outroFormato.dados.some((c: { nome: string }) => c.nome === 'João da Silva'))
  })

  it('ordena casos, contas programadas e o caixa', async () => {
    for (const url of [
      '/api/casos?ordem=valor&direcao=asc',
      '/api/despesas?ordem=valor&direcao=desc',
      '/api/caixa/lancamentos?status=pendente&ordem=vencimento&direcao=desc',
      '/api/caixa?ordem=minha_recebida&direcao=desc',
    ]) {
      assert.equal((await chamar('GET', url)).statusCode, 200, url)
    }
  })
})

describe('usuários', () => {
  let guilherme = ''
  const entrarComo = async (login: string, senha: string) => {
    const resposta = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login, senha } })
    return { status: resposta.statusCode, cookie: String(resposta.headers['set-cookie'] ?? '').split(';')[0]! }
  }
  const comoGuilherme = (cookieGuilherme: string) =>
    app.inject({ method: 'GET', url: '/api/auth/sessao', headers: { cookie: cookieGuilherme } })

  it('cadastra usuário e ele consegue entrar', async () => {
    const criado = await chamar('POST', '/api/usuarios', { nome: 'Guilherme', login: 'Guilherme', senha: 'senha-forte-1' })
    assert.equal(criado.statusCode, 201)
    assert.equal(criado.json().login, 'guilherme')
    assert.equal(criado.json().senha_hash, undefined, 'o hash nunca sai da API')
    guilherme = criado.json().id

    const sessao = await entrarComo('GUILHERME', 'senha-forte-1')
    assert.equal(sessao.status, 200)
    assert.equal((await comoGuilherme(sessao.cookie)).json().usuario.nome, 'Guilherme')
  })

  it('recusa login repetido e senha curta', async () => {
    const repetido = await chamar('POST', '/api/usuarios', { nome: 'Outro', login: 'guilherme', senha: 'senha-forte-2' })
    assert.equal(repetido.statusCode, 409)
    const curta = await chamar('POST', '/api/usuarios', { nome: 'Outro', login: 'outro', senha: '123' })
    assert.equal(curta.statusCode, 400)
  })

  it('não deixa desativar o próprio usuário', async () => {
    const eu = (await chamar('GET', '/api/auth/sessao')).json().usuario
    const erro = await chamar('PUT', `/api/usuarios/${eu.id}`, { nome: eu.nome, login: eu.login, ativo: false })
    assert.equal(erro.statusCode, 400)
  })

  it('trocar a senha derruba as sessões antigas', async () => {
    const antiga = await entrarComo('guilherme', 'senha-forte-1')
    await chamar('PUT', `/api/usuarios/${guilherme}/senha`, { senha: 'senha-nova-2' })
    assert.equal((await comoGuilherme(antiga.cookie)).statusCode, 401)
    assert.equal((await entrarComo('guilherme', 'senha-forte-1')).status, 401)
    assert.equal((await entrarComo('guilherme', 'senha-nova-2')).status, 200)
  })

  it('desativar derruba a sessão e impede de entrar', async () => {
    const sessao = await entrarComo('guilherme', 'senha-nova-2')
    await chamar('PUT', `/api/usuarios/${guilherme}`, { nome: 'Guilherme', login: 'guilherme', ativo: false })
    assert.equal((await comoGuilherme(sessao.cookie)).statusCode, 401)
    assert.equal((await entrarComo('guilherme', 'senha-nova-2')).status, 401)
    await chamar('PUT', `/api/usuarios/${guilherme}`, { nome: 'Guilherme', login: 'guilherme', ativo: true })
  })
})

describe('auditoria', () => {
  const ultimos = async (filtro: string) => (await chamar('GET', `/api/auditoria?limite=20&${filtro}`)).json().dados

  it('registra quem fez, o que fez e como estava antes de excluir', async () => {
    const cliente = (await chamar('POST', '/api/clientes', { nome: 'Cliente Auditado' })).json().id
    await chamar('DELETE', `/api/clientes/${cliente}`)

    const [exclusao] = await ultimos('alvo=Cliente&acao=EXCLUIR')
    assert.equal(exclusao.usuario_nome, 'Usuária de Teste')
    assert.match(exclusao.descricao, /Cliente Auditado/)
    assert.equal(exclusao.alvo_id, cliente)

    const detalhe = (await chamar('GET', `/api/auditoria/${exclusao.id}`)).json()
    assert.equal(detalhe.antes.nome, 'Cliente Auditado', 'guarda o retrato do que foi apagado')
    assert.equal(detalhe.metodo, 'DELETE')

    const [criacao] = await ultimos('alvo=Cliente&acao=CRIAR')
    assert.equal(criacao.alvo_id, cliente, 'a criação aponta para o id gerado')
  })

  it('registra tentativas recusadas e logins negados', async () => {
    await chamar('DELETE', '/api/clientes/00000000-0000-0000-0000-000000000000')
    const [recusada] = await ultimos('recusadas=true&alvo=Cliente')
    assert.equal(recusada.status, 404)

    await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'teste', senha: 'chute' } })
    const [negado] = await ultimos('acao=NEGADO')
    assert.match(negado.descricao, /Login recusado para "teste"/)
  })

  it('nunca grava senha', async () => {
    const [criacao] = await ultimos('alvo=Usu%C3%A1rio&acao=CRIAR')
    const detalhe = (await chamar('GET', `/api/auditoria/${criacao.id}`)).json()
    assert.equal(detalhe.dados.senha, '••••••')
    assert.ok(!JSON.stringify(detalhe).includes('senha-forte-1'))
    assert.ok(!JSON.stringify(detalhe).includes('scrypt$'))
  })

  it('não pode ser alterada nem apagada nem pelo banco', async () => {
    await assert.rejects(pool.query(`update auditoria set descricao = 'x'`), /não podem ser alterados/)
    await assert.rejects(pool.query('delete from auditoria'), /não podem ser alterados/)
  })

  it('oferece os filtros que existem no banco', async () => {
    const filtros = (await chamar('GET', '/api/auditoria/filtros')).json()
    for (const acao of ['LOGIN', 'NEGADO', 'CRIAR', 'EXCLUIR']) assert.ok(filtros.acoes.includes(acao), acao)
    assert.ok(filtros.usuarios.some((u: { nome: string }) => u.nome === 'Guilherme'))
  })
})

describe('baixa e adiamento de conta programada', () => {
  let despesaId = ''
  const mesAtual = emDias(0).slice(0, 7)
  const proximoMes = (() => {
    const [ano, mes] = mesAtual.split('-').map(Number) as [number, number]
    return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`
  })()
  const proxima = async () =>
    (await chamar('GET', '/api/despesas?limite=100')).json().dados.find((d: { id: string }) => d.id === despesaId)

  before(async () => {
    despesaId = (
      await chamar('POST', '/api/despesas', { descricao: 'Software jurídico', valor: 300, dia_vencimento: 28, inicio: `${mesAtual}-01` })
    ).json().id
  })

  it('adiar joga o vencimento para o mês seguinte e guarda a data original', async () => {
    const antes = await proxima()
    assert.equal(antes.proximo_vencimento.slice(0, 7), mesAtual)
    const adiada = (await chamar('POST', `/api/despesas/lancamentos/${antes.proximo_id}/adiar`)).json()
    assert.equal(adiada.vencimento.slice(0, 7), proximoMes)
    assert.equal(adiada.vencimento_original, antes.proximo_vencimento)
    assert.equal(adiada.status, 'pendente', 'adiar não perdoa a conta')
  })

  it('dar baixa antes do vencimento desconta na hora e abre o próximo mês', async () => {
    for (let i = 0; i < 3; i++) {
      const atual = await proxima()
      const pago = await chamar('POST', `/api/despesas/lancamentos/${atual.proximo_id}/pagamento`, { data_pagamento: emDias(0) })
      assert.equal(pago.statusCode, 200)
    }
    const depois = await proxima()
    assert.ok(depois.proximo_id, 'sempre existe um próximo mês em aberto')
    assert.ok(depois.proximo_vencimento.slice(0, 7) > proximoMes)
  })

  it('não adia o que já foi pago', async () => {
    const { dados } = (await chamar('GET', `/api/despesas/lancamentos?despesa_id=${despesaId}&situacao=pago`)).json()
    const erro = await chamar('POST', `/api/despesas/lancamentos/${dados[0].id}/adiar`)
    assert.equal(erro.statusCode, 409)
  })
})

describe('histórico mensal', () => {
  it('mostra o saldo de cada conta no início e no fim do mês', async () => {
    const historico = (await chamar('GET', `/api/historico?mes=${emDias(0).slice(0, 7)}`)).json()
    assert.equal(historico.meses.length, 12)
    assert.ok(historico.contas.length > 0)
    for (const c of historico.contas) {
      const centavos = (v: string) => Math.round(Number(v) * 100)
      assert.equal(
        centavos(c.saldo_inicio_mes) + centavos(c.entrou_mes) - centavos(c.saiu_mes),
        centavos(c.saldo_fim_mes),
        c.nome,
      )
    }
    assert.ok(Number(historico.resumo.entradas) > 0)
    assert.ok(historico.por_origem.some((o: { origem: string }) => o.origem === 'recebimento'))
  })
})

describe('cobranças do caso e observações', () => {
  it('lista só as cobranças do caso e mostra a observação do pagamento', async () => {
    const cliente = (await chamar('POST', '/api/clientes', { nome: 'Cliente com Obs' })).json().id
    const caso = (await chamar('POST', '/api/casos', { cliente_id: cliente, titulo: 'Caso com Obs' })).json().id
    await chamar('POST', '/api/contas', {
      cliente_id: cliente, caso_id: caso, descricao: 'Do caso', valor_total: 300, primeiro_vencimento: emDias(0),
    })
    await chamar('POST', '/api/contas', {
      cliente_id: cliente, descricao: 'Avulsa', valor_total: 100, primeiro_vencimento: emDias(0),
    })

    const doCaso = (await chamar('GET', `/api/clientes/${cliente}/contas?caso_id=${caso}`)).json()
    assert.deepEqual(doCaso.dados.map((c: { descricao: string }) => c.descricao), ['Do caso'])

    const parcela = doCaso.dados[0].parcelas[0]
    await chamar('POST', `/api/parcelas/${parcela.id}/pagamento`, {
      data_pagamento: emDias(0),
      observacoes: 'Pago no balcão, em espécie',
    })
    const depois = (await chamar('GET', `/api/clientes/${cliente}/contas?caso_id=${caso}`)).json()
    assert.equal(depois.dados[0].parcelas[0].recebimentos[0].observacoes, 'Pago no balcão, em espécie')

    const extrato = (await chamar('GET', '/api/caixa/lancamentos?origem=recebimento&limite=100')).json()
    const linha = extrato.dados.find((l: { pai_id: string }) => l.pai_id === parcela.id)
    assert.equal(linha.observacoes, 'Pago no balcão, em espécie')
  })
})

describe('documentos para imprimir', () => {
  let clienteId = ''
  let contaId = ''
  let parcelaId = ''

  before(async () => {
    clienteId = (await chamar('POST', '/api/clientes', { nome: 'Maria Recibo', documento: '987.654.321-00' })).json().id
    const conta = await chamar('POST', '/api/contas', {
      cliente_id: clienteId,
      descricao: 'Honorários parcelados',
      valor_total: 900,
      quantidade_parcelas: 3,
      primeiro_vencimento: emDias(-2),
    })
    contaId = conta.json().id
    parcelaId = (await chamar('GET', `/api/contas/${contaId}`)).json().parcelas[0].id
  })

  it('guarda os dados do escritório e recusa nome vazio', async () => {
    const vazio = await chamar('PUT', '/api/escritorio', { nome: '' })
    assert.equal(vazio.statusCode, 400)
    const salvo = await chamar('PUT', '/api/escritorio', {
      nome: 'Quadros Advocacia', documento: '12.345.678/0001-90', cidade: 'Florianópolis/SC', email: ' ',
    })
    assert.equal(salvo.statusCode, 200)
    assert.equal(salvo.json().email, null, 'campo em branco vira vazio')
    assert.equal((await chamar('GET', '/api/escritorio')).json().nome, 'Quadros Advocacia')
  })

  it('o pagamento devolve o recebimento e o recibo mostra quanto ainda falta naquela parcela', async () => {
    const primeiro = await chamar('POST', `/api/parcelas/${parcelaId}/pagamento`, { valor: 100, data_pagamento: emDias(-1) })
    const segundo = await chamar('POST', `/api/parcelas/${parcelaId}/pagamento`, { valor: 50, data_pagamento: emDias(0) })
    assert.ok(primeiro.json().recebimento_id)

    const recibo1 = (await chamar('GET', `/api/documentos/recibo/recebimento/${primeiro.json().recebimento_id}`)).json()
    assert.equal(recibo1.escritorio.nome, 'Quadros Advocacia')
    assert.equal(recibo1.recibo.cliente_nome, 'Maria Recibo')
    assert.equal(Number(recibo1.recibo.valor), 100)
    assert.equal(Number(recibo1.recibo.restante_apos), 200, 'no primeiro recibo faltavam 200')

    const recibo2 = (await chamar('GET', `/api/documentos/recibo/recebimento/${segundo.json().recebimento_id}`)).json()
    assert.equal(Number(recibo2.recibo.restante_apos), 150)
    assert.equal(recibo2.recibo.numero, 1)
    assert.equal(recibo2.recibo.total_parcelas, 3)
  })

  it('emite recibo de entrada manual, mas não de saída', async () => {
    const entrada = await chamar('POST', '/api/caixa/lancamentos', {
      tipo: 'entrada', descricao: 'Consulta no balcão', valor: 250, data: emDias(0), cliente_id: clienteId,
    })
    const recibo = (await chamar('GET', `/api/documentos/recibo/manual/${entrada.json().id}`)).json()
    assert.equal(recibo.recibo.descricao, 'Consulta no balcão')
    assert.equal(recibo.recibo.cliente_nome, 'Maria Recibo')

    const saida = await chamar('POST', '/api/caixa/lancamentos', {
      tipo: 'saida', descricao: 'Custas', valor: 30, data: emDias(0),
    })
    assert.equal((await chamar('GET', `/api/documentos/recibo/manual/${saida.json().id}`)).statusCode, 404)
    assert.equal((await chamar('GET', `/api/documentos/recibo/outro/${saida.json().id}`)).statusCode, 400)
  })

  it('o termo de parcelamento traz cliente e todas as parcelas', async () => {
    const termo = (await chamar('GET', `/api/documentos/parcelamento/${contaId}`)).json()
    assert.equal(termo.conta.cliente_documento, '987.654.321-00')
    assert.deepEqual(termo.parcelas.map((p: { numero: number }) => p.numero), [1, 2, 3])
    assert.equal(termo.parcelas.reduce((s: number, p: { valor: string }) => s + Number(p.valor), 0), 900)
  })
})

describe('busca geral', () => {
  it('acha cliente pelo nome e pelo CPF sem pontuação', async () => {
    const porNome = (await chamar('GET', '/api/busca?q=maria rec')).json()
    assert.equal(porNome.clientes[0].nome, 'Maria Recibo')
    const porCpf = (await chamar('GET', '/api/busca?q=98765432100')).json()
    assert.equal(porCpf.clientes[0].nome, 'Maria Recibo')
  })

  it('acha cobrança pela descrição e lançamento pelo valor', async () => {
    const cobranca = (await chamar('GET', '/api/busca?q=parcelados')).json()
    assert.equal(cobranca.cobrancas[0].descricao, 'Honorários parcelados')
    const valor = (await chamar('GET', '/api/busca?q=R$ 250,00')).json()
    assert.ok(valor.valores.some((v: { descricao: string }) => v.descricao === 'Consulta no balcão'))
  })

  it('recusa busca curta demais', async () => {
    assert.equal((await chamar('GET', '/api/busca?q=a')).statusCode, 400)
  })
})

describe('exportação em CSV', () => {
  it('exporta o caixa do mês em formato do Excel brasileiro', async () => {
    await chamar('POST', '/api/caixa/lancamentos', {
      tipo: 'entrada', descricao: '=HYPERLINK("x")', valor: 1234.5, data: emDias(0),
    })
    const resposta = await chamar('GET', `/api/exportar/caixa.csv?mes=${emDias(0).slice(0, 7)}`)
    assert.equal(resposta.statusCode, 200)
    assert.match(String(resposta.headers['content-type']), /text\/csv/)
    assert.match(String(resposta.headers['content-disposition']), /attachment; filename="caixa-/)
    const texto = resposta.body
    assert.ok(texto.startsWith('﻿Data;Tipo;Origem'), 'BOM e separador ponto e vírgula')
    assert.ok(texto.includes(`"'=HYPERLINK(""x"")"`), 'fórmula vira texto')
    assert.ok(texto.includes(';1234,50;'), 'vírgula decimal')
  })

  it('exige o mês e exporta histórico e repasses', async () => {
    assert.equal((await chamar('GET', '/api/exportar/caixa.csv')).statusCode, 400)
    const historico = await chamar('GET', `/api/exportar/historico.csv?mes=${emDias(0).slice(0, 7)}`)
    assert.equal(historico.body.trim().split('\r\n').length, 13, 'cabeçalho + 12 meses')
    const repasses = await chamar('GET', '/api/exportar/repasses.csv?status=pago')
    assert.equal(repasses.statusCode, 200)
    assert.ok(repasses.body.startsWith('﻿Advogado;'))
  })
})

describe('repasses por advogado', () => {
  let outro = ''
  let ids: string[] = []

  before(async () => {
    const advogados = (await chamar('GET', '/api/advogados?limite=100')).json().dados
    outro = advogados.find((a: { principal: boolean }) => !a.principal).id
    for (const valor of [100, 300]) {
      await chamar('POST', '/api/caixa/lancamentos', {
        tipo: 'entrada', descricao: `Lote ${valor}`, valor, data: emDias(0),
        repasses: [{ advogado_id: outro, percentual: 50 }],
      })
    }
    const pendentes = (
      await chamar('GET', `/api/caixa/lancamentos?origem=repasse&status=pendente&advogado_id=${outro}&limite=100`)
    ).json().dados as { id: string; advogado_id: string; pai_descricao: string }[]
    assert.ok(pendentes.every((r) => r.advogado_id === outro), 'filtra pelo advogado')
    ids = pendentes.filter((r) => r.pai_descricao.startsWith('Lote ')).map((r) => r.id)
    assert.equal(ids.length, 2)
  })

  it('resume o que cada advogado tem a receber', async () => {
    const { advogados } = (await chamar('GET', '/api/repasses/resumo')).json()
    const dele = advogados.find((a: { id: string }) => a.id === outro)
    assert.ok(Number(dele.a_pagar) >= 200)
    assert.ok(Number(dele.qtd_a_pagar) >= 2)
  })

  it('paga vários de uma vez e não paga nada se algum já estiver pago', async () => {
    const pago = await chamar('POST', '/api/repasses/pagamento-lote', { ids, data_pagamento: emDias(0), forma_pagamento: 'pix' })
    assert.equal(pago.statusCode, 200)
    assert.deepEqual(pago.json(), { pagos: 2, total: 200 })

    const extra = (await chamar('POST', '/api/caixa/lancamentos', {
      tipo: 'entrada', descricao: 'Lote extra', valor: 80, data: emDias(0), repasses: [{ advogado_id: outro, percentual: 50 }],
    })).json()
    const novo = (await chamar('GET', '/api/caixa/lancamentos?origem=repasse&status=pendente&limite=100')).json().dados
      .find((r: { pai_id: string }) => r.pai_id === extra.id).id
    const repetido = await chamar('POST', '/api/repasses/pagamento-lote', { ids: [novo, ids[0]], data_pagamento: emDias(0) })
    assert.equal(repetido.statusCode, 409)
    const aindaPendente = (await chamar('GET', '/api/caixa/lancamentos?origem=repasse&status=pendente&limite=100')).json().dados
    assert.ok(aindaPendente.some((r: { id: string }) => r.id === novo), 'a transação desfez o pagamento do novo')

    const futuro = await chamar('POST', '/api/repasses/pagamento-lote', { ids: [novo], data_pagamento: emDias(3) })
    assert.equal(futuro.statusCode, 400)
  })
})

describe('alertas e previsão no dashboard', () => {
  it('avisa de parcela atrasada há mais de 30 dias e de repasse parado', async () => {
    const antes = (await chamar('GET', '/api/dashboard')).json().alertas
    const cliente = (await chamar('POST', '/api/clientes', { nome: 'Cliente Atrasado' })).json().id
    await chamar('POST', '/api/contas', {
      cliente_id: cliente, descricao: 'Muito atrasada', valor_total: 700, primeiro_vencimento: emDias(-45),
    })
    const depois = (await chamar('GET', '/api/dashboard')).json().alertas
    assert.equal(Number(depois.parcelas_atrasadas), Number(antes.parcelas_atrasadas) + 1)
    assert.equal(Number(depois.parcelas_atrasadas_valor) - Number(antes.parcelas_atrasadas_valor), 700)
    assert.equal(depois.dias_atraso, 30)
    assert.ok(Array.isArray(depois.contas_negativas))
  })

  it('projeta 30, 60 e 90 dias somando o que entra e tirando o que sai', async () => {
    const { previsao, caixa } = (await chamar('GET', '/api/dashboard')).json()
    assert.deepEqual(previsao.map((p: { dias: number }) => p.dias), [30, 60, 90])
    for (const p of previsao) {
      const c = (v: string | number) => Math.round(Number(v) * 100)
      assert.equal(c(p.saldo_previsto), c(caixa.saldo) + c(p.a_receber) - c(p.a_pagar) - c(p.repasses))
    }
    assert.ok(Number(previsao[2].a_receber) >= Number(previsao[0].a_receber), 'o horizonte maior inclui o menor')
  })

  it('conta programada ainda não gerada entra na previsão', async () => {
    const antes = (await chamar('GET', '/api/dashboard')).json().previsao[2]
    const dia = Number(emDias(40).slice(8, 10))
    await chamar('POST', '/api/despesas', {
      descricao: 'Software mensal', valor: 99.9, dia_vencimento: Math.min(dia, 28), inicio: emDias(35),
    })
    const depois = (await chamar('GET', '/api/dashboard')).json().previsao[2]
    const diferenca = Math.round((Number(depois.a_pagar) - Number(antes.a_pagar)) * 100) / 100
    assert.ok(diferenca >= 99.9 && diferenca <= 99.9 * 2, `entra 1 ou 2 meses, entrou ${diferenca}`)
  })
})

describe('editar nota', () => {
  it('edita o texto, marca como editada e recusa texto vazio', async () => {
    const cliente = (await chamar('POST', '/api/clientes', { nome: 'Cliente da Nota Editada' })).json().id
    const nota = (await chamar('POST', '/api/notas', { cliente_id: cliente, texto: 'Primeira versão' })).json()
    assert.equal(nota.editado_em, null)

    const editada = await chamar('PUT', `/api/notas/${nota.id}`, { texto: '  Versão corrigida ' })
    assert.equal(editada.statusCode, 200)
    assert.equal(editada.json().texto, 'Versão corrigida')
    assert.ok(editada.json().editado_em)

    assert.equal((await chamar('PUT', `/api/notas/${nota.id}`, { texto: '   ' })).statusCode, 400)
    assert.equal((await chamar('PUT', '/api/notas/00000000-0000-0000-0000-000000000000', { texto: 'x' })).statusCode, 404)
  })
})

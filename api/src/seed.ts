import { pool, transacao } from './db.ts'
import { migrar } from './migrate.ts'
import { montarParcelas } from './lib/parcelas.ts'

if (process.env.NODE_ENV === 'production') throw new Error('seed não pode ser executado em produção')

await migrar()

const hoje = new Date().toLocaleDateString('en-CA')
const emDias = (dias: number) => new Date(Date.now() + dias * 86400000).toLocaleDateString('en-CA')

await transacao(async (client) => {
  await client.query(
    'truncate parcelas, contas, caso_advogados, casos, clientes, advogados, despesas, lancamentos, transferencias, carteiras restart identity cascade',
  )

  const carteiras = await client.query<{ id: string }>(
    `insert into carteiras (nome, tipo, saldo_inicial) values
       ('Banco do Brasil', 'banco', 8000),
       ('Nubank', 'banco', 2500),
       ('Dinheiro', 'dinheiro', 600)
     returning id`,
  )
  const [bancoDoBrasil] = carteiras.rows.map((c) => c.id) as [string]

  const advogados = await client.query<{ id: string }>(
    `insert into advogados (nome, oab, email, telefone, principal) values
       ('Lucas Quadros', 'OAB/SP 123456', 'lucas@escritorio.com', '(11) 90000-0001', true),
       ('Ana Martins', 'OAB/SP 234567', 'ana@parceiros.com', '(11) 90000-0002', false),
       ('Bruno Teixeira', 'OAB/SP 345678', 'bruno@parceiros.com', '(11) 90000-0003', false)
     returning id`,
  )
  const [lucas, ana, bruno] = advogados.rows.map((a) => a.id) as [string, string, string]

  const clientes = await client.query<{ id: string }>(
    `insert into clientes (nome, documento, email, telefone) values
       ('João da Silva', '123.456.789-00', 'joao@email.com', '(11) 98888-1111'),
       ('Empresa ABC Ltda', '12.345.678/0001-90', 'financeiro@abc.com.br', '(11) 3333-2222'),
       ('Maria Souza', '987.654.321-00', 'maria@email.com', '(11) 97777-3333')
     returning id`,
  )
  const [joao, abc, maria] = clientes.rows.map((c) => c.id) as [string, string, string]

  const casos = await client.query<{ id: string }>(
    `insert into casos (cliente_id, titulo, descricao, valor, status) values
       ($1, 'Ação Trabalhista', 'Reclamação trabalhista contra ex-empregador', 30000, 'ativo'),
       ($2, 'Recuperação de Crédito', 'Cobrança judicial de duplicatas', 45000, 'ativo'),
       ($3, 'Inventário', 'Inventário extrajudicial', 12000, 'ativo')
     returning id`,
    [joao, abc, maria],
  )
  const [trabalhista, credito, inventario] = casos.rows.map((c) => c.id) as [string, string, string]

  await client.query(
    `insert into caso_advogados (caso_id, advogado_id, percentual) values
       ($1, $3, 60), ($1, $4, 25), ($1, $5, 15),
       ($2, $3, 70), ($2, $4, 30)`,
    [trabalhista, credito, lucas, ana, bruno],
  )

  const contas = [
    { cliente: joao, caso: trabalhista, descricao: 'Honorários — Ação Trabalhista', total: 12000, qtd: 6, primeiro: emDias(-90) },
    {
      cliente: abc, caso: credito, descricao: 'Honorários — Recuperação de Crédito',
      total: 18000, entrada: 6000, entradaEm: emDias(-60), qtd: 4, primeiro: emDias(-45),
    },
    { cliente: maria, caso: inventario, descricao: 'Honorários — Inventário', total: 6000, qtd: 3, primeiro: emDias(-10) },
    { cliente: maria, caso: null, descricao: 'Consulta jurídica avulsa', total: 800, qtd: 1, primeiro: hoje },
  ]

  for (const c of contas) {
    const { rows } = await client.query<{ id: string }>(
      `insert into contas (cliente_id, caso_id, descricao, valor_total, forma_pagamento)
       values ($1, $2, $3, $4, 'pix') returning id`,
      [c.cliente, c.caso, c.descricao, c.total],
    )
    const conta = rows[0]!.id
    const parcelas = montarParcelas({
      valor_total: c.total,
      entrada: c.entrada,
      entrada_vencimento: c.entradaEm,
      quantidade_parcelas: c.qtd,
      primeiro_vencimento: c.primeiro,
    })
    await client.query(
      `insert into parcelas (conta_id, numero, total_parcelas, entrada, valor, valor_pago, vencimento, status, data_pagamento,
                             forma_pagamento)
       select $1, n.numero, $2, n.entrada, n.valor,
              case when n.vencimento < current_date - 20 then n.valor else 0 end,
              n.vencimento,
              case when n.vencimento < current_date - 20 then 'pago' else 'pendente' end,
              case when n.vencimento < current_date - 20 then n.vencimento else null end,
              case when n.vencimento < current_date - 20 then 'pix' else null end
       from unnest($3::int[], $4::numeric[], $5::date[], $6::bool[]) as n(numero, valor, vencimento, entrada)`,
      [
        conta,
        parcelas.length,
        parcelas.map((p) => p.numero),
        parcelas.map((p) => p.valor),
        parcelas.map((p) => p.vencimento),
        parcelas.map((p) => p.entrada),
      ],
    )
    await client.query(
      `insert into recebimentos (parcela_id, valor, data, forma_pagamento, carteira_id)
       select id, valor, data_pagamento, forma_pagamento, $2 from parcelas where conta_id = $1 and status = 'pago'`,
      [conta, bancoDoBrasil],
    )
  }

  await client.query(
    `insert into despesas (descricao, categoria, valor, dia_vencimento, inicio) values
       ('Aluguel da sala', 'Estrutura', 2400, 10, $1),
       ('Internet e telefonia', 'Estrutura', 320, 15, $1),
       ('Contador', 'Serviços', 890, 5, $1),
       ('Anuidade OAB (parcelada)', 'Impostos', 210.75, 20, $1),
       ('Assinatura do sistema jurídico', 'Software', 149.9, 28, $1)`,
    [emDias(-120)],
  )

  await client.query(
    `insert into notas (cliente_id, caso_id, autor, texto, criado_em) values
       ($1, null, 'Lucas Quadros', 'Cliente prefere contato por WhatsApp no período da tarde.', now() - interval '6 days'),
       ($1, null, 'Ana Martins', 'Enviada a cópia do contrato assinado por e-mail.', now() - interval '2 days'),
       (null, $2, 'Lucas Quadros', 'Audiência de conciliação marcada. Cliente já foi avisado.', now() - interval '3 days'),
       (null, $2, 'Lucas Quadros', 'Juntada a documentação complementar solicitada pelo juízo.', now() - interval '1 day'),
       ($1, null, 'Lucas Quadros', 'Cliente pediu que todo contato passe antes pela filha dele.', now() - interval '9 days')`,
    [joao, trabalhista],
  )
})

console.log('Dados de demonstração criados.')
await pool.end()

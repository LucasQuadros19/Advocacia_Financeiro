import type { FastifyInstance } from 'fastify'
import { consultar, consultarUm } from '../db.ts'
import { UUID, invalido, naoEncontrado, paginar, paramsId, queryPaginacao, resposta } from '../lib/http.ts'

const TEXTO_NOTA = { type: 'string', minLength: 1, maxLength: 4000 } as const

const campos = 'id, cliente_id, caso_id, autor, texto, criado_em, editado_em'

export function registrarNotas(app: FastifyInstance) {
  app.get(
    '/api/notas',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { ...queryPaginacao, cliente_id: UUID, caso_id: UUID, com_cliente: { type: 'boolean' } },
        },
      },
    },
    async (req) => {
      const { cliente_id, caso_id, com_cliente } = req.query as {
        cliente_id?: string
        caso_id?: string
        com_cliente?: boolean
      }
      if (!cliente_id === !caso_id) throw invalido('Informe cliente_id ou caso_id')
      const { pagina, limite, offset } = paginar(req.query as never)
      const linhas = await consultar(
        `select ${campos}, count(*) over () as total
         from notas
         where ($1::uuid is null or cliente_id = $1)
           and ($2::uuid is null
                or caso_id = $2
                or ($5::bool and cliente_id = (select cs.cliente_id from casos cs where cs.id = $2)))
         order by criado_em desc, id desc
         limit $3 offset $4`,
        [cliente_id ?? null, caso_id ?? null, limite, offset, com_cliente ?? false],
      )
      return resposta(linhas, pagina, limite)
    },
  )

  app.post(
    '/api/notas',
    {
      schema: {
        body: {
          type: 'object',
          required: ['texto'],
          additionalProperties: false,
          properties: { cliente_id: UUID, caso_id: UUID, texto: TEXTO_NOTA },
        },
      },
    },
    async (req, reply) => {
      const c = req.body as { cliente_id?: string; caso_id?: string; texto: string }
      if (!c.cliente_id === !c.caso_id) throw invalido('Informe o cliente ou o caso da nota')
      const texto = c.texto.trim()
      if (!texto) throw invalido('A nota não pode ficar vazia')

      const alvo = c.cliente_id
        ? await consultarUm('select id from clientes where id = $1', [c.cliente_id])
        : await consultarUm('select id from casos where id = $1', [c.caso_id])
      if (!alvo) throw naoEncontrado(c.cliente_id ? 'Cliente' : 'Caso')

      const nota = await consultarUm(
        `insert into notas (cliente_id, caso_id, autor, texto) values ($1, $2, $3, $4) returning ${campos}`,
        [c.cliente_id ?? null, c.caso_id ?? null, req.usuario!.nome, texto],
      )
      reply.code(201)
      return nota
    },
  )

  app.put(
    '/api/notas/:id',
    {
      schema: {
        params: paramsId,
        body: { type: 'object', required: ['texto'], additionalProperties: false, properties: { texto: TEXTO_NOTA } },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string }
      const texto = (req.body as { texto: string }).texto.trim()
      if (!texto) throw invalido('A nota não pode ficar vazia')
      const nota = await consultarUm(
        `update notas set texto = $2, editado_em = now() where id = $1 returning ${campos}`,
        [id, texto],
      )
      if (!nota) throw naoEncontrado('Nota')
      return nota
    },
  )

  app.delete('/api/notas/:id', { schema: { params: paramsId } }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const removida = await consultarUm('delete from notas where id = $1 returning id', [id])
    if (!removida) throw naoEncontrado('Nota')
    reply.code(204)
  })
}

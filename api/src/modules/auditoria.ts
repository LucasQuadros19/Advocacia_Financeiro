import type { FastifyInstance, FastifyRequest } from 'fastify'
import { consultar, consultarUm, pool } from '../db.ts'
import { DATA, UUID, naoEncontrado, paginar, queryPaginacao, resposta, termoBusca } from '../lib/http.ts'

type Entrada = {
  usuario?: { id: string; nome: string } | null
  acao: string
  alvo: string
  alvo_id?: string | null
  descricao: string
  metodo?: string
  rota?: string
  status?: number
  dados?: unknown
  antes?: unknown
  resposta?: unknown
  ip?: string
}

type Regra = { acao: string; alvo: string; texto: string; tabela?: string | ((params: Record<string, string>) => string) }

declare module 'fastify' {
  interface FastifyRequest {
    auditoriaAntes?: Record<string, unknown> | null
    auditoriaResposta?: string
  }
}

const TABELA_MOVIMENTO: Record<string, string> = {
  recebimento: 'recebimentos',
  manual: 'lancamentos',
  despesa: 'despesa_lancamentos',
  repasse: 'repasses',
}

const REGRAS: Record<string, Regra> = {
  'POST /api/auth/logout': { acao: 'LOGOUT', alvo: 'Acesso', texto: 'Saiu do sistema' },
  'POST /api/clientes': { acao: 'CRIAR', alvo: 'Cliente', texto: 'Cadastrou o cliente' },
  'PUT /api/clientes/:id': { acao: 'ALTERAR', alvo: 'Cliente', texto: 'Alterou o cliente', tabela: 'clientes' },
  'DELETE /api/clientes/:id': { acao: 'EXCLUIR', alvo: 'Cliente', texto: 'Excluiu o cliente', tabela: 'clientes' },
  'POST /api/casos': { acao: 'CRIAR', alvo: 'Caso', texto: 'Cadastrou o caso' },
  'PUT /api/casos/:id': { acao: 'ALTERAR', alvo: 'Caso', texto: 'Alterou o caso', tabela: 'casos' },
  'PUT /api/casos/:id/advogados': { acao: 'ALTERAR', alvo: 'Caso', texto: 'Alterou a divisão do caso', tabela: 'casos' },
  'DELETE /api/casos/:id': { acao: 'EXCLUIR', alvo: 'Caso', texto: 'Excluiu o caso', tabela: 'casos' },
  'POST /api/contas': { acao: 'CRIAR', alvo: 'Cobrança', texto: 'Criou a cobrança' },
  'PUT /api/contas/:id': { acao: 'ALTERAR', alvo: 'Cobrança', texto: 'Alterou a cobrança', tabela: 'contas' },
  'DELETE /api/contas/:id': { acao: 'EXCLUIR', alvo: 'Cobrança', texto: 'Excluiu a cobrança', tabela: 'contas' },
  'PATCH /api/parcelas/:id': { acao: 'ALTERAR', alvo: 'Parcela', texto: 'Alterou a parcela', tabela: 'parcelas' },
  'POST /api/parcelas/:id/pagamento': { acao: 'BAIXA', alvo: 'Parcela', texto: 'Registrou recebimento', tabela: 'parcelas' },
  'DELETE /api/recebimentos/:id': { acao: 'ESTORNO', alvo: 'Parcela', texto: 'Estornou recebimento', tabela: 'recebimentos' },
  'POST /api/advogados': { acao: 'CRIAR', alvo: 'Advogado', texto: 'Cadastrou o advogado' },
  'PUT /api/advogados/:id': { acao: 'ALTERAR', alvo: 'Advogado', texto: 'Alterou o advogado', tabela: 'advogados' },
  'PUT /api/advogados/:id/principal': {
    acao: 'ALTERAR', alvo: 'Advogado', texto: 'Definiu como advogado principal', tabela: 'advogados',
  },
  'DELETE /api/advogados/:id': { acao: 'EXCLUIR', alvo: 'Advogado', texto: 'Excluiu o advogado', tabela: 'advogados' },
  'POST /api/notas': { acao: 'CRIAR', alvo: 'Nota', texto: 'Escreveu uma nota' },
  'PUT /api/notas/:id': { acao: 'ALTERAR', alvo: 'Nota', texto: 'Editou uma nota', tabela: 'notas' },
  'DELETE /api/notas/:id': { acao: 'EXCLUIR', alvo: 'Nota', texto: 'Excluiu uma nota', tabela: 'notas' },
  'POST /api/despesas': { acao: 'CRIAR', alvo: 'Conta programada', texto: 'Cadastrou a conta programada' },
  'PUT /api/despesas/:id': { acao: 'ALTERAR', alvo: 'Conta programada', texto: 'Alterou a conta programada', tabela: 'despesas' },
  'DELETE /api/despesas/:id': {
    acao: 'EXCLUIR', alvo: 'Conta programada', texto: 'Excluiu a conta programada', tabela: 'despesas',
  },
  'PATCH /api/despesas/lancamentos/:id': {
    acao: 'ALTERAR', alvo: 'Conta programada', texto: 'Ajustou um mês da conta programada', tabela: 'despesa_lancamentos',
  },
  'POST /api/despesas/lancamentos/:id/pagamento': {
    acao: 'BAIXA', alvo: 'Conta programada', texto: 'Deu baixa na conta programada', tabela: 'despesa_lancamentos',
  },
  'POST /api/despesas/lancamentos/:id/adiar': {
    acao: 'ADIAR', alvo: 'Conta programada', texto: 'Adiou a conta para o mês seguinte', tabela: 'despesa_lancamentos',
  },
  'DELETE /api/despesas/lancamentos/:id/pagamento': {
    acao: 'ESTORNO', alvo: 'Conta programada', texto: 'Estornou o pagamento da conta programada', tabela: 'despesa_lancamentos',
  },
  'POST /api/caixa/lancamentos': { acao: 'CRIAR', alvo: 'Caixa', texto: 'Lançou no caixa' },
  'DELETE /api/caixa/lancamentos/:id': { acao: 'EXCLUIR', alvo: 'Caixa', texto: 'Excluiu lançamento do caixa', tabela: 'lancamentos' },
  'POST /api/caixa/transferencias': { acao: 'CRIAR', alvo: 'Transferência', texto: 'Transferiu entre contas' },
  'DELETE /api/caixa/transferencias/:id': {
    acao: 'EXCLUIR', alvo: 'Transferência', texto: 'Excluiu a transferência', tabela: 'transferencias',
  },
  'PATCH /api/caixa/movimentos/:origem/:id': {
    acao: 'ALTERAR', alvo: 'Caixa', texto: 'Trocou a conta de um movimento', tabela: (p) => TABELA_MOVIMENTO[p.origem ?? ''] ?? '',
  },
  'POST /api/repasses/:id/pagamento': { acao: 'BAIXA', alvo: 'Repasse', texto: 'Pagou o repasse', tabela: 'repasses' },
  'DELETE /api/repasses/:id/pagamento': { acao: 'ESTORNO', alvo: 'Repasse', texto: 'Estornou o repasse', tabela: 'repasses' },
  'POST /api/repasses/pagamento-lote': { acao: 'BAIXA', alvo: 'Repasse', texto: 'Pagou repasses em lote' },
  'PUT /api/escritorio': { acao: 'ALTERAR', alvo: 'Escritório', texto: 'Alterou os dados do escritório' },
  'POST /api/carteiras': { acao: 'CRIAR', alvo: 'Banco', texto: 'Cadastrou a conta' },
  'PUT /api/carteiras/:id': { acao: 'ALTERAR', alvo: 'Banco', texto: 'Alterou a conta', tabela: 'carteiras' },
  'DELETE /api/carteiras/:id': { acao: 'EXCLUIR', alvo: 'Banco', texto: 'Excluiu a conta', tabela: 'carteiras' },
  'POST /api/usuarios': { acao: 'CRIAR', alvo: 'Usuário', texto: 'Cadastrou o usuário' },
  'PUT /api/usuarios/:id': { acao: 'ALTERAR', alvo: 'Usuário', texto: 'Alterou o usuário', tabela: 'usuarios' },
  'PUT /api/usuarios/:id/senha': { acao: 'ALTERAR', alvo: 'Usuário', texto: 'Trocou a senha do usuário', tabela: 'usuarios' },
}

const MUTACOES = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export async function registrarAuditoria(e: Entrada) {
  await pool.query(
    `insert into auditoria (usuario_id, usuario_nome, acao, alvo, alvo_id, descricao, metodo, rota, status, dados, antes,
                            resposta, ip)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      e.usuario?.id ?? null,
      e.usuario?.nome ?? null,
      e.acao,
      e.alvo,
      e.alvo_id ?? null,
      e.descricao.slice(0, 300),
      e.metodo ?? null,
      e.rota ?? null,
      e.status ?? null,
      e.dados === undefined ? null : JSON.stringify(e.dados),
      e.antes === undefined ? null : JSON.stringify(e.antes),
      e.resposta === undefined ? null : JSON.stringify(e.resposta),
      e.ip ?? null,
    ],
  )
}

function semSenha(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(semSenha)
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([chave, v]) => [chave, /senha/i.test(chave) ? '••••••' : semSenha(v)]),
    )
  }
  return valor
}

const lerJson = (texto?: string) => {
  try {
    return texto ? (JSON.parse(texto) as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

const chaveDaRota = (req: FastifyRequest) => `${req.method} ${req.routeOptions.url ?? req.url.split('?')[0]}`

function descrever(regra: Regra, dados?: Record<string, unknown>, antes?: Record<string, unknown> | null, saida?: Record<string, unknown>) {
  const nome = [antes, dados, saida]
    .map((o) => o?.nome ?? o?.titulo ?? o?.descricao)
    .find((v) => typeof v === 'string' && v)
  const valor = dados?.valor ?? dados?.valor_total
  return [regra.texto, nome ? `“${nome}”` : '', typeof valor === 'number' && valor > 0 ? `de ${brl.format(valor)}` : '']
    .filter(Boolean)
    .join(' ')
}

export function registrarHooksAuditoria(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    if (!MUTACOES.has(req.method) || !req.usuario) return
    const regra = REGRAS[chaveDaRota(req)]
    const params = req.params as Record<string, string>
    const tabela = typeof regra?.tabela === 'function' ? regra.tabela(params) : regra?.tabela
    if (!tabela || !params.id) return
    const linha = await consultarUm<{ linha: Record<string, unknown> }>(
      `select to_jsonb(t) - 'senha_hash' as linha from ${tabela} t where t.id = $1`,
      [params.id],
    )
    req.auditoriaAntes = linha?.linha ?? null
  })

  app.addHook('onSend', async (req, _reply, payload) => {
    if (MUTACOES.has(req.method) && typeof payload === 'string' && payload.length < 20000) req.auditoriaResposta = payload
    return payload
  })

  app.addHook('onResponse', async (req, reply) => {
    if (!MUTACOES.has(req.method) || !req.url.startsWith('/api/')) return
    const chave = chaveDaRota(req)
    if (chave === 'POST /api/auth/login') return

    const regra = REGRAS[chave] ?? { acao: 'ALTERAR', alvo: 'Sistema', texto: chave }
    const dados = semSenha(req.body) as Record<string, unknown> | undefined
    const saida = lerJson(req.auditoriaResposta)
    const status = reply.statusCode
    const params = (req.params ?? {}) as Record<string, string>
    const negado = status === 401 || status === 403 || status === 429

    await registrarAuditoria({
      usuario: req.usuario,
      acao: negado ? 'NEGADO' : regra.acao,
      alvo: regra.alvo,
      alvo_id: params.id ?? (typeof saida?.id === 'string' ? saida.id : null),
      descricao: negado
        ? `Tentativa sem permissão: ${regra.texto}`
        : descrever(regra, dados, req.auditoriaAntes, status < 400 ? saida : undefined),
      metodo: req.method,
      rota: req.url.split('?')[0],
      status,
      dados,
      antes: req.auditoriaAntes ?? undefined,
      resposta: saida ? semSenha(saida) : undefined,
      ip: req.ip,
    }).catch((erro) => req.log.error(erro, 'falha ao gravar auditoria'))
  })
}

export function registrarAuditoriaRotas(app: FastifyInstance) {
  app.get(
    '/api/auditoria',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            ...queryPaginacao,
            de: DATA,
            ate: DATA,
            usuario_id: UUID,
            acao: { type: 'string', maxLength: 20 },
            alvo: { type: 'string', maxLength: 40 },
            busca: { type: 'string', maxLength: 100 },
            recusadas: { type: 'boolean' },
          },
        },
      },
    },
    async (req) => {
      const q = req.query as {
        de?: string
        ate?: string
        usuario_id?: string
        acao?: string
        alvo?: string
        busca?: string
        recusadas?: boolean
      }
      const { pagina, limite, offset } = paginar(req.query as never)
      const linhas = await consultar(
        `select id, usuario_id, usuario_nome, acao, alvo, alvo_id, descricao, status, criado_em,
                count(*) over () as total
         from auditoria
         where ($1::date is null or criado_em >= $1::date)
           and ($2::date is null or criado_em < $2::date + 1)
           and ($3::uuid is null or usuario_id = $3)
           and ($4::text is null or acao = $4)
           and ($5::text is null or alvo = $5)
           and ($6::text is null or descricao ilike $6 or usuario_nome ilike $6)
           and (not $7::bool or status >= 400)
         order by criado_em desc, id desc
         limit $8 offset $9`,
        [
          q.de ?? null, q.ate ?? null, q.usuario_id ?? null, q.acao ?? null, q.alvo ?? null,
          termoBusca(q.busca), q.recusadas ?? false, limite, offset,
        ],
      )
      return resposta(linhas, pagina, limite)
    },
  )

  app.get('/api/auditoria/filtros', async () => {
    const [acoes, alvos, usuarios] = await Promise.all([
      consultar<{ acao: string }>('select distinct acao from auditoria order by acao'),
      consultar<{ alvo: string }>('select distinct alvo from auditoria order by alvo'),
      consultar('select id, nome from usuarios order by nome limit 100'),
    ])
    return { acoes: acoes.map((a) => a.acao), alvos: alvos.map((a) => a.alvo), usuarios }
  })

  app.get(
    '/api/auditoria/:id',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } } },
    async (req) => {
      const { id } = req.params as { id: number }
      const registro = await consultarUm(
        `select id, usuario_id, usuario_nome, acao, alvo, alvo_id, descricao, metodo, rota, status, dados, antes, resposta,
                ip, criado_em
         from auditoria where id = $1`,
        [id],
      )
      if (!registro) throw naoEncontrado('Registro')
      return registro
    },
  )
}

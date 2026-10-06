import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { consultarUm } from './db.ts'
import { ApiError, UUID } from './lib/http.ts'
import { conferirSenha, gerarHash } from './lib/senha.ts'
import { registrarAuditoria } from './modules/auditoria.ts'

export type Usuario = { id: string; nome: string; login: string }

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: Usuario
  }
}

const COOKIE = 'sessao'
const DURACAO_MS = 12 * 60 * 60 * 1000
const MAX_TENTATIVAS = 5
const JANELA_MS = 15 * 60 * 1000
const FORMATO_UUID = new RegExp(UUID.pattern)

function exigir(nome: string): string {
  const valor = process.env[nome]
  if (!valor) throw new Error(`Variável de ambiente ${nome} não definida (copie .env.example para .env)`)
  return valor
}

function iguais(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest()
  const db = createHash('sha256').update(b).digest()
  return timingSafeEqual(da, db)
}

const assinar = (conteudo: string, segredo: string) => createHmac('sha256', segredo).update(conteudo).digest('hex')

export function cookieDeSessao(usuarioId: string, versao: number) {
  const segredo = exigir('SESSION_SECRET')
  const conteudo = `${usuarioId}.${versao}.${Date.now() + DURACAO_MS}`
  return [
    `${COOKIE}=${conteudo}.${assinar(conteudo, segredo)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${DURACAO_MS / 1000}`,
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

function lerCookie(cabecalho: string | undefined, nome: string): string | undefined {
  return cabecalho
    ?.split(';')
    .map((p) => p.trim().split('='))
    .find(([chave]) => chave === nome)?.[1]
}

function lerSessao(req: FastifyRequest, segredo: string) {
  const [id, versao, expira, assinatura] = lerCookie(req.headers.cookie, COOKIE)?.split('.') ?? []
  if (!id || !versao || !expira || !assinatura || !FORMATO_UUID.test(id)) return null
  if (!(Number(expira) > Date.now())) return null
  if (!iguais(assinatura, assinar(`${id}.${versao}.${expira}`, segredo))) return null
  return { id, versao: Number(versao) }
}

const tentativas = new Map<string, { contador: number; ate: number }>()

function registrarTentativa(ip: string): boolean {
  const agora = Date.now()
  if (tentativas.size > 1000) {
    for (const [chave, valor] of tentativas) if (valor.ate < agora) tentativas.delete(chave)
  }
  const atual = tentativas.get(ip)
  if (!atual || atual.ate < agora) {
    tentativas.set(ip, { contador: 1, ate: agora + JANELA_MS })
    return true
  }
  atual.contador += 1
  return atual.contador <= MAX_TENTATIVAS
}

export function registrarAuth(app: FastifyInstance) {
  const segredo = exigir('SESSION_SECRET')
  const hashFalso = gerarHash(randomBytes(16).toString('hex'))

  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return
    const rota = req.url.split('?')[0]
    if (rota === '/api/auth/login' || rota === '/api/saude') return
    const sessao = lerSessao(req, segredo)
    const usuario = sessao
      ? await consultarUm<Usuario>(
          'select id, nome, login from usuarios where id = $1 and ativo and versao_sessao = $2',
          [sessao.id, sessao.versao],
        )
      : undefined
    if (!usuario) throw new ApiError(401, 'Não autenticado')
    req.usuario = usuario
  })

  app.post(
    '/api/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['login', 'senha'],
          additionalProperties: false,
          properties: { login: { type: 'string', maxLength: 60 }, senha: { type: 'string', maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      const { login, senha } = req.body as { login: string; senha: string }
      if (!registrarTentativa(req.ip)) throw new ApiError(429, 'Muitas tentativas. Aguarde alguns minutos.')

      const usuario = await consultarUm<Usuario & { senha_hash: string; ativo: boolean; versao_sessao: number }>(
        'select id, nome, login, senha_hash, ativo, versao_sessao from usuarios where lower(login) = lower($1)',
        [login.trim()],
      )
      const senhaCerta = await conferirSenha(senha, usuario?.senha_hash ?? (await hashFalso))
      if (!usuario || !senhaCerta || !usuario.ativo) {
        await registrarAuditoria({
          acao: 'NEGADO',
          alvo: 'Acesso',
          alvo_id: usuario?.id,
          descricao: `Login recusado para "${login.trim().slice(0, 60)}"${usuario && senhaCerta ? ' (usuário desativado)' : ''}`,
          metodo: 'POST',
          rota: '/api/auth/login',
          status: 401,
          ip: req.ip,
        })
        throw new ApiError(401, 'Usuário ou senha inválidos')
      }

      tentativas.delete(req.ip)
      await consultarUm('update usuarios set ultimo_acesso = now() where id = $1 returning id', [usuario.id])
      await registrarAuditoria({
        usuario,
        acao: 'LOGIN',
        alvo: 'Acesso',
        alvo_id: usuario.id,
        descricao: 'Entrou no sistema',
        metodo: 'POST',
        rota: '/api/auth/login',
        status: 200,
        ip: req.ip,
      })
      reply.header('set-cookie', cookieDeSessao(usuario.id, usuario.versao_sessao))
      return { usuario: { id: usuario.id, nome: usuario.nome, login: usuario.login } }
    },
  )

  app.post('/api/auth/logout', async (req, reply) => {
    await consultarUm('update usuarios set versao_sessao = versao_sessao + 1 where id = $1 returning id', [req.usuario!.id])
    reply.header('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`)
    return { autenticado: false }
  })

  app.get('/api/auth/sessao', async (req) => ({ usuario: req.usuario }))
}

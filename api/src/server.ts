import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import type { FastifyError } from 'fastify'
import estaticos from '@fastify/static'
import { registrarAuth } from './auth.ts'
import { registrarAdvogados } from './modules/advogados.ts'
import { registrarAuditoriaRotas, registrarHooksAuditoria } from './modules/auditoria.ts'
import { registrarCaixa } from './modules/caixa.ts'
import { registrarCarteiras } from './modules/carteiras.ts'
import { registrarBusca } from './modules/busca.ts'
import { registrarCasos } from './modules/casos.ts'
import { registrarClientes } from './modules/clientes.ts'
import { registrarContas } from './modules/contas.ts'
import { registrarDashboard } from './modules/dashboard.ts'
import { registrarDespesas } from './modules/despesas.ts'
import { registrarDocumentos } from './modules/documentos.ts'
import { registrarExportar } from './modules/exportar.ts'
import { registrarHistorico } from './modules/historico.ts'
import { registrarNotas } from './modules/notas.ts'
import { registrarUsuarios } from './modules/usuarios.ts'

const ERROS_PG: Record<string, [number, string]> = {
  '23505': [409, 'Registro duplicado'],
  '23503': [409, 'Registro está vinculado a outros dados'],
  '23514': [400, 'Dados fora das regras do sistema'],
}

export async function criarApp() {
  const producao = process.env.NODE_ENV === 'production'
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === 'test' ? 'silent' : 'info' },
    bodyLimit: 256 * 1024,
  })

  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff')
    reply.header('x-frame-options', 'DENY')
    reply.header('referrer-policy', 'same-origin')
    reply.header(
      'content-security-policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'",
    )
  })

  app.setErrorHandler((erro: FastifyError, req, reply) => {
    const mapeado = erro.code ? ERROS_PG[erro.code] : undefined
    const status = mapeado?.[0] ?? erro.statusCode ?? 500
    if (status >= 500) req.log.error(erro)
    const mensagem = mapeado?.[1] ?? (status >= 500 && producao ? 'Erro interno' : erro.message)
    reply.code(status).send({ erro: mensagem })
  })

  app.get('/api/saude', async () => ({ ok: true }))

  registrarAuth(app)
  registrarHooksAuditoria(app)
  registrarClientes(app)
  registrarContas(app)
  registrarCasos(app)
  registrarAdvogados(app)
  registrarDashboard(app)
  registrarDespesas(app)
  registrarCaixa(app)
  registrarCarteiras(app)
  registrarNotas(app)
  registrarUsuarios(app)
  registrarAuditoriaRotas(app)
  registrarHistorico(app)
  registrarDocumentos(app)
  registrarExportar(app)
  registrarBusca(app)

  const publico = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
  if (existsSync(publico)) {
    await app.register(estaticos, { root: publico })
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/') ? reply.code(404).send({ erro: 'Rota não encontrada' }) : reply.sendFile('index.html'),
    )
  }

  return app
}

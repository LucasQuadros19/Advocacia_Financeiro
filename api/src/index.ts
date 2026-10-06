import { migrar } from './migrate.ts'
import { criarApp } from './server.ts'

const novas = await migrar()
const app = await criarApp()
if (novas.length) app.log.info(`Migrações aplicadas: ${novas.join(', ')}`)

await app.listen({ port: Number(process.env.PORT ?? 3333), host: '0.0.0.0' })

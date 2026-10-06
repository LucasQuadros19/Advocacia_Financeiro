import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derivar = promisify(scrypt) as (senha: string, sal: Buffer, tamanho: number) => Promise<Buffer>

export async function gerarHash(senha: string): Promise<string> {
  const sal = randomBytes(16)
  const chave = await derivar(senha, sal, 64)
  return `scrypt$${sal.toString('hex')}$${chave.toString('hex')}`
}

export async function conferirSenha(senha: string, hash: string): Promise<boolean> {
  const [esquema, sal, chave] = hash.split('$')
  if (esquema !== 'scrypt' || !sal || !chave) return false
  const esperada = Buffer.from(chave, 'hex')
  const calculada = await derivar(senha, Buffer.from(sal, 'hex'), esperada.length)
  return timingSafeEqual(calculada, esperada)
}

export const senhaAleatoria = () => randomBytes(9).toString('base64url')

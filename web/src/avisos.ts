import { ref } from 'vue'

export type Aviso = { id: number; texto: string; tom: 'sucesso' | 'erro' }

export const avisos = ref<Aviso[]>([])
let sequencia = 0

export function avisar(texto: string, tom: Aviso['tom'] = 'sucesso') {
  const id = (sequencia += 1)
  avisos.value = [...avisos.value, { id, texto, tom }]
  setTimeout(() => descartar(id), 4500)
}

export const descartar = (id: number) => {
  avisos.value = avisos.value.filter((a) => a.id !== id)
}

export type Confirmacao = {
  titulo: string
  texto: string
  confirmar: string
  perigo: boolean
  responder: (resposta: boolean) => void
}

export const confirmacao = ref<Confirmacao>()

export function confirmar(titulo: string, texto: string, opcoes: { confirmar?: string; perigo?: boolean } = {}) {
  return new Promise<boolean>((responder) => {
    confirmacao.value = {
      titulo,
      texto,
      confirmar: opcoes.confirmar ?? 'Confirmar',
      perigo: opcoes.perigo ?? false,
      responder: (resposta) => {
        confirmacao.value = undefined
        responder(resposta)
      },
    }
  })
}

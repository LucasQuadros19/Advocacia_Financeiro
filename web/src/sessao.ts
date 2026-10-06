import { ref } from 'vue'

export type Usuario = { id: string; nome: string; login: string }

export const usuario = ref<Usuario | null>(null)

export async function carregarSessao() {
  const resposta = await fetch('/api/auth/sessao').catch(() => undefined)
  usuario.value = resposta?.ok ? ((await resposta.json()) as { usuario: Usuario }).usuario : null
  return usuario.value
}

import { ref } from 'vue'
import { api } from './api.ts'

export type Carteira = { id: string; nome: string; tipo: 'banco' | 'dinheiro'; ativa: boolean }

export const carteiras = ref<Carteira[]>([])

export async function carregarCarteiras() {
  carteiras.value = (await api.get<{ dados: Carteira[] }>('/carteiras').catch(() => ({ dados: [] }))).dados
}

export async function criarCarteira(nome: string, tipo: Carteira['tipo']) {
  const nova = await api.post<Carteira>('/carteiras', { nome, tipo })
  carteiras.value = [...carteiras.value, nova]
  return nova
}

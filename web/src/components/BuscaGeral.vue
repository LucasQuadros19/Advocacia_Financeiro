<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icone from './Icone.vue'
import { api } from '../api.ts'
import { data, moeda } from '../format.ts'

type Resultado = {
  clientes: { id: string; nome: string; documento: string | null }[]
  casos: { id: string; titulo: string; status: string; cliente_nome: string }[]
  cobrancas: { id: string; descricao: string; cliente_id: string; cliente_nome: string; caso_id: string | null }[]
  valores: {
    id: string; tipo: string; origem: string; descricao: string; contraparte: string; cliente_id: string | null
    caso_id: string | null; valor: string; valor_parcela: string | null; status: string; data: string
  }[]
}
type Item = { grupo: string; titulo: string; detalhe: string; para: string; icone: string }

const router = useRouter()
const aberta = ref(false)
const termo = ref('')
const resultado = ref<Resultado>()
const buscando = ref(false)
const erro = ref('')
const destaque = ref(0)
const campo = useTemplateRef<HTMLInputElement>('campo')
const mac = navigator.platform.toUpperCase().includes('MAC')
let temporizador: ReturnType<typeof setTimeout>
let pedido = 0

const itens = computed<Item[]>(() => {
  const r = resultado.value
  if (!r) return []
  return [
    ...r.clientes.map((c) => ({
      grupo: 'Clientes', titulo: c.nome, detalhe: c.documento ?? '', para: `/clientes/${c.id}`, icone: 'clientes',
    })),
    ...r.casos.map((c) => ({
      grupo: 'Casos', titulo: c.titulo, detalhe: c.cliente_nome, para: `/casos/${c.id}`, icone: 'casos',
    })),
    ...r.cobrancas.map((c) => ({
      grupo: 'Cobranças',
      titulo: c.descricao,
      detalhe: c.cliente_nome,
      para: c.caso_id ? `/casos/${c.caso_id}` : `/clientes/${c.cliente_id}`,
      icone: 'recebimentos',
    })),
    ...r.valores.map((v) => ({
      grupo: 'Valores',
      titulo: `${moeda(v.valor_parcela ?? v.valor)} · ${v.descricao}`,
      detalhe: `${v.contraparte} · ${data(v.data)} · ${v.status === 'pago' ? 'pago' : 'em aberto'}`,
      para: v.caso_id ? `/casos/${v.caso_id}` : v.cliente_id ? `/clientes/${v.cliente_id}` : '/caixa',
      icone: 'caixa',
    })),
  ]
})

watch(termo, (valor) => {
  clearTimeout(temporizador)
  const busca = valor.trim()
  erro.value = ''
  if (busca.length < 2) {
    resultado.value = undefined
    buscando.value = false
    return
  }
  buscando.value = true
  temporizador = setTimeout(async () => {
    const meu = (pedido += 1)
    try {
      const r = await api.get<Resultado>(`/busca?q=${encodeURIComponent(busca)}`)
      if (meu !== pedido) return
      resultado.value = r
      destaque.value = 0
    } catch (e) {
      if (meu === pedido) erro.value = (e as Error).message
    } finally {
      if (meu === pedido) buscando.value = false
    }
  }, 250)
})

async function abrir() {
  aberta.value = true
  await nextTick()
  campo.value?.focus()
  campo.value?.select()
}

function fechar() {
  aberta.value = false
}

function ir(item?: Item) {
  if (!item) return
  fechar()
  termo.value = ''
  router.push(item.para)
}

function navegar(evento: KeyboardEvent) {
  if (evento.key === 'Escape') return fechar()
  if (!itens.value.length) return
  if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
    evento.preventDefault()
    const passo = evento.key === 'ArrowDown' ? 1 : -1
    destaque.value = (destaque.value + passo + itens.value.length) % itens.value.length
    document.getElementById(`busca-item-${destaque.value}`)?.scrollIntoView({ block: 'nearest' })
  } else if (evento.key === 'Enter') {
    evento.preventDefault()
    ir(itens.value[destaque.value])
  }
}

function atalho(evento: KeyboardEvent) {
  if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
    evento.preventDefault()
    if (aberta.value) fechar()
    else abrir()
  }
}

onMounted(() => document.addEventListener('keydown', atalho))
onUnmounted(() => {
  document.removeEventListener('keydown', atalho)
  clearTimeout(temporizador)
})
</script>

<template>
  <button type="button" class="gatilho-busca" @click="abrir">
    <Icone nome="busca" />
    <span>Buscar cliente, caso, cobrança ou valor…</span>
    <kbd>{{ mac ? '⌘' : 'Ctrl' }} K</kbd>
  </button>

  <Teleport to="body">
    <div v-if="aberta" class="fundo-modal busca-fundo" @click.self="fechar">
      <div class="paleta" role="dialog" aria-modal="true" aria-label="Busca geral">
        <div class="paleta-campo">
          <Icone nome="busca" />
          <input
            ref="campo"
            v-model="termo"
            type="search"
            placeholder="Nome, CPF/CNPJ, título do caso, cobrança ou valor (ex.: 1.500,00)"
            aria-label="Buscar"
            role="combobox"
            aria-controls="busca-resultados"
            :aria-expanded="itens.length > 0"
            :aria-activedescendant="itens.length ? `busca-item-${destaque}` : undefined"
            autocomplete="off"
            maxlength="100"
            @keydown="navegar"
          />
          <kbd>Esc</kbd>
        </div>
        <div class="paleta-corpo">
          <p v-if="termo.trim().length < 2" class="paleta-dica">Digite pelo menos 2 letras. Setas para escolher, Enter para abrir.</p>
          <p v-else-if="buscando && !resultado" class="paleta-dica">Buscando…</p>
          <p v-else-if="erro" class="paleta-dica erro">{{ erro }}</p>
          <p v-else-if="resultado && !itens.length" class="paleta-dica">Nada encontrado para “{{ termo.trim() }}”.</p>
          <ul v-else id="busca-resultados" role="listbox">
            <template v-for="(item, i) in itens" :key="`${item.grupo}-${item.para}-${i}`">
              <li v-if="i === 0 || itens[i - 1]!.grupo !== item.grupo" class="paleta-grupo" role="presentation">
                {{ item.grupo }}
              </li>
              <li
                :id="`busca-item-${i}`"
                role="option"
                :aria-selected="i === destaque"
                :class="{ ativo: i === destaque }"
                @mousemove="destaque = i"
                @click="ir(item)"
              >
                <Icone :nome="item.icone" />
                <span class="paleta-texto">
                  <strong>{{ item.titulo }}</strong>
                  <span v-if="item.detalhe">{{ item.detalhe }}</span>
                </span>
                <Icone nome="proximo" class="paleta-seta" />
              </li>
            </template>
          </ul>
        </div>
      </div>
    </div>
  </Teleport>
</template>

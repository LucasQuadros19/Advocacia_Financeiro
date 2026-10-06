<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import Icone from './Icone.vue'
import { api, type Pagina } from '../api.ts'
import { iniciais } from '../format.ts'

type Cliente = { id: string; nome: string; documento: string | null }

const props = defineProps<{ modelValue: string; id: string }>()
const emit = defineEmits<{ 'update:modelValue': [id: string] }>()

const termo = ref('')
const resultados = ref<Cliente[]>([])
const selecionado = ref<Cliente>()
const buscando = ref(false)
const buscou = ref(false)
const destaque = ref(-1)
const campo = useTemplateRef<HTMLInputElement>('campo')
let temporizador: ReturnType<typeof setTimeout>

watch(
  () => props.modelValue,
  async (id) => {
    if (!id) return (selecionado.value = undefined)
    if (selecionado.value?.id === id) return
    selecionado.value = await api.get<Cliente>(`/clientes/${id}`).catch(() => undefined)
  },
  { immediate: true },
)

watch(termo, (valor) => {
  clearTimeout(temporizador)
  const busca = valor.trim()
  destaque.value = -1
  if (busca.length < 2) {
    resultados.value = []
    buscando.value = false
    buscou.value = false
    return
  }
  buscando.value = true
  temporizador = setTimeout(async () => {
    try {
      const pagina = await api.get<Pagina<Cliente>>(`/clientes?limite=8&busca=${encodeURIComponent(busca)}`)
      resultados.value = pagina.dados
      destaque.value = pagina.dados.length ? 0 : -1
      buscou.value = true
    } catch {
      resultados.value = []
    } finally {
      buscando.value = false
    }
  }, 250)
})

function escolher(cliente: Cliente) {
  selecionado.value = cliente
  emit('update:modelValue', cliente.id)
  termo.value = ''
  resultados.value = []
  buscou.value = false
}

async function trocar() {
  selecionado.value = undefined
  emit('update:modelValue', '')
  await nextTick()
  campo.value?.focus()
}

function navegar(evento: KeyboardEvent) {
  if (!resultados.value.length) return
  if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
    evento.preventDefault()
    const passo = evento.key === 'ArrowDown' ? 1 : -1
    destaque.value = (destaque.value + passo + resultados.value.length) % resultados.value.length
  } else if (evento.key === 'Enter') {
    evento.preventDefault()
    const alvo = resultados.value[destaque.value]
    if (alvo) escolher(alvo)
  } else if (evento.key === 'Escape') {
    resultados.value = []
    buscou.value = false
  }
}

defineExpose({ focar: () => campo.value?.focus() })
onBeforeUnmount(() => clearTimeout(temporizador))
</script>

<template>
  <div v-if="selecionado" class="cliente-escolhido">
    <span class="inicial">{{ iniciais(selecionado.nome) }}</span>
    <div>
      <span class="titulo-celula">{{ selecionado.nome }}</span>
      <div class="sub-celula">{{ selecionado.documento ?? 'sem documento' }}</div>
    </div>
    <button type="button" class="botao pequeno" @click="trocar">Trocar</button>
  </div>

  <div v-else class="autocomplete">
    <div class="busca">
      <Icone nome="busca" />
      <input
        :id="id"
        ref="campo"
        v-model="termo"
        type="search"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="resultados.length > 0"
        aria-controls="lista-clientes"
        placeholder="Digite o nome ou o CPF/CNPJ"
        @keydown="navegar"
      />
    </div>

    <ul v-if="resultados.length" id="lista-clientes" class="sugestoes" role="listbox">
      <li
        v-for="(cliente, indice) in resultados"
        :key="cliente.id"
        role="option"
        :aria-selected="indice === destaque"
        :class="{ destaque: indice === destaque }"
        @mouseenter="destaque = indice"
        @click="escolher(cliente)"
      >
        <span class="inicial">{{ iniciais(cliente.nome) }}</span>
        <div>
          <span class="titulo-celula">{{ cliente.nome }}</span>
          <div class="sub-celula">{{ cliente.documento ?? 'sem documento' }}</div>
        </div>
      </li>
    </ul>

    <span v-if="buscando" class="dica">Procurando…</span>
    <span v-else-if="buscou && !resultados.length" class="dica">
      Nenhum cliente encontrado. Cadastre um novo no botão ao lado.
    </span>
  </div>
</template>

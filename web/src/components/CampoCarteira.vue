<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
import Icone from './Icone.vue'
import { carregarCarteiras, carteiras, criarCarteira } from '../carteiras.ts'

const NOVA = '__nova'

const props = defineProps<{ id: string; rotulo: string; forma?: string; excluir?: string }>()
const modelo = defineModel<string>({ required: true })

const carregou = ref(false)
const escolhida = ref(Boolean(modelo.value))
const criando = ref(false)
const nova = reactive({ nome: '', tipo: 'banco' as 'banco' | 'dinheiro', salvando: false, erro: '' })
const campoNome = useTemplateRef<HTMLInputElement>('campoNome')

const opcoes = computed(() => carteiras.value.filter((c) => c.ativa && c.id !== props.excluir))
const selecionada = computed({
  get: () => modelo.value,
  set: (valor: string) => {
    if (valor === NOVA) return abrirCriacao()
    escolhida.value = true
    modelo.value = valor
  },
})

function sugerir() {
  if (escolhida.value && opcoes.value.some((c) => c.id === modelo.value)) return
  const tipo = props.forma === 'dinheiro' ? 'dinheiro' : 'banco'
  modelo.value = (opcoes.value.find((c) => c.tipo === tipo) ?? opcoes.value[0])?.id ?? ''
}

async function abrirCriacao() {
  Object.assign(nova, { nome: '', tipo: props.forma === 'dinheiro' ? 'dinheiro' : 'banco', erro: '' })
  criando.value = true
  await nextTick()
  campoNome.value?.focus()
}

async function cadastrar() {
  if (!nova.nome.trim()) return (nova.erro = 'Dê um nome para a conta.')
  nova.salvando = true
  nova.erro = ''
  try {
    const criada = await criarCarteira(nova.nome.trim(), nova.tipo)
    escolhida.value = true
    modelo.value = criada.id
    criando.value = false
  } catch (e) {
    nova.erro = (e as Error).message
  } finally {
    nova.salvando = false
  }
}

onMounted(async () => {
  await carregarCarteiras()
  carregou.value = true
  sugerir()
})
watch(() => [props.forma, props.excluir], sugerir)
</script>

<template>
  <div class="campo">
    <label :for="id">{{ rotulo }}</label>
    <select v-if="opcoes.length && !criando" :id="id" v-model="selecionada" required>
      <option v-for="c in opcoes" :key="c.id" :value="c.id">
        {{ c.nome }}{{ c.tipo === 'dinheiro' ? ' (em espécie)' : '' }}
      </option>
      <option :value="NOVA">+ Cadastrar nova conta…</option>
    </select>

    <div v-else-if="carregou" class="nova-carteira">
      <p v-if="!opcoes.length" class="dica">
        Nenhum banco cadastrado ainda. Cadastre agora para saber o saldo de cada conta.
      </p>
      <div class="linha-campo">
        <input
          :id="id"
          ref="campoNome"
          v-model="nova.nome"
          maxlength="60"
          placeholder="Ex.: Banco do Brasil, Nubank, Dinheiro"
          aria-label="Nome da nova conta"
          @keydown.enter.prevent="cadastrar"
        />
        <select v-model="nova.tipo" aria-label="Tipo da nova conta" style="max-width: 150px">
          <option value="banco">Banco</option>
          <option value="dinheiro">Dinheiro</option>
        </select>
        <button type="button" class="botao" :disabled="nova.salvando" @click="cadastrar">
          <Icone nome="mais" /> {{ nova.salvando ? 'Salvando…' : 'Cadastrar' }}
        </button>
        <button v-if="opcoes.length" type="button" class="botao icone" aria-label="Cancelar" @click="criando = false">
          <Icone nome="fechar" />
        </button>
      </div>
      <span v-if="nova.erro" class="dica" style="color: var(--erro)">{{ nova.erro }}</span>
    </div>
  </div>
</template>

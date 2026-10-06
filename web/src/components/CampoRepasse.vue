<script setup lang="ts">
import { computed, watch } from 'vue'
import Distribuicao from './Distribuicao.vue'
import Icone from './Icone.vue'
import { moeda } from '../format.ts'
import type { Repasse } from '../distribuicao.ts'

export type { Repasse }

const props = defineProps<{
  valor: number
  advogados: { id: string; nome: string; principal: boolean }[]
  sugestao?: Repasse[]
}>()
const linhas = defineModel<Repasse[]>({ required: true })

const daDivisaoDoCaso = computed(() => Boolean(props.sugestao?.length))

watch(
  () => props.sugestao,
  (sugestao) => {
    if (sugestao?.length) linhas.value = sugestao.map((r) => ({ ...r }))
  },
  { immediate: true },
)
</script>

<template>
  <section class="bloco-repasse">
    <header>
      <strong><Icone nome="advogados" :tamanho="14" /> Quem fica com este dinheiro</strong>
      <span class="dica">
        <template v-if="daDivisaoDoCaso">Preenchido pela divisão do caso. Pode ajustar só para este recebimento.</template>
        <template v-else-if="linhas.length && valor > 0">
          O caixa recebe {{ moeda(valor) }} cheios; cada parte de outro advogado vira uma saída a pagar.
        </template>
        <template v-else>Sem divisão, tudo fica com o advogado principal.</template>
      </span>
    </header>
    <p v-if="linhas.length && !(valor > 0)" class="aviso alerta" style="margin: 0 0 8px">
      <Icone nome="alerta" />
      <span>Informe o valor acima para ver quanto cada um recebe.</span>
    </p>
    <Distribuicao v-model="linhas" :advogados="advogados" :valor="valor" id="repasse" />
  </section>
</template>

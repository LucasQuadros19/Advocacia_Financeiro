<script setup lang="ts">
import { computed } from 'vue'
import Icone from './Icone.vue'
import type { Direcao, Ordem } from '../ordenacao.ts'

const props = defineProps<{ campo: string; ordem: Ordem; num?: boolean }>()
const emit = defineEmits<{ ordenar: [campo: string, inicial: Direcao] }>()

const ativa = computed(() => props.ordem.campo === props.campo)
const icone = computed(() => (!ativa.value ? 'ordenar' : props.ordem.direcao === 'asc' ? 'subir' : 'descer'))
</script>

<template>
  <th :class="{ num }" :aria-sort="ativa ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : undefined">
    <button type="button" class="ordenar" :class="{ ativa }" @click="emit('ordenar', campo, num ? 'desc' : 'asc')">
      <slot />
      <Icone :nome="icone" :tamanho="12" />
    </button>
  </th>
</template>

<script setup lang="ts">
import Icone from './Icone.vue'

defineProps<{
  rotulo: string
  valor: string
  nota?: string
  icone?: string
  tom?: 'acao' | 'sucesso' | 'erro'
  destaque?: boolean
}>()
</script>

<template>
  <div class="cartao" :class="[tom, { destaque }]">
    <div class="rotulo">{{ rotulo }}</div>
    <div class="valor">{{ valor }}</div>
    <div v-if="nota || $slots.nota" class="nota">
      <slot name="nota">{{ nota }}</slot>
    </div>
    <div v-if="icone" class="marcador"><Icone :nome="icone" :tamanho="17" /></div>
  </div>
</template>

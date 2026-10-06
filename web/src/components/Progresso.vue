<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ concluido: number; total: number; rotulo?: string }>()

const fracao = computed(() => (props.total > 0 ? Math.min((props.concluido / props.total) * 100, 100) : 0))
</script>

<template>
  <div class="progresso" :title="rotulo">
    <progress :value="fracao" max="100" :aria-label="rotulo" />
    <span>{{ Math.round(fracao) }}%</span>
  </div>
</template>

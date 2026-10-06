<script setup lang="ts">
import { rotuloSituacao } from '../format.ts'

defineProps<{ situacao: string }>()
</script>

<template>
  <span class="selo ponto" :class="situacao">{{ rotuloSituacao[situacao] ?? situacao }}</span>
</template>

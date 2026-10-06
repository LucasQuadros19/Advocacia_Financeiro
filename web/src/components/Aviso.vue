<script setup lang="ts">
import Icone from './Icone.vue'

defineProps<{ texto: string }>()
</script>

<template>
  <p v-if="texto" class="aviso" role="alert"><Icone nome="alerta" /> {{ texto }}</p>
</template>

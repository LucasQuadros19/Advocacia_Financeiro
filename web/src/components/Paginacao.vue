<script setup lang="ts">
import Icone from './Icone.vue'

const props = defineProps<{ pagina: number; paginas: number; total: number }>()
const emit = defineEmits<{ mudar: [pagina: number] }>()
</script>

<template>
  <div v-if="props.total > 0" class="paginacao">
    <span>{{ props.total }} registro(s) · página {{ props.pagina }} de {{ Math.max(props.paginas, 1) }}</span>
    <div style="display: flex; gap: 6px">
      <button class="botao pequeno" :disabled="props.pagina <= 1" @click="emit('mudar', props.pagina - 1)">
        <Icone nome="anterior" /> Anterior
      </button>
      <button class="botao pequeno" :disabled="props.pagina >= props.paginas" @click="emit('mudar', props.pagina + 1)">
        Próxima <Icone nome="proximo" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Icone from './Icone.vue'

defineProps<{ id: string; rotulo: string }>()
const modelo = defineModel<string>({ required: true })
const visivel = ref(false)
</script>

<template>
  <div class="campo">
    <label :for="id">{{ rotulo }}</label>
    <div class="campo-icone">
      <Icone nome="cadeado" />
      <input
        :id="id"
        v-model="modelo"
        :type="visivel ? 'text' : 'password'"
        autocomplete="new-password"
        minlength="8"
        maxlength="200"
        required
      />
      <button
        type="button"
        class="mostrar-senha"
        :aria-label="visivel ? 'Esconder senha' : 'Mostrar senha'"
        :aria-pressed="visivel"
        @click="visivel = !visivel"
      >
        <Icone :nome="visivel ? 'olhoFechado' : 'olho'" />
      </button>
    </div>
  </div>
</template>

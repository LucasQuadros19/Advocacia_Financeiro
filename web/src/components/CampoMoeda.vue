<script setup lang="ts">
import { computed } from 'vue'
import { moeda, paraNumero } from '../format.ts'

const props = defineProps<{
  id: string
  rotulo: string
  modelValue: string
  obrigatorio?: boolean
  dica?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [valor: string] }>()

const preenchido = computed(() => props.modelValue.trim() !== '')
</script>

<template>
  <div class="campo">
    <label :for="id">{{ rotulo }}</label>
    <div class="campo-moeda">
      <span aria-hidden="true">R$</span>
      <input
        :id="id"
        :value="modelValue"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        :required="obrigatorio"
        placeholder="0,00"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <span class="dica">{{ preenchido ? moeda(paraNumero(modelValue)) : (dica ?? 'Pode digitar com vírgula: 1.500,00') }}</span>
  </div>
</template>

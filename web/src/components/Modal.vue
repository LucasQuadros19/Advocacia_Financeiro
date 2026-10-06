<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue'
import Icone from './Icone.vue'

defineProps<{ titulo: string; descricao?: string; confirmar?: string; salvando?: boolean; leitura?: boolean }>()
const emit = defineEmits<{ fechar: []; confirmar: [] }>()

const corpo = useTemplateRef<HTMLElement>('corpo')

function aoTeclar(evento: KeyboardEvent) {
  if (evento.key === 'Escape') emit('fechar')
}

onMounted(() => {
  document.addEventListener('keydown', aoTeclar)
  const alvo =
    corpo.value?.querySelector<HTMLElement>('[autofocus]') ??
    corpo.value?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
  alvo?.focus()
})
onUnmounted(() => document.removeEventListener('keydown', aoTeclar))
</script>

<template>
  <Teleport to="body">
    <div class="fundo-modal" @click.self="emit('fechar')">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="titulo">
        <header>
          <div>
            <h2>{{ titulo }}</h2>
            <p v-if="descricao">{{ descricao }}</p>
          </div>
          <button class="botao icone" aria-label="Fechar" @click="emit('fechar')"><Icone nome="fechar" /></button>
        </header>
        <div v-if="leitura">
          <div ref="corpo" class="corpo"><slot /></div>
          <footer>
            <button type="button" class="botao primario" @click="emit('fechar')">Fechar</button>
          </footer>
        </div>
        <form v-else @submit.prevent="emit('confirmar')">
          <div ref="corpo" class="corpo"><slot /></div>
          <footer>
            <button type="button" class="botao" @click="emit('fechar')">Cancelar</button>
            <button type="submit" class="botao primario" :disabled="salvando">
              {{ salvando ? 'Salvando…' : (confirmar ?? 'Salvar') }}
            </button>
          </footer>
        </form>
      </div>
    </div>
  </Teleport>
</template>

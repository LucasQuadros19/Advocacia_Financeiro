<script setup lang="ts">
import { nextTick, onUnmounted, useTemplateRef, watch } from 'vue'
import Icone from './Icone.vue'
import { avisos, confirmacao, descartar } from '../avisos.ts'

const cancelar = useTemplateRef<HTMLButtonElement>('cancelar')
const aceitar = useTemplateRef<HTMLButtonElement>('aceitar')

function aoTeclar(evento: KeyboardEvent) {
  if (evento.key === 'Escape') confirmacao.value?.responder(false)
}

watch(confirmacao, async (atual) => {
  document.removeEventListener('keydown', aoTeclar)
  if (!atual) return
  document.addEventListener('keydown', aoTeclar)
  await nextTick()
  const botao = atual.perigo ? cancelar.value : aceitar.value
  botao?.focus()
})

onUnmounted(() => document.removeEventListener('keydown', aoTeclar))
</script>

<template>
  <Teleport to="body">
    <div class="avisos" role="status" aria-live="polite">
      <div v-for="aviso in avisos" :key="aviso.id" class="toast" :class="aviso.tom">
        <Icone :nome="aviso.tom === 'erro' ? 'alerta' : 'confirmar'" />
        <span>{{ aviso.texto }}</span>
        <button class="botao icone" aria-label="Fechar aviso" @click="descartar(aviso.id)"><Icone nome="fechar" /></button>
      </div>
    </div>

    <div v-if="confirmacao" class="fundo-modal centralizado" @click.self="confirmacao.responder(false)">
      <div class="modal confirmacao" role="alertdialog" aria-modal="true" :aria-label="confirmacao.titulo">
        <header>
          <div>
            <h2>{{ confirmacao.titulo }}</h2>
          </div>
        </header>
        <div class="corpo">{{ confirmacao.texto }}</div>
        <footer>
          <button ref="cancelar" class="botao" @click="confirmacao.responder(false)">Cancelar</button>
          <button
            ref="aceitar"
            class="botao"
            :class="confirmacao.perigo ? 'perigo-solido' : 'primario'"
            @click="confirmacao.responder(true)"
          >
            {{ confirmacao.confirmar }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

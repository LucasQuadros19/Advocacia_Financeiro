<script setup lang="ts">
import Icone from './Icone.vue'

defineProps<{ carregando?: boolean; erro?: string; vazio?: boolean; mensagem?: string; icone?: string }>()
defineEmits<{ repetir: [] }>()
</script>

<template>
  <div v-if="carregando" class="estado">
    <span class="simbolo"><Icone nome="relogio" :tamanho="20" /></span>
    <span>Carregando…</span>
  </div>
  <div v-else-if="erro" class="estado erro">
    <span class="simbolo"><Icone nome="alerta" :tamanho="20" /></span>
    <strong>{{ erro }}</strong>
    <button class="botao pequeno" @click="$emit('repetir')">Tentar novamente</button>
  </div>
  <div v-else-if="vazio" class="estado">
    <span class="simbolo"><Icone :nome="icone ?? 'busca'" :tamanho="20" /></span>
    <strong>{{ mensagem ?? 'Nenhum registro encontrado.' }}</strong>
    <slot name="acao" />
  </div>
  <slot v-else />
</template>

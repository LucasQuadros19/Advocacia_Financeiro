<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { RouterLink } from 'vue-router'
import Estado from './Estado.vue'
import Icone from './Icone.vue'

export type Escritorio = {
  nome: string; documento: string | null; oab: string | null; endereco: string | null; cidade: string | null
  telefone: string | null; email: string | null; clausulas_parcelamento: string | null
}
export type Emissor = { escritorio: Escritorio; advogado: { nome: string; oab: string | null } | null }

const props = defineProps<{ titulo: string; emissor?: Emissor; carregando: boolean; erro: string }>()
defineEmits<{ repetir: [] }>()

watchEffect(() => (document.title = props.titulo))

const nome = computed(() => props.emissor?.escritorio.nome || props.emissor?.advogado?.nome || 'Escritório')
const linhas = computed(() => {
  const e = props.emissor?.escritorio
  if (!e) return []
  return [
    [e.documento && `CNPJ/CPF ${e.documento}`, e.oab && `OAB ${e.oab}`],
    [e.endereco, e.cidade],
    [e.telefone, e.email],
  ]
    .map((partes) => partes.filter(Boolean).join(' · '))
    .filter(Boolean)
})

const imprimir = () => window.print()

function voltar() {
  if (history.length > 1) history.back()
  else window.close()
}
</script>

<template>
  <div class="impressao">
    <div class="barra-impressao nao-imprimir">
      <button type="button" class="botao" @click="voltar"><Icone nome="anterior" /> Voltar</button>
      <span class="dica">Para guardar em PDF, escolha “Salvar como PDF” na janela de impressão.</span>
      <button type="button" class="botao primario" :disabled="carregando || !!erro" @click="imprimir">
        <Icone nome="imprimir" /> Imprimir
      </button>
    </div>

    <Estado :carregando="carregando" :erro="erro" @repetir="$emit('repetir')">
      <p v-if="emissor && !emissor.escritorio.nome" class="aviso alerta nao-imprimir folha-aviso">
        <Icone nome="alerta" />
        <span>
          Os dados do escritório ainda não foram preenchidos.
          <RouterLink to="/configuracoes?aba=escritorio">Preencha em Configurações › Escritório</RouterLink>
          para sair o nome, CNPJ e endereço no documento.
        </span>
      </p>
      <slot name="antes" />
      <article class="folha">
        <header class="cabecalho-documento">
          <strong>{{ nome }}</strong>
          <span v-for="linha in linhas" :key="linha">{{ linha }}</span>
        </header>
        <slot />
      </article>
    </Estado>
  </div>
</template>

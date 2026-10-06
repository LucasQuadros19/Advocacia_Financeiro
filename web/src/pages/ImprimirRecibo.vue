<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Documento, { type Emissor } from '../components/Documento.vue'
import { api } from '../api.ts'
import { dataPorExtenso, moeda, porExtenso, rotuloForma } from '../format.ts'
import { useRecurso } from '../recurso.ts'

type Recibo = {
  id: string; valor: string; data: string; forma_pagamento: string | null; observacoes: string | null
  descricao: string; caso_titulo: string | null; numero: number | null; total_parcelas: number | null
  entrada: boolean; valor_parcela: string | null; restante_apos: string | null
  cliente_nome: string | null; cliente_documento: string | null
}

const rota = useRoute()
const documento = useRecurso(() =>
  api.get<Emissor & { recibo: Recibo }>(`/documentos/recibo/${rota.params.origem}/${rota.params.id}`),
)
onMounted(documento.recarregar)

const r = computed(() => documento.dados.value?.recibo)
const codigo = computed(() => r.value?.id.slice(0, 8).toUpperCase() ?? '')

const referente = computed(() => {
  if (!r.value) return ''
  const parcela = r.value.entrada
    ? ' — entrada'
    : (r.value.total_parcelas ?? 0) > 1
      ? ` — parcela ${r.value.numero}/${r.value.total_parcelas}`
      : ''
  const caso = r.value.caso_titulo && !r.value.descricao.includes(r.value.caso_titulo) ? ` (caso ${r.value.caso_titulo})` : ''
  return `${r.value.descricao}${parcela}${caso}`
})

const situacaoParcela = computed(() => {
  if (!r.value || r.value.restante_apos === null) return ''
  return Number(r.value.restante_apos) > 0
    ? `Pagamento parcial: ainda restam ${moeda(r.value.restante_apos)} desta parcela de ${moeda(r.value.valor_parcela)}.`
    : 'Com este pagamento a parcela fica quitada.'
})

const cidade = computed(() => documento.dados.value?.escritorio.cidade)
const assinante = computed(() => {
  const e = documento.dados.value
  return e?.escritorio.nome || e?.advogado?.nome || 'Escritório'
})
const advogado = computed(() => {
  const a = documento.dados.value?.advogado
  return a ? `${a.nome}${a.oab ? ` — OAB ${a.oab}` : ''}` : ''
})
</script>

<template>
  <Documento
    :titulo="r ? `Recibo ${codigo} — ${r.cliente_nome ?? r.descricao}` : 'Recibo'"
    :emissor="documento.dados.value"
    :carregando="documento.carregando.value"
    :erro="documento.erro.value"
    @repetir="documento.recarregar"
  >
    <template v-if="r">
      <section v-for="(via, i) in ['Via do cliente', 'Via do escritório']" :key="via" class="recibo" :class="{ corte: i === 1 }">
        <div class="recibo-topo">
          <div>
            <h1>Recibo</h1>
            <span class="via">{{ via }} · Nº {{ codigo }}</span>
          </div>
          <div class="recibo-valor">{{ moeda(r.valor) }}</div>
        </div>

        <p class="recibo-texto">
          Recebemos de
          <strong v-if="r.cliente_nome">{{ r.cliente_nome }}</strong>
          <span v-else class="lacuna" aria-label="nome do pagador"></span><template v-if="r.cliente_documento">,
            CPF/CNPJ {{ r.cliente_documento }}</template>,
          a importância de <strong>{{ moeda(r.valor) }}</strong> ({{ porExtenso(r.valor) }}), referente a
          {{ referente }}.
        </p>
        <p v-if="r.forma_pagamento" class="recibo-linha">Forma de pagamento: {{ rotuloForma(r.forma_pagamento) }}.</p>
        <p v-if="situacaoParcela" class="recibo-linha">{{ situacaoParcela }}</p>
        <p v-if="r.observacoes" class="recibo-linha">Observações: {{ r.observacoes }}</p>
        <p class="recibo-linha">Para clareza, firmamos o presente recibo, dando plena quitação do valor acima.</p>

        <p class="local-data">{{ cidade ? `${cidade}, ` : '' }}{{ dataPorExtenso(r.data) }}.</p>

        <div class="assinatura">
          <span class="linha-assinatura"></span>
          <strong>{{ assinante }}</strong>
          <span v-if="advogado">{{ advogado }}</span>
        </div>
      </section>
    </template>
  </Documento>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Documento, { type Emissor } from '../components/Documento.vue'
import Icone from '../components/Icone.vue'
import { api } from '../api.ts'
import { data, dataPorExtenso, hoje, moeda, porExtenso, rotuloForma } from '../format.ts'
import { useRecurso } from '../recurso.ts'

type Conta = {
  id: string; descricao: string; valor_total: string; forma_pagamento: string | null; observacoes: string | null
  caso_titulo: string | null; cliente_nome: string; cliente_documento: string | null
  cliente_email: string | null; cliente_telefone: string | null
}
type Parcela = {
  numero: number; total_parcelas: number; entrada: boolean; valor: string; vencimento: string
  status: string; valor_pago: string
}

const rota = useRoute()
const documento = useRecurso(() =>
  api.get<Emissor & { conta: Conta; parcelas: Parcela[] }>(`/documentos/parcelamento/${rota.params.id}`),
)
onMounted(documento.recarregar)

const conta = computed(() => documento.dados.value?.conta)
const parcelas = computed(() => documento.dados.value?.parcelas ?? [])
const escritorio = computed(() => documento.dados.value?.escritorio)
const credor = computed(() => escritorio.value?.nome || documento.dados.value?.advogado?.nome || 'Escritório')
const algumaPaga = computed(() => parcelas.value.some((p) => Number(p.valor_pago) > 0))
const referente = computed(() =>
  conta.value
    ? `${conta.value.descricao}${conta.value.caso_titulo && !conta.value.descricao.includes(conta.value.caso_titulo) ? ` (caso ${conta.value.caso_titulo})` : ''}`
    : '',
)
const rotulo = (p: Parcela) => (p.entrada ? 'Entrada' : `${p.numero - (parcelas.value[0]?.entrada ? 1 : 0)}ª parcela`)
const situacao = (p: Parcela) =>
  p.status === 'pago' ? 'Paga' : Number(p.valor_pago) > 0 ? `Paga em parte (${moeda(p.valor_pago)})` : 'Em aberto'
</script>

<template>
  <Documento
    :titulo="conta ? `Termo de parcelamento — ${conta.cliente_nome}` : 'Termo de parcelamento'"
    :emissor="documento.dados.value"
    :carregando="documento.carregando.value"
    :erro="documento.erro.value"
    @repetir="documento.recarregar"
  >
    <template #antes>
      <p v-if="documento.dados.value && !escritorio?.clausulas_parcelamento" class="aviso alerta nao-imprimir folha-aviso">
        <Icone nome="alerta" />
        <span>
          O termo sai só com o reconhecimento da dívida e as parcelas. Para incluir multa, juros ou vencimento antecipado,
          escreva as cláusulas padrão em <RouterLink to="/configuracoes?aba=escritorio">Configurações › Escritório</RouterLink>.
        </span>
      </p>
    </template>

    <template v-if="conta">
      <h1 class="titulo-documento">Termo de acordo de parcelamento</h1>

      <dl class="partes">
        <div>
          <dt>Devedor(a)</dt>
          <dd>
            <strong>{{ conta.cliente_nome }}</strong>
            <span>CPF/CNPJ: {{ conta.cliente_documento || '____________________' }}</span>
            <span v-if="conta.cliente_telefone || conta.cliente_email">
              {{ [conta.cliente_telefone, conta.cliente_email].filter(Boolean).join(' · ') }}
            </span>
          </dd>
        </div>
        <div>
          <dt>Credor(a)</dt>
          <dd>
            <strong>{{ credor }}</strong>
            <span v-if="escritorio?.documento">CNPJ/CPF: {{ escritorio.documento }}</span>
            <span v-if="escritorio?.endereco">{{ escritorio.endereco }}</span>
          </dd>
        </div>
      </dl>

      <p class="clausula">
        Pelo presente termo, o(a) DEVEDOR(A) reconhece dever ao(à) CREDOR(A) a quantia de
        <strong>{{ moeda(conta.valor_total) }}</strong> ({{ porExtenso(conta.valor_total) }}), referente a {{ referente }},
        e se compromete a pagá-la conforme o cronograma abaixo{{
          conta.forma_pagamento ? `, por ${rotuloForma(conta.forma_pagamento)}` : ''
        }}.
      </p>

      <table class="tabela-documento">
        <thead>
          <tr>
            <th>Parcela</th>
            <th>Vencimento</th>
            <th class="num">Valor</th>
            <th v-if="algumaPaga">Situação</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in parcelas" :key="p.numero">
            <td>{{ rotulo(p) }}</td>
            <td>{{ data(p.vencimento) }}</td>
            <td class="num">{{ moeda(p.valor) }}</td>
            <td v-if="algumaPaga">{{ situacao(p) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">Total</th>
            <th class="num">{{ moeda(conta.valor_total) }}</th>
            <th v-if="algumaPaga"></th>
          </tr>
        </tfoot>
      </table>

      <p class="clausula">Cada pagamento será comprovado por recibo emitido pelo(a) CREDOR(A).</p>
      <p v-if="escritorio?.clausulas_parcelamento" class="clausula clausulas-livres">{{ escritorio.clausulas_parcelamento }}</p>
      <p v-if="conta.observacoes" class="clausula">Observações: {{ conta.observacoes }}</p>

      <p class="local-data">{{ escritorio?.cidade ? `${escritorio.cidade}, ` : '' }}{{ dataPorExtenso(hoje()) }}.</p>

      <div class="assinaturas">
        <div class="assinatura">
          <span class="linha-assinatura"></span>
          <strong>{{ conta.cliente_nome }}</strong>
          <span>Devedor(a)</span>
        </div>
        <div class="assinatura">
          <span class="linha-assinatura"></span>
          <strong>{{ credor }}</strong>
          <span>Credor(a)</span>
        </div>
        <div class="assinatura">
          <span class="linha-assinatura"></span>
          <span>Testemunha 1 — nome e CPF</span>
        </div>
        <div class="assinatura">
          <span class="linha-assinatura"></span>
          <span>Testemunha 2 — nome e CPF</span>
        </div>
      </div>
    </template>
  </Documento>
</template>

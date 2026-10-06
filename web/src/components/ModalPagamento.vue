<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Aviso from './Aviso.vue'
import CampoCarteira from './CampoCarteira.vue'
import CampoMoeda from './CampoMoeda.vue'
import CampoRepasse, { type Repasse } from './CampoRepasse.vue'
import Modal from './Modal.vue'
import { api } from '../api.ts'
import { FORMAS_PAGAMENTO, hoje, moeda, paraNumero } from '../format.ts'

export type { Repasse }
export type FormPagamento = {
  data_pagamento: string
  forma_pagamento: string
  observacoes: string
  carteira_id: string
  valor: string
}

const props = defineProps<{
  form: FormPagamento
  salvando: boolean
  erro: string
  titulo?: string
  confirmar?: string
  total: number
  parcial?: boolean
  saida?: boolean
  advogados?: { id: string; nome: string; principal: boolean }[]
  casoId?: string | null
}>()
const emit = defineEmits<{ fechar: []; confirmar: [repasses: Repasse[]] }>()

const repasses = ref<Repasse[]>([])
const sugestao = ref<Repasse[]>([])
const tentou = ref(false)

const valor = computed(() => (props.parcial ? paraNumero(props.form.valor) : props.total))
const falta = computed(() => Math.round((props.total - valor.value) * 100) / 100)
const podeRepassar = computed(() => Boolean(!props.saida && props.advogados?.some((a) => !a.principal)))
const totalRepasse = computed(() => repasses.value.reduce((s, r) => s + (Number(r.percentual) || 0), 0))
const erroValor = computed(() => {
  if (!props.parcial) return ''
  if (valor.value <= 0) return 'Informe quanto foi recebido.'
  if (falta.value < 0) return `O valor passa do que falta receber (${moeda(props.total)}).`
  return ''
})

onMounted(async () => {
  if (!podeRepassar.value || !props.casoId) return
  const caso = await api
    .get<{ advogados: { advogado_id: string; percentual: string; principal: boolean }[] }>(`/casos/${props.casoId}`)
    .catch(() => undefined)
  sugestao.value = (caso?.advogados ?? [])
    .filter((a) => !a.principal && Number(a.percentual) > 0)
    .map((a) => ({ advogado_id: a.advogado_id, percentual: Number(a.percentual) }))
})

const enviar = () => {
  tentou.value = true
  if (erroValor.value || totalRepasse.value > 100) return
  emit('confirmar', podeRepassar.value ? repasses.value.filter((r) => Number(r.percentual) > 0) : [])
}
</script>

<template>
  <Modal
    :titulo="titulo ?? 'Registrar pagamento'"
    :confirmar="confirmar ?? 'Confirmar recebimento'"
    :salvando="salvando"
    @fechar="emit('fechar')"
    @confirmar="enviar"
  >
    <slot />
    <template v-if="parcial">
      <CampoMoeda
        id="valor-pagamento"
        v-model="form.valor"
        rotulo="Valor recebido agora *"
        obrigatorio
        :dica="`Falta receber ${moeda(total)}`"
      />
      <p v-if="valor > 0 && falta > 0" class="aviso alerta">
        Pagamento parcial: {{ moeda(falta) }} continuam em aberto nesta parcela.
      </p>
    </template>
    <div class="grade-2">
      <div class="campo">
        <label for="data-pagamento">Data do pagamento *</label>
        <input id="data-pagamento" v-model="form.data_pagamento" type="date" :max="hoje()" required />
      </div>
      <div class="campo">
        <label for="forma-pagamento">Forma de pagamento</label>
        <select id="forma-pagamento" v-model="form.forma_pagamento">
          <option value="">Não informada</option>
          <option v-for="[v, rotulo] in FORMAS_PAGAMENTO" :key="v" :value="v">{{ rotulo }}</option>
        </select>
      </div>
    </div>
    <CampoCarteira
      id="carteira-pagamento"
      v-model="form.carteira_id"
      :forma="form.forma_pagamento"
      :rotulo="saida ? 'Saiu de *' : 'Entrou em *'"
    />
    <div class="campo">
      <label for="obs-pagamento">Observações</label>
      <textarea id="obs-pagamento" v-model="form.observacoes" maxlength="2000" />
    </div>

    <CampoRepasse
      v-if="podeRepassar"
      v-model="repasses"
      :valor="valor"
      :advogados="advogados ?? []"
      :sugestao="sugestao"
    />

    <Aviso :texto="(tentou && erroValor) || erro" />
  </Modal>
</template>

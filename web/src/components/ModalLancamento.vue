<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Aviso from './Aviso.vue'
import BuscaCliente from './BuscaCliente.vue'
import CampoCarteira from './CampoCarteira.vue'
import CampoMoeda from './CampoMoeda.vue'
import CampoRepasse, { type Repasse } from './CampoRepasse.vue'
import Modal from './Modal.vue'
import { FORMAS_PAGAMENTO, hoje, paraNumero } from '../format.ts'

const props = defineProps<{
  salvando: boolean
  erro: string
  advogados: { id: string; nome: string; principal: boolean }[]
}>()
const emit = defineEmits<{ fechar: []; confirmar: [corpo: Record<string, unknown>] }>()

const form = reactive({
  tipo: 'entrada' as 'entrada' | 'saida',
  descricao: '',
  categoria: '',
  valor: '',
  data: hoje(),
  cliente_id: '',
  carteira_id: '',
  forma_pagamento: '',
  observacoes: '',
})
const repasses = ref<Repasse[]>([])

const valor = computed(() => paraNumero(form.valor))
const eEntrada = computed(() => form.tipo === 'entrada')
const podeRepassar = computed(() => eEntrada.value && props.advogados.some((a) => !a.principal))
const excedeu = computed(() => repasses.value.reduce((s, r) => s + (Number(r.percentual) || 0), 0) > 100)

// repasse é coisa de entrada; virou saída, o que já foi escolhido não vale mais
watch(eEntrada, (entrada) => {
  if (!entrada) repasses.value = []
})

function enviar() {
  if (excedeu.value) return
  emit('confirmar', {
    tipo: form.tipo,
    descricao: form.descricao,
    categoria: form.categoria || undefined,
    valor: valor.value,
    data: form.data,
    cliente_id: form.cliente_id || null,
    carteira_id: form.carteira_id || null,
    forma_pagamento: form.forma_pagamento || undefined,
    observacoes: form.observacoes || undefined,
    ...(podeRepassar.value && valor.value > 0 && repasses.value.length
      ? { repasses: repasses.value.filter((r) => Number(r.percentual) > 0) }
      : {}),
  })
}
</script>

<template>
  <Modal
    titulo="Novo lançamento"
    descricao="Dinheiro que entrou ou saiu agora, sem passar por uma conta cadastrada."
    confirmar="Lançar no caixa"
    :salvando="salvando"
    @fechar="emit('fechar')"
    @confirmar="enviar"
  >
    <div class="escolha-tipo">
      <button
        type="button"
        class="opcao-tipo entrada"
        :class="{ ativo: eEntrada }"
        :aria-pressed="eEntrada"
        @click="form.tipo = 'entrada'"
      >
        <span class="seta entrada">+</span>
        <span>
          <strong>Entrada</strong>
          <span class="dica">Recebi dinheiro</span>
        </span>
      </button>
      <button
        type="button"
        class="opcao-tipo saida"
        :class="{ ativo: !eEntrada }"
        :aria-pressed="!eEntrada"
        @click="form.tipo = 'saida'"
      >
        <span class="seta saida">−</span>
        <span>
          <strong>Saída</strong>
          <span class="dica">Paguei alguma coisa</span>
        </span>
      </button>
    </div>

    <div class="campo">
      <label for="m-descricao">Descrição *</label>
      <input
        id="m-descricao"
        v-model="form.descricao"
        required
        maxlength="200"
        :placeholder="eEntrada ? 'Ex.: Consulta avulsa no balcão' : 'Ex.: Custas processuais'"
        autofocus
      />
    </div>

    <div class="grade-2">
      <CampoMoeda id="m-valor" v-model="form.valor" rotulo="Valor *" obrigatorio />
      <div class="campo">
        <label for="m-data">Data *</label>
        <input id="m-data" v-model="form.data" type="date" :max="hoje()" required />
      </div>
    </div>

    <div class="grade-2">
      <div class="campo">
        <label for="m-categoria">Categoria</label>
        <input
          id="m-categoria"
          v-model="form.categoria"
          maxlength="60"
          :placeholder="eEntrada ? 'Ex.: Consultoria' : 'Ex.: Custas, Deslocamento'"
        />
      </div>
      <div class="campo">
        <label for="m-forma">Forma de pagamento</label>
        <select id="m-forma" v-model="form.forma_pagamento">
          <option value="">Não informada</option>
          <option v-for="[v, rotulo] in FORMAS_PAGAMENTO" :key="v" :value="v">{{ rotulo }}</option>
        </select>
      </div>
    </div>

    <CampoCarteira
      id="m-carteira"
      v-model="form.carteira_id"
      :forma="form.forma_pagamento"
      :rotulo="eEntrada ? 'Entrou em *' : 'Saiu de *'"
    />

    <div v-if="eEntrada" class="campo">
      <label for="m-cliente">Cliente (opcional)</label>
      <BuscaCliente id="m-cliente" v-model="form.cliente_id" />
      <span class="dica">Deixe em branco se não for de nenhum cliente cadastrado.</span>
    </div>

    <div class="campo">
      <label for="m-observacoes">Observações</label>
      <textarea id="m-observacoes" v-model="form.observacoes" maxlength="2000" />
    </div>

    <CampoRepasse v-if="podeRepassar" v-model="repasses" :valor="valor" :advogados="advogados" />

    <Aviso :texto="erro" />
  </Modal>
</template>

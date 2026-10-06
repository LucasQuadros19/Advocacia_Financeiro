<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Aviso from '../components/Aviso.vue'
import CampoCarteira from '../components/CampoCarteira.vue'
import Cartao from '../components/Cartao.vue'
import ColunaOrdem from '../components/ColunaOrdem.vue'
import Estado from '../components/Estado.vue'
import Icone from '../components/Icone.vue'
import Modal from '../components/Modal.vue'
import Paginacao from '../components/Paginacao.vue'
import { api, type Pagina } from '../api.ts'
import { avisar, confirmar } from '../avisos.ts'
import { FORMAS_PAGAMENTO, data, hoje, moeda, rotuloForma } from '../format.ts'
import { useOrdenacao } from '../ordenacao.ts'
import { useRecurso } from '../recurso.ts'

type Resumo = {
  id: string; nome: string; principal: boolean; a_pagar: string; qtd_a_pagar: string; pago_mes: string
  pago_total: string; pendente_desde: string | null
}
type Repasse = {
  id: string; descricao: string; contraparte: string; advogado_id: string; pai_descricao: string | null
  caso_id: string | null; caso_titulo: string | null; cliente_id: string | null; valor: string; vencimento: string
  status: string; data_pagamento: string | null; forma_pagamento: string | null; carteira_nome: string | null
  dias_para_vencimento: number
}

const advogado = ref('')
const status = ref<'pendente' | 'pago' | ''>('pendente')
const pagina = ref(1)
const selecionados = ref<string[]>([])

const resumo = useRecurso(() => api.get<{ mes: string; advogados: Resumo[] }>('/repasses/resumo'))
const filtro = computed(
  () => `${advogado.value ? `&advogado_id=${advogado.value}` : ''}${status.value ? `&status=${status.value}` : ''}`,
)
const lista = useRecurso(() =>
  api.get<Pagina<Repasse> & { totais: { a_pagar: string; saiu: string } }>(
    `/caixa/lancamentos?origem=repasse&pagina=${pagina.value}&limite=50${filtro.value}${ordem.query()}`,
  ),
)
const ordem = useOrdenacao(() => (pagina.value === 1 ? lista.recarregar() : (pagina.value = 1)))

watch([advogado, status], () => {
  selecionados.value = []
  pagina.value === 1 ? lista.recarregar() : (pagina.value = 1)
})
watch(pagina, () => {
  selecionados.value = []
  lista.recarregar()
})
onMounted(() => {
  resumo.recarregar()
  lista.recarregar()
})

const ha = (dias: number) => (dias === 0 ? 'hoje' : `há ${Math.abs(dias)} dia(s)`)

const atualizar = () => Promise.all([resumo.recarregar(), lista.recarregar()])

const pendentesDaPagina = computed(() => (lista.dados.value?.dados ?? []).filter((r) => r.status === 'pendente'))
const escolhidos = computed(() => pendentesDaPagina.value.filter((r) => selecionados.value.includes(r.id)))
const totalEscolhido = computed(
  () => escolhidos.value.reduce((s, r) => s + Math.round(Number(r.valor) * 100), 0) / 100,
)
const todosMarcados = computed(
  () => pendentesDaPagina.value.length > 0 && escolhidos.value.length === pendentesDaPagina.value.length,
)
const porAdvogado = computed(() => {
  const grupos = new Map<string, number>()
  for (const r of escolhidos.value) grupos.set(r.contraparte, (grupos.get(r.contraparte) ?? 0) + Number(r.valor))
  return [...grupos.entries()]
})

function marcarTodos() {
  selecionados.value = todosMarcados.value ? [] : pendentesDaPagina.value.map((r) => r.id)
}

const exportar = computed(
  () => `/api/exportar/repasses.csv?${[advogado.value && `advogado_id=${advogado.value}`, status.value && `status=${status.value}`].filter(Boolean).join('&')}`,
)

const modal = ref(false)
const salvando = ref(false)
const erro = ref('')
const form = reactive({ data_pagamento: hoje(), forma_pagamento: 'pix', carteira_id: '', observacoes: '' })

function abrirPagamento(ids?: string[]) {
  if (ids) selecionados.value = ids
  Object.assign(form, { data_pagamento: hoje(), forma_pagamento: 'pix', carteira_id: '', observacoes: '' })
  erro.value = ''
  modal.value = true
}

async function pagar() {
  salvando.value = true
  erro.value = ''
  try {
    const r = await api.post<{ pagos: number; total: number }>('/repasses/pagamento-lote', {
      ids: escolhidos.value.map((e) => e.id),
      data_pagamento: form.data_pagamento,
      forma_pagamento: form.forma_pagamento || undefined,
      carteira_id: form.carteira_id || null,
      observacoes: form.observacoes || undefined,
    })
    modal.value = false
    selecionados.value = []
    avisar(`${r.pagos} repasse(s) pago(s), somando ${moeda(r.total)}.`)
    await atualizar()
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    salvando.value = false
  }
}

async function estornar(r: Repasse) {
  const ok = await confirmar(
    'Estornar repasse',
    `O pagamento de ${moeda(r.valor)} a ${r.contraparte} em ${data(r.data_pagamento)} será desfeito e o repasse volta para a pagar.`,
    { confirmar: 'Estornar', perigo: true },
  )
  if (!ok) return
  try {
    await api.delete(`/repasses/${r.id}/pagamento`)
    avisar('Repasse estornado.')
    await atualizar()
  } catch (e) {
    avisar((e as Error).message, 'erro')
  }
}
</script>

<template>
  <div class="topo">
    <div>
      <h1>Repasses</h1>
      <p>O que cada advogado tem a receber pela divisão dos casos e o que já foi pago.</p>
    </div>
    <div class="acoes">
      <a class="botao" :href="exportar" download><Icone nome="baixar" /> Exportar</a>
    </div>
  </div>

  <Estado :carregando="resumo.carregando.value" :erro="resumo.erro.value" @repetir="resumo.recarregar">
    <section v-if="resumo.dados.value?.advogados.length" class="cartoes cartoes-fixos">
      <Cartao
        v-for="a in resumo.dados.value.advogados"
        :key="a.id"
        :rotulo="a.nome"
        :valor="moeda(a.a_pagar)"
        :tom="Number(a.a_pagar) > 0 ? 'acao' : undefined"
        icone="advogados"
      >
        <template #nota>
          {{ Number(a.qtd_a_pagar) ? `${a.qtd_a_pagar} a pagar` : 'Nada a pagar' }}
          · pago neste mês {{ moeda(a.pago_mes) }}
          <button v-if="advogado !== a.id" type="button" class="botao texto pequeno" @click="advogado = a.id">
            ver
          </button>
        </template>
      </Cartao>
    </section>
  </Estado>

  <section class="painel">
    <header>
      <div class="filtros">
        <div class="campo">
          <label for="filtro-advogado">Advogado</label>
          <select id="filtro-advogado" v-model="advogado">
            <option value="">Todos</option>
            <option v-for="a in resumo.dados.value?.advogados ?? []" :key="a.id" :value="a.id">{{ a.nome }}</option>
          </select>
        </div>
        <div class="campo">
          <label for="filtro-status">Situação</label>
          <select id="filtro-status" v-model="status">
            <option value="pendente">A pagar</option>
            <option value="pago">Pagos</option>
            <option value="">Todos</option>
          </select>
        </div>
      </div>
      <div v-if="status !== 'pago' && lista.dados.value" class="resumo-mes">
        <span>A pagar (filtro)<strong>{{ moeda(lista.dados.value.totais.a_pagar) }}</strong></span>
      </div>
    </header>

    <div v-if="escolhidos.length" class="barra-selecao" role="region" aria-label="Repasses selecionados">
      <span>
        <strong>{{ escolhidos.length }}</strong> selecionado(s) · <strong>{{ moeda(totalEscolhido) }}</strong>
      </span>
      <div class="acoes">
        <button type="button" class="botao pequeno" @click="selecionados = []">Limpar</button>
        <button type="button" class="botao pequeno primario" @click="abrirPagamento()">
          <Icone nome="confirmar" /> Pagar selecionados
        </button>
      </div>
    </div>

    <Estado
      :carregando="lista.carregando.value"
      :erro="lista.erro.value"
      :vazio="!lista.dados.value?.dados.length"
      icone="repasses"
      :mensagem="status === 'pendente' ? 'Nenhum repasse a pagar. Tudo em dia.' : 'Nenhum repasse encontrado.'"
      @repetir="lista.recarregar"
    >
      <table v-if="lista.dados.value">
        <thead>
          <tr>
            <th style="width: 40px">
              <input
                v-if="pendentesDaPagina.length"
                type="checkbox"
                :checked="todosMarcados"
                aria-label="Selecionar todos os repasses a pagar desta página"
                @change="marcarTodos"
              />
            </th>
            <ColunaOrdem campo="contraparte" :ordem="ordem.ordem" @ordenar="ordem.ordenar">Advogado</ColunaOrdem>
            <th>Veio de</th>
            <ColunaOrdem campo="vencimento" :ordem="ordem.ordem" @ordenar="ordem.ordenar">Recebido em</ColunaOrdem>
            <ColunaOrdem campo="valor" num :ordem="ordem.ordem" @ordenar="ordem.ordenar">Valor</ColunaOrdem>
            <th>Situação</th>
            <th class="num"><span class="sr">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in lista.dados.value.dados" :key="r.id" :class="{ selecionada: selecionados.includes(r.id) }">
            <td>
              <input
                v-if="r.status === 'pendente'"
                v-model="selecionados"
                type="checkbox"
                :value="r.id"
                :aria-label="`Selecionar repasse de ${moeda(r.valor)} a ${r.contraparte}`"
              />
            </td>
            <td class="titulo-celula">{{ r.contraparte }}</td>
            <td>
              <div>{{ r.pai_descricao ?? '—' }}</div>
              <div v-if="r.caso_titulo" class="sub-celula">
                <RouterLink v-if="r.caso_id" :to="`/casos/${r.caso_id}`">{{ r.caso_titulo }}</RouterLink>
              </div>
            </td>
            <td class="nowrap">
              {{ data(r.vencimento) }}
              <span v-if="r.status === 'pendente'" class="fraco"> · {{ ha(r.dias_para_vencimento) }}</span>
            </td>
            <td class="dinheiro">{{ moeda(r.valor) }}</td>
            <td>
              <span v-if="r.status === 'pago'" class="selo pago ponto">Pago em {{ data(r.data_pagamento) }}</span>
              <span v-else class="selo proxima ponto">A pagar</span>
              <div v-if="r.status === 'pago' && (r.forma_pagamento || r.carteira_nome)" class="sub-celula">
                {{ [rotuloForma(r.forma_pagamento), r.carteira_nome].filter(Boolean).join(' · ') }}
              </div>
            </td>
            <td class="num nowrap">
              <button v-if="r.status === 'pendente'" type="button" class="botao pequeno primario" @click="abrirPagamento([r.id])">
                <Icone nome="confirmar" /> Pagar
              </button>
              <button v-else type="button" class="botao icone" aria-label="Estornar pagamento" title="Estornar pagamento" @click="estornar(r)">
                <Icone nome="desfazer" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <Paginacao
        v-if="lista.dados.value"
        :pagina="lista.dados.value.pagina"
        :paginas="lista.dados.value.paginas"
        :total="lista.dados.value.total"
        @mudar="pagina = $event"
      />
    </Estado>
  </section>

  <Modal
    v-if="modal"
    titulo="Pagar repasses"
    :descricao="`${escolhidos.length} repasse(s) · ${moeda(totalEscolhido)}`"
    :confirmar="`Pagar ${moeda(totalEscolhido)}`"
    :salvando="salvando"
    @fechar="modal = false"
    @confirmar="pagar"
  >
    <div class="resumo-modal">
      <div v-for="[nome, total] in porAdvogado" :key="nome">{{ nome }}<strong>{{ moeda(total) }}</strong></div>
    </div>
    <div class="grade-2">
      <div class="campo">
        <label for="repasse-data">Data do pagamento *</label>
        <input id="repasse-data" v-model="form.data_pagamento" type="date" :max="hoje()" required />
      </div>
      <div class="campo">
        <label for="repasse-forma">Forma de pagamento</label>
        <select id="repasse-forma" v-model="form.forma_pagamento">
          <option value="">Não informada</option>
          <option v-for="[v, rotulo] in FORMAS_PAGAMENTO" :key="v" :value="v">{{ rotulo }}</option>
        </select>
      </div>
    </div>
    <CampoCarteira id="repasse-carteira" v-model="form.carteira_id" :forma="form.forma_pagamento" rotulo="Saiu de *" />
    <div class="campo">
      <label for="repasse-obs">Observações</label>
      <textarea id="repasse-obs" v-model="form.observacoes" maxlength="2000" />
    </div>
    <Aviso :texto="erro" />
  </Modal>
</template>

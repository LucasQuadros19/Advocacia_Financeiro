<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import Aviso from '../components/Aviso.vue'
import CampoMoeda from '../components/CampoMoeda.vue'
import ColunaOrdem from '../components/ColunaOrdem.vue'
import Estado from '../components/Estado.vue'
import Icone from '../components/Icone.vue'
import Modal from '../components/Modal.vue'
import ModalPagamento, { type FormPagamento } from '../components/ModalPagamento.vue'
import Selo from '../components/Selo.vue'
import Paginacao from '../components/Paginacao.vue'
import { api, type Pagina } from '../api.ts'
import { avisar, confirmar } from '../avisos.ts'
import { data, hoje, moeda, paraNumero, prazo } from '../format.ts'
import { useOrdenacao } from '../ordenacao.ts'
import { useRecurso } from '../recurso.ts'

type Despesa = {
  id: string; descricao: string; categoria: string | null; valor: string; dia_vencimento: number
  inicio: string; fim: string | null; ativa: boolean; observacoes: string | null
  pendentes: string; pago_12_meses: string
  proximo_id: string | null; proximo_vencimento: string | null; proximo_valor: string | null
  proximo_vencimento_original: string | null; proximo_situacao: string
}

const mesAtual = new Date().toLocaleDateString('en-CA').slice(0, 7)
const pagina = ref(1)
const despesas = useRecurso(() => api.get<Pagina<Despesa>>(`/despesas?pagina=${pagina.value}&limite=20${query()}`))
const { ordem, ordenar, query } = useOrdenacao(() => {
  pagina.value = 1
  despesas.recarregar()
})
onMounted(despesas.recarregar)

const salvando = ref(false)
const erroFormulario = ref('')

async function executar(acao: () => Promise<unknown>, sucesso: string, fechar?: () => void) {
  salvando.value = true
  erroFormulario.value = ''
  try {
    await acao()
    fechar?.()
    avisar(sucesso)
    await despesas.recarregar()
  } catch (e) {
    const mensagem = (e as Error).message
    if (fechar) erroFormulario.value = mensagem
    else avisar(mensagem, 'erro')
  } finally {
    salvando.value = false
  }
}

const modal = ref(false)
const editando = ref<Despesa>()
const form = reactive({
  descricao: '', categoria: '', valor: '', dia_vencimento: 10,
  inicio: `${mesAtual}-01`, fim: '', ativa: true, observacoes: '',
})

function abrir(despesa?: Despesa) {
  editando.value = despesa
  Object.assign(form, {
    descricao: despesa?.descricao ?? '',
    categoria: despesa?.categoria ?? '',
    valor: despesa ? String(despesa.valor).replace('.', ',') : '',
    dia_vencimento: despesa?.dia_vencimento ?? 10,
    inicio: despesa?.inicio?.slice(0, 10) ?? `${mesAtual}-01`,
    fim: despesa?.fim?.slice(0, 10) ?? '',
    ativa: despesa?.ativa ?? true,
    observacoes: despesa?.observacoes ?? '',
  })
  erroFormulario.value = ''
  modal.value = true
}

const salvar = () => {
  const corpo = {
    descricao: form.descricao,
    categoria: form.categoria || undefined,
    valor: paraNumero(form.valor),
    dia_vencimento: Number(form.dia_vencimento),
    inicio: form.inicio,
    fim: form.fim || null,
    ativa: form.ativa,
    observacoes: form.observacoes || undefined,
  }
  return executar(
    () => (editando.value ? api.put(`/despesas/${editando.value.id}`, corpo) : api.post('/despesas', corpo)),
    editando.value ? 'Conta programada atualizada.' : 'Conta programada criada.',
    () => (modal.value = false),
  )
}

const diasAte = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00`) - Date.parse(`${hoje()}T00:00:00`)) / 86400000)

const modalBaixa = ref(false)
const baixa = ref<Despesa>()
const formBaixa = reactive<FormPagamento>({
  data_pagamento: hoje(), forma_pagamento: '', observacoes: '', carteira_id: '', valor: '',
})

function abrirBaixa(despesa: Despesa) {
  baixa.value = despesa
  Object.assign(formBaixa, { data_pagamento: hoje(), forma_pagamento: '', observacoes: '', carteira_id: '', valor: '' })
  erroFormulario.value = ''
  modalBaixa.value = true
}

const salvarBaixa = () =>
  executar(
    () =>
      api.post(`/despesas/lancamentos/${baixa.value!.proximo_id}/pagamento`, {
        data_pagamento: formBaixa.data_pagamento,
        forma_pagamento: formBaixa.forma_pagamento || undefined,
        carteira_id: formBaixa.carteira_id || undefined,
        observacoes: formBaixa.observacoes || undefined,
      }),
    `Baixa registrada em ${baixa.value!.descricao}. A conta já mostra o próximo mês.`,
    () => (modalBaixa.value = false),
  )

async function adiar(despesa: Despesa) {
  const ok = await confirmar(
    'Adiar para o mês seguinte',
    `"${despesa.descricao}" de ${moeda(despesa.proximo_valor)} vencia em ${data(despesa.proximo_vencimento)} e passa ` +
      'para o mês seguinte. A conta continua devida, só muda o vencimento.',
    { confirmar: 'Adiar' },
  )
  if (!ok) return
  await executar(
    () => api.post(`/despesas/lancamentos/${despesa.proximo_id}/adiar`),
    `${despesa.descricao} adiada para o mês seguinte.`,
  )
}

async function excluir(despesa: Despesa) {
  const ok = await confirmar(
    'Excluir conta programada',
    `"${despesa.descricao}" e os lançamentos ainda não pagos serão removidos. Contas com pagamento registrado não podem ser excluídas — desative em vez disso.`,
    { confirmar: 'Excluir', perigo: true },
  )
  if (ok) await executar(() => api.delete(`/despesas/${despesa.id}`), 'Conta programada excluída.')
}

</script>

<template>
  <div>
    <div class="topo">
      <div>
        <h1>Contas programadas</h1>
        <p>Contas fixas que se repetem todo mês. O lançamento de cada mês entra no caixa sozinho.</p>
      </div>
      <button class="botao primario" @click="abrir()"><Icone nome="mais" /> Nova conta programada</button>
    </div>

    <section class="painel">

      <Estado
        :carregando="despesas.carregando.value"
        :erro="despesas.erro.value"
        :vazio="!despesas.dados.value?.dados.length"
        icone="dinheiro"
        mensagem="Nenhuma conta programada ainda. Cadastre o aluguel, o contador, as assinaturas."
        @repetir="despesas.recarregar"
      >
        <template #acao>
          <button class="botao primario" @click="abrir()"><Icone nome="mais" /> Cadastrar conta programada</button>
        </template>
        <table v-if="despesas.dados.value">
          <thead>
            <tr>
              <ColunaOrdem campo="descricao" :ordem="ordem" @ordenar="ordenar">Conta</ColunaOrdem>
              <ColunaOrdem campo="dia" :ordem="ordem" @ordenar="ordenar">Próximo pagamento</ColunaOrdem>
              <ColunaOrdem campo="valor" num :ordem="ordem" @ordenar="ordenar">Valor</ColunaOrdem>
              <th class="num">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in despesas.dados.value.dados"
              :key="d.id"
              :class="d.proximo_id ? `linha-${d.proximo_situacao}` : undefined"
            >
              <td>
                <div class="titulo-celula">
                  {{ d.descricao }}
                  <span v-if="!d.ativa" class="selo" style="margin-left: 6px">Inativa</span>
                </div>
                <div class="sub-celula" :title="d.fim ? `De ${data(d.inicio)} até ${data(d.fim)}` : `Desde ${data(d.inicio)}`">
                  {{ d.categoria ? `${d.categoria} · ` : '' }}todo dia {{ d.dia_vencimento }}
                  {{ d.fim ? `· até ${data(d.fim)}` : '' }}
                </div>
              </td>
              <td>
                <template v-if="d.proximo_vencimento">
                  <div class="linha-proximo nowrap">
                    {{ data(d.proximo_vencimento) }}
                    <Selo :situacao="d.proximo_situacao" />
                  </div>
                  <div class="sub-celula">
                    {{ prazo(diasAte(d.proximo_vencimento)) }}
                    <template v-if="d.proximo_vencimento_original">
                      · adiada de {{ data(d.proximo_vencimento_original) }}
                    </template>
                    <template v-if="Number(d.pendentes) > 1"> · {{ d.pendentes }} meses em aberto</template>
                  </div>
                </template>
                <span v-else class="fraco">Nada em aberto</span>
              </td>
              <td class="dinheiro">
                {{ moeda(d.proximo_valor ?? d.valor) }}
                <div v-if="d.proximo_valor && Number(d.proximo_valor) !== Number(d.valor)" class="sub-celula">
                  mensal {{ moeda(d.valor) }}
                </div>
                <div class="sub-celula">{{ moeda(d.pago_12_meses) }} pagos em 12 meses</div>
              </td>
              <td class="num nowrap">
                <template v-if="d.proximo_id">
                  <button class="botao pequeno primario" @click="abrirBaixa(d)">
                    <Icone nome="confirmar" /> Dar baixa
                  </button>
                  <button class="botao pequeno" title="Passa o vencimento para o mês seguinte" @click="adiar(d)">
                    <Icone nome="adiar" /> Adiar
                  </button>
                </template>
                <button class="botao icone" aria-label="Editar conta programada" @click="abrir(d)">
                  <Icone nome="editar" />
                </button>
                <button class="botao icone perigo" aria-label="Excluir conta programada" @click="excluir(d)">
                  <Icone nome="excluir" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <Paginacao
          v-if="despesas.dados.value"
          :pagina="despesas.dados.value.pagina"
          :paginas="despesas.dados.value.paginas"
          :total="despesas.dados.value.total"
          @mudar="pagina = $event; despesas.recarregar()"
        />
      </Estado>
    </section>

    <ModalPagamento
      v-if="modalBaixa && baixa"
      :form="formBaixa"
      :salvando="salvando"
      :erro="erroFormulario"
      titulo="Dar baixa"
      confirmar="Confirmar pagamento"
      :total="Number(baixa.proximo_valor)"
      saida
      @fechar="modalBaixa = false"
      @confirmar="salvarBaixa"
    >
      <div class="resumo-modal">
        <div>Conta<strong>{{ baixa.descricao }}</strong></div>
        <div>Vencimento<strong>{{ data(baixa.proximo_vencimento) }}</strong></div>
        <div>Valor<strong>{{ moeda(baixa.proximo_valor) }}</strong></div>
      </div>
      <p class="dica" style="margin: -6px 0 14px">
        Pode dar baixa antes do vencimento: o valor sai da conta escolhida na data informada.
      </p>
    </ModalPagamento>

    <Modal
      v-if="modal"
      :titulo="editando ? 'Editar conta programada' : 'Nova conta programada'"
      descricao="O lançamento de cada mês é criado sozinho. Lançamentos já pagos não mudam se você reajustar o valor."
      :salvando="salvando"
      @fechar="modal = false"
      @confirmar="salvar"
    >
      <div class="campo">
        <label for="d-descricao">Descrição *</label>
        <input id="d-descricao" v-model="form.descricao" required maxlength="200" placeholder="Ex.: Aluguel da sala" autofocus />
      </div>
      <div class="grade-2">
        <CampoMoeda id="d-valor" v-model="form.valor" rotulo="Valor mensal *" obrigatorio />
        <div class="campo">
          <label for="d-dia">Vence todo dia *</label>
          <input id="d-dia" v-model.number="form.dia_vencimento" type="number" min="1" max="31" required />
          <span class="dica">Em meses mais curtos, cai no último dia.</span>
        </div>
      </div>
      <div class="grade-2">
        <div class="campo">
          <label for="d-inicio">A partir de *</label>
          <input id="d-inicio" v-model="form.inicio" type="date" required />
        </div>
        <div class="campo">
          <label for="d-fim">Até (opcional)</label>
          <input id="d-fim" v-model="form.fim" type="date" :min="form.inicio" />
          <span class="dica">Em branco = sem prazo para acabar.</span>
        </div>
      </div>
      <div class="campo">
        <label for="d-categoria">Categoria</label>
        <input id="d-categoria" v-model="form.categoria" maxlength="60" placeholder="Ex.: Estrutura, Impostos, Software" />
      </div>
      <label class="opcao">
        <input v-model="form.ativa" type="checkbox" />
        <span>
          <strong>Ativa</strong>
          <span class="dica">Desmarque para parar de cobrar: os meses futuros em aberto somem e o histórico fica.</span>
        </span>
      </label>
      <div class="campo">
        <label for="d-observacoes">Observações</label>
        <textarea id="d-observacoes" v-model="form.observacoes" maxlength="2000" />
      </div>
      <Aviso :texto="erroFormulario" />
    </Modal>
  </div>
</template>

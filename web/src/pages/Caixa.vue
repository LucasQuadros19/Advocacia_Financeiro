<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Aviso from '../components/Aviso.vue'
import CampoCarteira from '../components/CampoCarteira.vue'
import CampoMoeda from '../components/CampoMoeda.vue'
import Cartao from '../components/Cartao.vue'
import ColunaOrdem from '../components/ColunaOrdem.vue'
import Estado from '../components/Estado.vue'
import Icone from '../components/Icone.vue'
import Modal from '../components/Modal.vue'
import ModalLancamento from '../components/ModalLancamento.vue'
import ModalPagamento, { type FormPagamento, type Repasse } from '../components/ModalPagamento.vue'
import ModalTransferencia from '../components/ModalTransferencia.vue'
import Paginacao from '../components/Paginacao.vue'
import Selo from '../components/Selo.vue'
import { api, type Pagina } from '../api.ts'
import { avisar, confirmar } from '../avisos.ts'
import { data, hoje, moeda, paraNumero, percentual, prazo, rotuloForma } from '../format.ts'
import { useOrdenacao } from '../ordenacao.ts'
import { useRecurso } from '../recurso.ts'

type Origem = 'parcela' | 'recebimento' | 'despesa' | 'repasse' | 'manual' | 'transferencia'
type Lancamento = {
  id: string; tipo: 'entrada' | 'saida' | 'transferencia'; origem: Origem
  descricao: string; contraparte: string; cliente_id: string | null; caso_id: string | null
  caso_titulo: string | null; advogado_id: string | null
  pai_id: string | null; pai_descricao: string | null
  numero: number | null; total_parcelas: number | null; e_entrada: boolean; categoria: string | null
  valor: string; valor_parcela: string | null; vencimento: string; status: string; data_pagamento: string | null
  forma_pagamento: string | null; carteira_id: string | null; carteira_nome: string | null
  carteira_destino_id: string | null; carteira_destino_nome: string | null; observacoes: string | null
  situacao: string; dias_para_vencimento: number
}
type Totais = { entrou: string; saiu: string; a_receber: string; a_pagar: string; saldo: string; repassado: string }
type Caso = {
  caso_id: string | null; caso_titulo: string | null; cliente_id: string; cliente_nome: string; percentual: string
  total_recebido: string; repassado: string; advogado_recebido: string; advogado_a_receber: string
}
type Advogado = { id: string; nome: string; principal: boolean }
type Carteira = {
  id: string; nome: string; tipo: 'banco' | 'dinheiro'; ativa: boolean
  saldo: string; saldo_fim_mes: string; entrou_mes: string; saiu_mes: string
}
type PaginaCaixa = Pagina<Lancamento> & { totais: Totais }

const mesAtual = hoje().slice(0, 7)
const aba = ref<'movimento' | 'aberto' | 'casos'>('movimento')
const mes = ref(mesAtual)
const tipo = ref('')
const conta = ref('')
const pagina = ref(1)
const paginaReceber = ref(1)
const paginaPagar = ref(1)
const paginaCasos = ref(1)

const voltarOuRecarregar = (paginaAtual: { value: number }, recarregar: () => void) => () =>
  paginaAtual.value === 1 ? recarregar() : (paginaAtual.value = 1)

const movimento = useRecurso(() =>
  api.get<PaginaCaixa>(
    `/caixa/lancamentos?pagina=${pagina.value}&limite=30&mes=${mes.value}&status=pago` +
      `${tipo.value ? `&tipo=${tipo.value}` : ''}${conta.value ? `&carteira_id=${conta.value}` : ''}`,
  ),
)
const aReceber = useRecurso(() =>
  api.get<PaginaCaixa>(
    `/caixa/lancamentos?status=pendente&tipo=entrada&pagina=${paginaReceber.value}&limite=30${ordemReceber.query()}`,
  ),
)
const aPagar = useRecurso(() =>
  api.get<PaginaCaixa>(
    `/caixa/lancamentos?status=pendente&tipo=saida&pagina=${paginaPagar.value}&limite=30${ordemPagar.query()}`,
  ),
)
const porCaso = useRecurso(() =>
  api.get<Pagina<Caso> & { advogado: { nome: string } | null }>(
    `/caixa?pagina=${paginaCasos.value}&limite=20${ordemCasos.query()}`,
  ),
)
const repassesAbertos = useRecurso(() =>
  api.get<Pagina<Lancamento>>('/caixa/lancamentos?origem=repasse&status=pendente&limite=100'),
)
const advogados = useRecurso(() => api.get<Pagina<Advogado>>('/advogados?limite=100'))
const carteiras = useRecurso(() =>
  api.get<{ dados: Carteira[]; sem_carteira: Carteira | null }>(`/carteiras?mes=${mes.value}`),
)

const ordemReceber = useOrdenacao(voltarOuRecarregar(paginaReceber, aReceber.recarregar))
const ordemPagar = useOrdenacao(voltarOuRecarregar(paginaPagar, aPagar.recarregar))
const ordemCasos = useOrdenacao(voltarOuRecarregar(paginaCasos, porCaso.recarregar))

watch([mes, tipo, conta], () => {
  pagina.value = 1
  movimento.recarregar()
})
watch(mes, carteiras.recarregar)
watch(pagina, movimento.recarregar)
watch(paginaReceber, aReceber.recarregar)
watch(paginaPagar, aPagar.recarregar)
watch(paginaCasos, porCaso.recarregar)
onMounted(() => {
  movimento.recarregar()
  aReceber.recarregar()
  aPagar.recarregar()
  repassesAbertos.recarregar()
  porCaso.recarregar()
  advogados.recarregar()
  carteiras.recarregar()
})

const atualizar = () =>
  Promise.all([
    movimento.recarregar(),
    aReceber.recarregar(),
    aPagar.recarregar(),
    repassesAbertos.recarregar(),
    porCaso.recarregar(),
    carteiras.recarregar(),
  ])

const emAberto = computed(() => (aReceber.dados.value?.total ?? 0) + (aPagar.dados.value?.total ?? 0))

const contas = computed(() => carteiras.dados.value?.dados ?? [])
const semConta = computed(() => {
  const s = carteiras.dados.value?.sem_carteira
  return s && (Number(s.saldo) !== 0 || Number(s.entrou_mes) !== 0 || Number(s.saiu_mes) !== 0) ? s : null
})
const somar = (campo: 'saldo' | 'saldo_fim_mes') =>
  [...contas.value, ...(semConta.value ? [semConta.value] : [])].reduce(
    (s, c) => s + Math.round(Number(c[campo]) * 100),
    0,
  ) / 100
const totalCaixa = computed(() => somar('saldo'))
const totalFimMes = computed(() => somar('saldo_fim_mes'))

// o repasse nasce a pagar, então não entra no extrato sozinho: ele aparece preso à entrada que o gerou
const repassesDe = (pai: string) => (repassesAbertos.dados.value?.dados ?? []).filter((r) => r.pai_id === pai)

const meses = computed(() => {
  const base = new Date()
  return Array.from({ length: 15 }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth() - 12 + i, 1)
    return {
      valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rotulo: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    }
  }).reverse()
})
const rotuloMes = (valor: string) => meses.value.find((m) => m.valor === valor)?.rotulo ?? valor

const sinal = (l: Lancamento) => {
  if (l.tipo === 'entrada') return 1
  if (l.tipo === 'saida') return -1
  if (conta.value && l.carteira_destino_id === conta.value) return 1
  if (conta.value && l.carteira_id === conta.value) return -1
  return 0
}

const porDia = computed(() => {
  const grupos = new Map<string, Lancamento[]>()
  for (const l of movimento.dados.value?.dados ?? []) {
    const dia = (l.data_pagamento ?? l.vencimento).slice(0, 10)
    grupos.set(dia, [...(grupos.get(dia) ?? []), l])
  }
  return [...grupos.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dia, itens]) => ({
      dia,
      itens,
      entradas: itens.reduce((s, l) => s + (sinal(l) > 0 ? Number(l.valor) : 0), 0),
      saidas: itens.reduce((s, l) => s + (sinal(l) < 0 ? Number(l.valor) : 0), 0),
    }))
})

const salvando = ref(false)
const erroFormulario = ref('')

async function executar(acao: () => Promise<unknown>, sucesso: string, fechar?: () => void) {
  salvando.value = true
  erroFormulario.value = ''
  try {
    await acao()
    fechar?.()
    avisar(sucesso)
    await atualizar()
  } catch (e) {
    const mensagem = (e as Error).message
    if (fechar) erroFormulario.value = mensagem
    else avisar(mensagem, 'erro')
  } finally {
    salvando.value = false
  }
}

const modalLancamento = ref(false)
function abrirLancamento() {
  erroFormulario.value = ''
  modalLancamento.value = true
}
const salvarLancamento = (corpo: Record<string, unknown>) => {
  const divisao = (corpo.repasses as { percentual: number }[] | undefined) ?? []
  const repassado = divisao.reduce((s, r) => s + (Number(corpo.valor) * r.percentual) / 100, 0)
  return executar(
    () => api.post('/caixa/lancamentos', corpo),
    divisao.length
      ? `Lançamento registrado. ${moeda(repassado)} entrou como saída a pagar para o advogado.`
      : 'Lançamento registrado.',
    () => (modalLancamento.value = false),
  )
}

const modalTransferencia = ref(false)
function abrirTransferencia() {
  erroFormulario.value = ''
  modalTransferencia.value = true
}
const salvarTransferencia = (corpo: Record<string, unknown>) =>
  executar(
    () => api.post('/caixa/transferencias', corpo),
    'Transferência registrada.',
    () => (modalTransferencia.value = false),
  )

const modalPagamento = ref(false)
const atual = ref<Lancamento>()
const formPagamento = reactive<FormPagamento>({
  data_pagamento: hoje(), forma_pagamento: '', observacoes: '', carteira_id: '', valor: '',
})

const rotaPagamento = (l: Lancamento) =>
  l.origem === 'parcela'
    ? `/parcelas/${l.id}/pagamento`
    : l.origem === 'repasse'
      ? `/repasses/${l.id}/pagamento`
      : `/despesas/lancamentos/${l.id}/pagamento`

function abrirPagamento(l: Lancamento) {
  atual.value = l
  Object.assign(formPagamento, {
    data_pagamento: hoje(),
    forma_pagamento: l.forma_pagamento ?? '',
    observacoes: '',
    carteira_id: '',
    valor: Number(l.valor).toFixed(2).replace('.', ','),
  })
  erroFormulario.value = ''
  modalPagamento.value = true
}

const salvarPagamento = (repasses: Repasse[]) => {
  const parcela = atual.value!.origem === 'parcela'
  return executar(
    () =>
      api.post(rotaPagamento(atual.value!), {
        data_pagamento: formPagamento.data_pagamento,
        forma_pagamento: formPagamento.forma_pagamento || undefined,
        carteira_id: formPagamento.carteira_id || undefined,
        observacoes: formPagamento.observacoes || undefined,
        ...(parcela ? { valor: paraNumero(formPagamento.valor) } : {}),
        ...(parcela && repasses.length ? { repasses } : {}),
      }),
    repasses.length ? 'Pagamento registrado e repasse lançado.' : 'Pagamento registrado.',
    () => (modalPagamento.value = false),
  )
}

const modalAjuste = ref(false)
const formAjuste = reactive({ valor: '', vencimento: '' })
function abrirAjuste(l: Lancamento) {
  atual.value = l
  Object.assign(formAjuste, { valor: Number(l.valor).toFixed(2).replace('.', ','), vencimento: l.vencimento })
  erroFormulario.value = ''
  modalAjuste.value = true
}
const salvarAjuste = () =>
  executar(
    () =>
      api.patch(`/despesas/lancamentos/${atual.value!.id}`, {
        valor: paraNumero(formAjuste.valor),
        vencimento: formAjuste.vencimento,
      }),
    'Valor do mês ajustado.',
    () => (modalAjuste.value = false),
  )

async function adiar(l: Lancamento) {
  const ok = await confirmar(
    'Adiar para o mês seguinte',
    `"${l.descricao}" de ${moeda(l.valor)} vencia em ${data(l.vencimento)} e passa para o mês seguinte. ` +
      'A conta continua devida, só muda o vencimento.',
    { confirmar: 'Adiar' },
  )
  if (ok) await executar(() => api.post(`/despesas/lancamentos/${l.id}/adiar`), `${l.descricao} adiada para o mês seguinte.`)
}

const modalConta = ref(false)
const novaConta = ref('')
function abrirTrocaConta(l: Lancamento) {
  atual.value = l
  novaConta.value = l.carteira_id ?? ''
  erroFormulario.value = ''
  modalConta.value = true
}
const salvarTrocaConta = () =>
  executar(
    () => api.patch(`/caixa/movimentos/${atual.value!.origem}/${atual.value!.id}`, { carteira_id: novaConta.value }),
    'Conta do movimento atualizada.',
    () => (modalConta.value = false),
  )

const ROTA_ESTORNO: Record<Origem, (id: string) => string> = {
  parcela: () => '',
  recebimento: (id) => `/recebimentos/${id}`,
  despesa: (id) => `/despesas/lancamentos/${id}/pagamento`,
  repasse: (id) => `/repasses/${id}/pagamento`,
  manual: (id) => `/caixa/lancamentos/${id}`,
  transferencia: (id) => `/caixa/transferencias/${id}`,
}

async function estornar(l: Lancamento) {
  const excluir = l.origem === 'manual' || l.origem === 'transferencia'
  const texto = excluir
    ? `"${l.descricao}" de ${moeda(l.valor)} será removido do caixa.` +
      (l.origem === 'manual' ? ' Os repasses criados por ele somem junto.' : '')
    : `"${l.descricao}" de ${moeda(l.valor)} volta para ${l.tipo === 'entrada' ? 'a receber' : 'a pagar'}.` +
      (l.origem === 'recebimento' ? ' Os repasses lançados nesse recebimento também são desfeitos.' : '')
  const ok = await confirmar(excluir ? 'Excluir do caixa' : 'Estornar pagamento', texto, {
    confirmar: excluir ? 'Excluir' : 'Estornar',
    perigo: true,
  })
  if (ok) {
    await executar(() => api.delete(ROTA_ESTORNO[l.origem](l.id)), excluir ? 'Removido do caixa.' : 'Pagamento estornado.')
  }
}

const ORIGEM: Record<Origem, string> = {
  parcela: 'Cliente',
  recebimento: 'Cliente',
  despesa: 'Conta programada',
  repasse: 'Repasse',
  manual: 'Manual',
  transferencia: 'Transferência',
}
const diaLongo = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', weekday: 'short', timeZone: 'UTC',
  })
const parcial = (l: Lancamento) => l.valor_parcela !== null && Number(l.valor) < Number(l.valor_parcela)
</script>

<template>
  <div class="topo">
    <div>
      <h1>Caixa</h1>
      <p>
        Onde está o dinheiro e tudo o que entra e sai
        <strong v-if="porCaso.dados.value?.advogado">de {{ porCaso.dados.value.advogado.nome }}</strong>
        <span v-else>do escritório</span>.
      </p>
    </div>
    <div class="acoes">
      <button class="botao" :disabled="contas.filter((c) => c.ativa).length < 2" @click="abrirTransferencia">
        <Icone nome="transferir" /> Transferir
      </button>
      <RouterLink class="botao" to="/contas-programadas"><Icone nome="relogio" /> Contas programadas</RouterLink>
      <button class="botao primario" @click="abrirLancamento"><Icone nome="mais" /> Novo lançamento</button>
    </div>
  </div>

  <Estado :carregando="movimento.carregando.value" :erro="movimento.erro.value" @repetir="movimento.recarregar">
    <template v-if="movimento.dados.value && aReceber.dados.value && aPagar.dados.value">
      <section class="cartoes">
        <Cartao
          rotulo="Total em caixa"
          :valor="moeda(totalCaixa)"
          :tom="totalCaixa < 0 ? 'erro' : 'acao'"
          icone="caixa"
          destaque
          :nota="mes === mesAtual ? 'Somando bancos e dinheiro' : `No fim de ${rotuloMes(mes)}: ${moeda(totalFimMes)}`"
        />
        <Cartao
          v-for="c in contas"
          :key="c.id"
          :rotulo="c.ativa ? c.nome : `${c.nome} (desativada)`"
          :valor="moeda(c.saldo)"
          :icone="c.tipo === 'dinheiro' ? 'dinheiro' : 'banco'"
          :tom="Number(c.saldo) < 0 ? 'erro' : undefined"
        >
          <template #nota>
            <span class="entrada">+{{ moeda(c.entrou_mes) }}</span> ·
            <span class="saida">−{{ moeda(c.saiu_mes) }}</span>
            em {{ mes === mesAtual ? 'este mês' : rotuloMes(mes) }}
          </template>
        </Cartao>
        <Cartao
          v-if="semConta"
          class="apagado"
          rotulo="Sem conta informada"
          :valor="moeda(semConta.saldo)"
          icone="alerta"
          nota="Movimentos sem banco. Use “Trocar conta” no extrato."
        />
      </section>
      <p v-if="carteiras.dados.value && !contas.length" class="aviso alerta">
        <Icone nome="alerta" />
        <span>
          Cadastre seus bancos e o dinheiro em espécie em
          <RouterLink to="/configuracoes?aba=bancos">Configurações</RouterLink> para ver quanto há em cada lugar.
        </span>
      </p>

      <div class="abas">
        <button :class="{ ativo: aba === 'movimento' }" @click="aba = 'movimento'">Movimento</button>
        <button :class="{ ativo: aba === 'aberto' }" @click="aba = 'aberto'">Em aberto ({{ emAberto }})</button>
        <button :class="{ ativo: aba === 'casos' }" @click="aba = 'casos'">Por caso</button>
      </div>

      <section v-if="aba === 'movimento'" class="painel">
        <header>
          <div class="resumo-mes" aria-label="Resumo do mês">
            <span class="entrada">Entrou<strong>{{ moeda(movimento.dados.value.totais.entrou) }}</strong></span>
            <span class="saida">Saiu<strong>{{ moeda(movimento.dados.value.totais.saiu) }}</strong></span>
            <span>Resultado do mês<strong>{{ moeda(movimento.dados.value.totais.saldo) }}</strong></span>
          </div>
          <div class="filtros">
            <div class="campo">
              <label for="mes">Mês</label>
              <select id="mes" v-model="mes">
                <option v-for="m in meses" :key="m.valor" :value="m.valor">{{ m.rotulo }}</option>
              </select>
            </div>
            <div class="campo">
              <label for="tipo">Mostrar</label>
              <select id="tipo" v-model="tipo">
                <option value="">Tudo</option>
                <option value="entrada">Só entradas</option>
                <option value="saida">Só saídas</option>
                <option value="transferencia">Só transferências</option>
              </select>
            </div>
            <div v-if="contas.length" class="campo">
              <label for="filtro-conta">Conta</label>
              <select id="filtro-conta" v-model="conta">
                <option value="">Todas</option>
                <option v-for="c in contas" :key="c.id" :value="c.id">{{ c.nome }}</option>
              </select>
            </div>
          </div>
        </header>

        <Estado :vazio="!porDia.length" icone="caixa" mensagem="Nenhuma movimentação neste mês.">
          <template #acao>
            <button class="botao primario" @click="abrirLancamento"><Icone nome="mais" /> Lançar no caixa</button>
          </template>

          <table class="extrato-tabela">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Conta</th>
                <th>Origem</th>
                <th class="num">Entrada</th>
                <th class="num">Saída</th>
                <th class="num"><span class="sr">Ações</span></th>
              </tr>
            </thead>
            <tbody v-for="grupo in porDia" :key="grupo.dia">
              <tr class="linha-dia">
                <th colspan="3" scope="rowgroup">{{ diaLongo(grupo.dia) }}</th>
                <td class="dinheiro entrada">{{ grupo.entradas ? moeda(grupo.entradas) : '' }}</td>
                <td class="dinheiro saida">{{ grupo.saidas ? moeda(grupo.saidas) : '' }}</td>
                <td class="num nowrap" :class="grupo.entradas - grupo.saidas < 0 ? 'saida' : 'entrada'">
                  {{ grupo.entradas - grupo.saidas < 0 ? '−' : '+' }}{{ moeda(Math.abs(grupo.entradas - grupo.saidas)) }}
                </td>
              </tr>
              <template v-for="l in grupo.itens" :key="`${l.origem}-${l.id}`">
                <tr>
                  <td>
                    <div class="titulo-celula">
                      <Icone v-if="l.origem === 'repasse'" nome="proximo" :tamanho="13" class="fraco" />
                      <Icone v-if="l.tipo === 'transferencia'" nome="transferir" :tamanho="13" class="fraco" />
                      {{ l.descricao }}
                    </div>
                    <div class="sub-celula">
                      <RouterLink v-if="l.cliente_id" :to="`/clientes/${l.cliente_id}`">{{ l.contraparte }}</RouterLink>
                      <span v-else-if="l.tipo !== 'transferencia'">{{ l.contraparte }}</span>
                      <template v-if="l.pai_descricao && l.origem === 'repasse'"> · veio de {{ l.pai_descricao }}</template>
                      <template v-else-if="l.total_parcelas && l.total_parcelas > 1">
                        · {{ l.e_entrada ? 'entrada' : `parcela ${l.numero}/${l.total_parcelas}` }}
                      </template>
                      <template v-if="parcial(l)"> · parcial de {{ moeda(l.valor_parcela) }}</template>
                      <template v-if="l.forma_pagamento"> · {{ rotuloForma(l.forma_pagamento) }}</template>
                      <template v-if="l.tipo === 'transferencia' && !sinal(l)">{{ moeda(l.valor) }} mudaram de conta</template>
                    </div>
                    <div v-if="l.observacoes" class="obs"><Icone nome="casos" :tamanho="12" /> {{ l.observacoes }}</div>
                  </td>
                  <td class="fraco nowrap">
                    {{ l.tipo === 'transferencia' ? `${l.carteira_nome} → ${l.carteira_destino_nome}` : (l.carteira_nome ?? 'Sem conta') }}
                  </td>
                  <td><span class="selo" :class="{ acao: l.origem === 'repasse' }">{{ ORIGEM[l.origem] }}</span></td>
                  <td class="dinheiro entrada">{{ sinal(l) > 0 ? moeda(l.valor) : '' }}</td>
                  <td class="dinheiro saida">{{ sinal(l) < 0 ? moeda(l.valor) : '' }}</td>
                  <td class="num nowrap">
                    <button
                      v-if="l.tipo !== 'transferencia'"
                      class="botao icone"
                      aria-label="Trocar conta"
                      title="Trocar a conta deste movimento"
                      @click="abrirTrocaConta(l)"
                    >
                      <Icone nome="banco" />
                    </button>
                    <button
                      class="botao icone"
                      :aria-label="l.origem === 'manual' || l.origem === 'transferencia' ? 'Excluir do caixa' : 'Estornar pagamento'"
                      :title="l.origem === 'manual' || l.origem === 'transferencia' ? 'Excluir do caixa' : 'Estornar pagamento'"
                      @click="estornar(l)"
                    >
                      <Icone :nome="l.origem === 'manual' || l.origem === 'transferencia' ? 'excluir' : 'desfazer'" />
                    </button>
                  </td>
                </tr>
                <tr v-for="r in repassesDe(l.id)" :key="r.id" class="linha-filho">
                  <td colspan="3">
                    <div class="titulo-celula"><span class="tronco" aria-hidden="true">↳</span> {{ r.descricao }}</div>
                    <div class="sub-celula">parte de {{ l.descricao }} · ainda não paga <span class="selo proxima">A pagar</span></div>
                  </td>
                  <td></td>
                  <td class="dinheiro fraco">{{ moeda(r.valor) }}</td>
                  <td class="num">
                    <button class="botao pequeno primario" @click="abrirPagamento(r)">
                      <Icone nome="confirmar" /> Pagar
                    </button>
                  </td>
                </tr>
              </template>
            </tbody>
            <tfoot>
              <tr>
                <th colspan="3">Total do mês{{ conta || tipo ? ' (com os filtros)' : '' }}</th>
                <td class="dinheiro entrada">{{ moeda(movimento.dados.value.totais.entrou) }}</td>
                <td class="dinheiro saida">{{ moeda(movimento.dados.value.totais.saiu) }}</td>
                <td class="num nowrap" :class="Number(movimento.dados.value.totais.saldo) < 0 ? 'saida' : 'entrada'">
                  {{ moeda(movimento.dados.value.totais.saldo) }}
                </td>
              </tr>
            </tfoot>
          </table>

          <Paginacao
            :pagina="movimento.dados.value.pagina"
            :paginas="movimento.dados.value.paginas"
            :total="movimento.dados.value.total"
            @mudar="pagina = $event"
          />
        </Estado>
      </section>

      <template v-if="aba === 'aberto'">
        <section class="painel">
          <header>
            <div>
              <h2>A receber</h2>
              <p>Clientes que ainda não pagaram. Dá para receber só uma parte.</p>
            </div>
            <strong class="dinheiro entrada">{{ moeda(aReceber.dados.value.totais.a_receber) }}</strong>
          </header>
          <Estado
            :erro="aReceber.erro.value"
            :vazio="!aReceber.dados.value.dados.length"
            icone="confirmar"
            mensagem="Nada a receber. Tudo em dia."
            @repetir="aReceber.recarregar"
          >
            <table>
              <thead>
                <tr>
                  <ColunaOrdem campo="descricao" :ordem="ordemReceber.ordem" @ordenar="ordemReceber.ordenar">
                    Cobrança
                  </ColunaOrdem>
                  <ColunaOrdem campo="contraparte" :ordem="ordemReceber.ordem" @ordenar="ordemReceber.ordenar">
                    Cliente
                  </ColunaOrdem>
                  <ColunaOrdem campo="vencimento" :ordem="ordemReceber.ordem" @ordenar="ordemReceber.ordenar">
                    Vencimento
                  </ColunaOrdem>
                  <ColunaOrdem campo="valor" num :ordem="ordemReceber.ordem" @ordenar="ordemReceber.ordenar">
                    Falta receber
                  </ColunaOrdem>
                  <th>Status</th>
                  <th class="num"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in aReceber.dados.value.dados" :key="l.id" :class="`linha-${l.situacao}`">
                  <td>
                    <div class="titulo-celula">{{ l.descricao }}</div>
                    <div v-if="l.total_parcelas && l.total_parcelas > 1" class="sub-celula">
                      {{ l.e_entrada ? 'Entrada' : `Parcela ${l.numero}/${l.total_parcelas}` }}
                    </div>
                    <div v-if="l.observacoes" class="obs"><Icone nome="casos" :tamanho="12" /> {{ l.observacoes }}</div>
                  </td>
                  <td>
                    <RouterLink v-if="l.cliente_id" :to="`/clientes/${l.cliente_id}`" class="fraco">
                      {{ l.contraparte }}
                    </RouterLink>
                    <span v-else class="fraco">{{ l.contraparte }}</span>
                  </td>
                  <td class="nowrap">
                    {{ data(l.vencimento) }}
                    <span class="fraco"> · {{ prazo(l.dias_para_vencimento) }}</span>
                  </td>
                  <td class="dinheiro">
                    {{ moeda(l.valor) }}
                    <div v-if="parcial(l)" class="sub-celula">
                      recebido {{ moeda(Number(l.valor_parcela) - Number(l.valor)) }} de {{ moeda(l.valor_parcela) }}
                    </div>
                  </td>
                  <td><Selo :situacao="parcial(l) ? 'parcial' : l.situacao" /></td>
                  <td class="num">
                    <button class="botao pequeno primario" @click="abrirPagamento(l)">
                      <Icone nome="confirmar" /> Receber
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <Paginacao
              :pagina="aReceber.dados.value.pagina"
              :paginas="aReceber.dados.value.paginas"
              :total="aReceber.dados.value.total"
              @mudar="paginaReceber = $event"
            />
          </Estado>
        </section>

        <section class="painel">
          <header>
            <div>
              <h2>A pagar</h2>
              <p>Contas programadas e repasses que você ainda deve.</p>
            </div>
            <strong class="dinheiro saida">{{ moeda(aPagar.dados.value.totais.a_pagar) }}</strong>
          </header>
          <Estado
            :erro="aPagar.erro.value"
            :vazio="!aPagar.dados.value.dados.length"
            icone="confirmar"
            mensagem="Nada a pagar. Tudo em dia."
            @repetir="aPagar.recarregar"
          >
            <table>
              <thead>
                <tr>
                  <ColunaOrdem campo="descricao" :ordem="ordemPagar.ordem" @ordenar="ordemPagar.ordenar">Conta</ColunaOrdem>
                  <ColunaOrdem campo="contraparte" :ordem="ordemPagar.ordem" @ordenar="ordemPagar.ordenar">Para</ColunaOrdem>
                  <ColunaOrdem campo="vencimento" :ordem="ordemPagar.ordem" @ordenar="ordemPagar.ordenar">
                    Vencimento
                  </ColunaOrdem>
                  <ColunaOrdem campo="valor" num :ordem="ordemPagar.ordem" @ordenar="ordemPagar.ordenar">Valor</ColunaOrdem>
                  <th>Status</th>
                  <th class="num"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in aPagar.dados.value.dados" :key="l.id" :class="`linha-${l.situacao}`">
                  <td>
                    <div class="titulo-celula">{{ l.descricao }}</div>
                    <div v-if="l.pai_descricao" class="sub-celula">veio de {{ l.pai_descricao }}</div>
                    <div v-if="l.observacoes" class="obs"><Icone nome="casos" :tamanho="12" /> {{ l.observacoes }}</div>
                  </td>
                  <td class="fraco">{{ l.contraparte }}</td>
                  <td class="nowrap">
                    {{ data(l.vencimento) }}
                    <span class="fraco"> · {{ prazo(l.dias_para_vencimento) }}</span>
                  </td>
                  <td class="dinheiro">{{ moeda(l.valor) }}</td>
                  <td><Selo :situacao="l.situacao" /></td>
                  <td class="num nowrap">
                    <button
                      v-if="l.origem === 'despesa'"
                      class="botao icone"
                      aria-label="Ajustar valor deste mês"
                      title="Ajustar valor ou vencimento só deste mês"
                      @click="abrirAjuste(l)"
                    >
                      <Icone nome="editar" />
                    </button>
                    <button
                      v-if="l.origem === 'despesa'"
                      class="botao icone"
                      aria-label="Adiar para o mês seguinte"
                      title="Adiar para o mês seguinte"
                      @click="adiar(l)"
                    >
                      <Icone nome="adiar" />
                    </button>
                    <button class="botao pequeno primario" @click="abrirPagamento(l)">
                      <Icone nome="confirmar" /> Pagar
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <Paginacao
              :pagina="aPagar.dados.value.pagina"
              :paginas="aPagar.dados.value.paginas"
              :total="aPagar.dados.value.total"
              @mudar="paginaPagar = $event"
            />
          </Estado>
        </section>
      </template>

      <section v-if="aba === 'casos'" class="painel">
        <header>
          <div>
            <h2>Por caso</h2>
            <p>Sua parte é o que entrou menos os repasses lançados. O que falta receber segue a divisão do caso.</p>
          </div>
        </header>
        <Estado
          :carregando="porCaso.carregando.value"
          :erro="porCaso.erro.value"
          :vazio="!porCaso.dados.value?.dados.length"
          mensagem="Nenhum valor registrado ainda."
          @repetir="porCaso.recarregar"
        >
          <table v-if="porCaso.dados.value">
            <thead>
              <tr>
                <ColunaOrdem campo="caso" :ordem="ordemCasos.ordem" @ordenar="ordemCasos.ordenar">Caso</ColunaOrdem>
                <ColunaOrdem campo="cliente" :ordem="ordemCasos.ordem" @ordenar="ordemCasos.ordenar">Cliente</ColunaOrdem>
                <ColunaOrdem campo="percentual" num :ordem="ordemCasos.ordem" @ordenar="ordemCasos.ordenar">
                  Sua parte
                </ColunaOrdem>
                <ColunaOrdem campo="recebido" num :ordem="ordemCasos.ordem" @ordenar="ordemCasos.ordenar">
                  Recebido no caso
                </ColunaOrdem>
                <ColunaOrdem campo="repassado" num :ordem="ordemCasos.ordem" @ordenar="ordemCasos.ordenar">
                  Repassado
                </ColunaOrdem>
                <ColunaOrdem campo="minha_recebida" num :ordem="ordemCasos.ordem" @ordenar="ordemCasos.ordenar">
                  Ficou com você
                </ColunaOrdem>
                <ColunaOrdem campo="minha_a_receber" num :ordem="ordemCasos.ordem" @ordenar="ordemCasos.ordenar">
                  Você ainda recebe
                </ColunaOrdem>
              </tr>
            </thead>
            <tbody>
              <tr v-for="linha in porCaso.dados.value.dados" :key="`${linha.caso_id}-${linha.cliente_id}`">
                <td class="nowrap">
                  <RouterLink v-if="linha.caso_id" class="titulo-celula" :to="`/casos/${linha.caso_id}`">
                    {{ linha.caso_titulo }}
                  </RouterLink>
                  <span v-else class="fraco">Sem caso vinculado</span>
                </td>
                <td class="nowrap">
                  <RouterLink :to="`/clientes/${linha.cliente_id}`" class="fraco">{{ linha.cliente_nome }}</RouterLink>
                </td>
                <td class="num">
                  <span class="selo" :class="Number(linha.percentual) === 0 ? 'vencida' : 'parcial'">
                    {{ percentual(linha.percentual) }}
                  </span>
                </td>
                <td class="dinheiro fraco">{{ moeda(linha.total_recebido) }}</td>
                <td class="dinheiro fraco">{{ moeda(linha.repassado) }}</td>
                <td class="dinheiro">{{ moeda(linha.advogado_recebido) }}</td>
                <td class="dinheiro">{{ moeda(linha.advogado_a_receber) }}</td>
              </tr>
            </tbody>
          </table>
          <Paginacao
            v-if="porCaso.dados.value"
            :pagina="porCaso.dados.value.pagina"
            :paginas="porCaso.dados.value.paginas"
            :total="porCaso.dados.value.total"
            @mudar="paginaCasos = $event"
          />
        </Estado>
      </section>
    </template>
  </Estado>

  <ModalLancamento
    v-if="modalLancamento"
    :salvando="salvando"
    :erro="erroFormulario"
    :advogados="advogados.dados.value?.dados ?? []"
    @fechar="modalLancamento = false"
    @confirmar="salvarLancamento"
  />

  <ModalTransferencia
    v-if="modalTransferencia"
    :salvando="salvando"
    :erro="erroFormulario"
    @fechar="modalTransferencia = false"
    @confirmar="salvarTransferencia"
  />

  <ModalPagamento
    v-if="modalPagamento && atual"
    :form="formPagamento"
    :salvando="salvando"
    :erro="erroFormulario"
    :titulo="atual.tipo === 'entrada' ? 'Registrar recebimento' : 'Registrar pagamento'"
    :confirmar="atual.tipo === 'entrada' ? 'Confirmar recebimento' : 'Confirmar pagamento'"
    :total="Number(atual.valor)"
    :parcial="atual.origem === 'parcela'"
    :saida="atual.tipo === 'saida'"
    :advogados="atual.origem === 'parcela' ? advogados.dados.value?.dados : undefined"
    :caso-id="atual.caso_id"
    @fechar="modalPagamento = false"
    @confirmar="salvarPagamento"
  >
    <div class="resumo-modal">
      <div>Lançamento<strong>{{ atual.descricao }}</strong></div>
      <div>{{ atual.tipo === 'entrada' ? 'Cliente' : 'Para' }}<strong>{{ atual.contraparte }}</strong></div>
      <div>{{ atual.origem === 'parcela' ? 'Falta receber' : 'Valor' }}<strong>{{ moeda(atual.valor) }}</strong></div>
    </div>
  </ModalPagamento>

  <Modal
    v-if="modalAjuste && atual"
    titulo="Ajustar este mês"
    descricao="Muda só este lançamento. A regra da conta programada continua igual."
    :salvando="salvando"
    @fechar="modalAjuste = false"
    @confirmar="salvarAjuste"
  >
    <div class="resumo-modal">
      <div>Conta<strong>{{ atual.descricao }}</strong></div>
      <div>Valor atual<strong>{{ moeda(atual.valor) }}</strong></div>
    </div>
    <div class="grade-2">
      <CampoMoeda id="ajuste-valor" v-model="formAjuste.valor" rotulo="Valor deste mês *" obrigatorio />
      <div class="campo">
        <label for="ajuste-vencimento">Vencimento *</label>
        <input id="ajuste-vencimento" v-model="formAjuste.vencimento" type="date" required />
      </div>
    </div>
    <Aviso :texto="erroFormulario" />
  </Modal>

  <Modal
    v-if="modalConta && atual"
    titulo="Trocar conta"
    descricao="Corrige em qual banco ou caixa este dinheiro entrou ou saiu."
    :salvando="salvando"
    @fechar="modalConta = false"
    @confirmar="salvarTrocaConta"
  >
    <div class="resumo-modal">
      <div>Movimento<strong>{{ atual.descricao }}</strong></div>
      <div>Valor<strong>{{ moeda(atual.valor) }}</strong></div>
      <div>Conta atual<strong>{{ atual.carteira_nome ?? 'Não informada' }}</strong></div>
    </div>
    <CampoCarteira id="nova-conta" v-model="novaConta" rotulo="Nova conta *" />
    <Aviso :texto="erroFormulario" />
  </Modal>
</template>

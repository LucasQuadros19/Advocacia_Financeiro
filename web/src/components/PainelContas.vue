<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Aviso from './Aviso.vue'
import CampoCarteira from './CampoCarteira.vue'
import CampoMoeda from './CampoMoeda.vue'
import Estado from './Estado.vue'
import Icone from './Icone.vue'
import Modal from './Modal.vue'
import ModalPagamento, { type FormPagamento, type Repasse } from './ModalPagamento.vue'
import Paginacao from './Paginacao.vue'
import Progresso from './Progresso.vue'
import Selo from './Selo.vue'
import { api, type Pagina } from '../api.ts'
import { avisar, confirmar, type LinkAviso } from '../avisos.ts'
import { FORMAS_PAGAMENTO, data, hoje, moeda, paraNumero, resumoCobranca, rotuloForma, rotuloParcela } from '../format.ts'
import { useRecurso } from '../recurso.ts'

type Recebimento = {
  id: string; valor: string; data: string; forma_pagamento: string | null; observacoes: string | null
  carteira_nome: string | null
}
type Parcela = {
  id: string; numero: number; total_parcelas: number; entrada: boolean; valor: string; valor_pago: string
  restante: string; vencimento: string; status: string; data_pagamento: string | null; forma_pagamento: string | null
  observacoes: string | null; situacao: string; recebimentos: Recebimento[]
}
type Conta = {
  id: string; descricao: string; valor_total: string; forma_pagamento: string | null; observacoes: string | null
  caso_id: string | null; caso_titulo: string | null; recebido: string; pendente: string; qtd_parcelas: string
  tem_entrada: boolean; situacao: string; proximo_vencimento: string | null; parcelas: Parcela[]
}

const props = defineProps<{
  clienteId: string
  casoId?: string
  casos?: { id: string; titulo: string }[]
  descricaoNova?: string
}>()
const emit = defineEmits<{ alterado: [] }>()

const pagina = ref(1)
const expandidas = ref<string[]>([])

const contas = useRecurso(() =>
  api.get<Pagina<Conta>>(
    `/clientes/${props.clienteId}/contas?pagina=${pagina.value}&limite=10${props.casoId ? `&caso_id=${props.casoId}` : ''}`,
  ),
)
const advogados = useRecurso(() => api.get<Pagina<{ id: string; nome: string; principal: boolean }>>('/advogados?limite=100'))

onMounted(async () => {
  advogados.recarregar()
  await contas.recarregar()
  const unica = contas.dados.value?.dados
  if (props.casoId && unica?.length === 1) expandidas.value = [unica[0]!.id]
})

function alternar(contaId: string) {
  expandidas.value = expandidas.value.includes(contaId)
    ? expandidas.value.filter((i) => i !== contaId)
    : [...expandidas.value, contaId]
}

const salvando = ref(false)
const erroFormulario = ref('')

async function executar<T>(
  acao: () => Promise<T>,
  sucesso: string,
  fechar?: () => void,
  link?: (resultado: T) => LinkAviso | undefined,
) {
  salvando.value = true
  erroFormulario.value = ''
  try {
    const resultado = await acao()
    fechar?.()
    avisar(sucesso, 'sucesso', link?.(resultado))
    await contas.recarregar()
    emit('alterado')
  } catch (e) {
    const mensagem = (e as Error).message
    if (fechar) erroFormulario.value = mensagem
    else avisar(mensagem, 'erro')
  } finally {
    salvando.value = false
  }
}

const modalConta = ref(false)
const contaEditando = ref<Conta>()
const formConta = reactive({
  descricao: '', valor_total: '', entrada: '', entrada_vencimento: hoje(), entrada_paga: true, entrada_carteira_id: '',
  quantidade_parcelas: 1, primeiro_vencimento: hoje(), forma_pagamento: '', caso_id: '', observacoes: '',
})
const resumoConta = computed(() =>
  resumoCobranca(formConta.valor_total, formConta.entrada, formConta.quantidade_parcelas),
)

function abrirConta(conta?: Conta) {
  contaEditando.value = conta
  Object.assign(formConta, {
    descricao: conta?.descricao ?? props.descricaoNova ?? '',
    valor_total: '',
    entrada: '',
    entrada_vencimento: hoje(),
    entrada_paga: true,
    entrada_carteira_id: '',
    quantidade_parcelas: 1,
    primeiro_vencimento: hoje(),
    forma_pagamento: conta?.forma_pagamento ?? '',
    caso_id: conta?.caso_id ?? props.casoId ?? '',
    observacoes: conta?.observacoes ?? '',
  })
  erroFormulario.value = ''
  modalConta.value = true
}

const salvarConta = () =>
  executar(
    () =>
      contaEditando.value
        ? api.put<{ id: string }>(`/contas/${contaEditando.value.id}`, {
            descricao: formConta.descricao,
            caso_id: formConta.caso_id || null,
            forma_pagamento: formConta.forma_pagamento || undefined,
            observacoes: formConta.observacoes || undefined,
          })
        : api.post<{ id: string }>('/contas', {
            cliente_id: props.clienteId,
            caso_id: formConta.caso_id || null,
            descricao: formConta.descricao,
            valor_total: resumoConta.value.total,
            entrada: resumoConta.value.entrada > 0 ? resumoConta.value.entrada : undefined,
            entrada_vencimento: resumoConta.value.entrada > 0 ? formConta.entrada_vencimento : undefined,
            entrada_paga: resumoConta.value.entrada > 0 ? formConta.entrada_paga : undefined,
            entrada_carteira_id:
              resumoConta.value.entrada > 0 && formConta.entrada_paga ? formConta.entrada_carteira_id || null : undefined,
            quantidade_parcelas: resumoConta.value.quantidade,
            primeiro_vencimento: formConta.primeiro_vencimento,
            forma_pagamento: formConta.forma_pagamento || undefined,
            observacoes: formConta.observacoes || undefined,
          }),
    contaEditando.value ? 'Cobrança atualizada.' : 'Cobrança criada.',
    () => (modalConta.value = false),
    (conta) =>
      !contaEditando.value && conta && resumoConta.value.pagamentos > 1
        ? { texto: 'Termo de parcelamento', href: `/imprimir/parcelamento/${conta.id}` }
        : undefined,
  )

const modalPagamento = ref(false)
const parcelaAtual = ref<Parcela>()
const casoDaParcela = ref<string | null>(null)
const formPagamento = reactive<FormPagamento>({
  data_pagamento: hoje(), forma_pagamento: '', observacoes: '', carteira_id: '', valor: '',
})

function abrirPagamento(parcela: Parcela, conta: Conta) {
  parcelaAtual.value = parcela
  casoDaParcela.value = conta.caso_id
  Object.assign(formPagamento, {
    data_pagamento: hoje(),
    forma_pagamento: parcela.forma_pagamento ?? conta.forma_pagamento ?? '',
    observacoes: '',
    carteira_id: '',
    valor: Number(parcela.restante).toFixed(2).replace('.', ','),
  })
  erroFormulario.value = ''
  modalPagamento.value = true
}

const salvarPagamento = (repasses: Repasse[]) =>
  executar(
    () =>
      api.post<{ recebimento_id: string }>(`/parcelas/${parcelaAtual.value!.id}/pagamento`, {
        valor: paraNumero(formPagamento.valor),
        data_pagamento: formPagamento.data_pagamento,
        forma_pagamento: formPagamento.forma_pagamento || undefined,
        carteira_id: formPagamento.carteira_id || undefined,
        observacoes: formPagamento.observacoes || undefined,
        ...(repasses.length ? { repasses } : {}),
      }),
    repasses.length ? 'Pagamento registrado e repasse lançado.' : 'Pagamento registrado.',
    () => (modalPagamento.value = false),
    (r) => ({ texto: 'Recibo', href: `/imprimir/recibo/recebimento/${r.recebimento_id}` }),
  )

const modalParcela = ref(false)
const formParcela = reactive({ valor: '', vencimento: hoje(), observacoes: '' })

function abrirParcela(parcela: Parcela) {
  parcelaAtual.value = parcela
  Object.assign(formParcela, {
    valor: Number(parcela.valor).toFixed(2).replace('.', ','),
    vencimento: parcela.vencimento,
    observacoes: parcela.observacoes ?? '',
  })
  erroFormulario.value = ''
  modalParcela.value = true
}

const salvarParcela = () =>
  executar(
    () =>
      api.patch(`/parcelas/${parcelaAtual.value!.id}`, {
        valor: paraNumero(formParcela.valor),
        vencimento: formParcela.vencimento,
        observacoes: formParcela.observacoes || undefined,
      }),
    'Parcela atualizada.',
    () => (modalParcela.value = false),
  )

async function estornar(parcela: Parcela, recebimento: Recebimento) {
  const ok = await confirmar(
    'Estornar recebimento',
    `${moeda(recebimento.valor)} recebidos em ${data(recebimento.data)} na parcela ${rotuloParcela(parcela)} voltam para ` +
      'a receber. Os repasses lançados nesse recebimento também são desfeitos.',
    { confirmar: 'Estornar', perigo: true },
  )
  if (ok) await executar(() => api.delete(`/recebimentos/${recebimento.id}`), 'Recebimento estornado.')
}

async function excluirConta(conta: Conta) {
  const ok = await confirmar(
    'Excluir cobrança',
    `"${conta.descricao}" e suas ${conta.qtd_parcelas} parcela(s) serão removidas. Cobranças com algum pagamento registrado não podem ser excluídas.`,
    { confirmar: 'Excluir', perigo: true },
  )
  if (ok) await executar(() => api.delete(`/contas/${conta.id}`), 'Cobrança excluída.')
}

const parcial = (p: Parcela) => p.status === 'pendente' && Number(p.valor_pago) > 0

defineExpose({ abrirConta, recarregar: contas.recarregar })
</script>

<template>
  <section class="painel">
    <header>
      <div>
        <h2>{{ casoId ? 'Cobranças e parcelas do caso' : 'Cobranças' }}</h2>
        <p>Clique na cobrança para ver as parcelas, receber e estornar.</p>
      </div>
      <button class="botao pequeno" @click="abrirConta()"><Icone nome="mais" /> Nova cobrança</button>
    </header>
    <Estado
      :carregando="contas.carregando.value"
      :erro="contas.erro.value"
      :vazio="!contas.dados.value?.dados.length"
      :mensagem="casoId ? 'Nenhuma cobrança vinculada a este caso.' : 'Nenhuma cobrança cadastrada para este cliente.'"
      icone="casos"
      @repetir="contas.recarregar"
    >
      <template #acao>
        <button class="botao primario" @click="abrirConta()"><Icone nome="mais" /> Lançar cobrança</button>
      </template>
      <table v-if="contas.dados.value">
        <thead>
          <tr>
            <th style="width: 34px"></th>
            <th style="min-width: 210px">Descrição</th>
            <th v-if="!casoId" class="nowrap">Caso</th>
            <th class="num" style="width: 170px">Valor total</th>
            <th class="num">Falta receber</th>
            <th class="nowrap">Próximo vencimento</th>
            <th>Status</th>
            <th style="width: 112px"></th>
          </tr>
        </thead>
        <template v-for="conta in contas.dados.value.dados" :key="conta.id">
          <tbody>
            <tr class="clicavel" @click="alternar(conta.id)">
              <td><Icone nome="abrir" class="girar" :class="{ fechado: !expandidas.includes(conta.id) }" /></td>
              <td>
                <div class="titulo-celula">{{ conta.descricao }}</div>
                <div class="sub-celula">
                  {{ conta.tem_entrada ? `Entrada + ${Number(conta.qtd_parcelas) - 1}x` : `${conta.qtd_parcelas}x` }}
                  · {{ rotuloForma(conta.forma_pagamento) ?? 'forma não definida' }}
                </div>
              </td>
              <td v-if="!casoId" class="fraco nowrap">
                <RouterLink v-if="conta.caso_id" :to="`/casos/${conta.caso_id}`" @click.stop>
                  {{ conta.caso_titulo }}
                </RouterLink>
                <span v-else>—</span>
              </td>
              <td class="dinheiro">
                {{ moeda(conta.valor_total) }}
                <Progresso
                  :concluido="Number(conta.recebido)"
                  :total="Number(conta.valor_total)"
                  :rotulo="`${moeda(conta.recebido)} de ${moeda(conta.valor_total)} recebido`"
                />
              </td>
              <td class="dinheiro">{{ moeda(conta.pendente) }}</td>
              <td class="nowrap">{{ data(conta.proximo_vencimento) }}</td>
              <td><Selo :situacao="conta.situacao" /></td>
              <td class="num nowrap">
                <a
                  class="botao icone"
                  :href="`/imprimir/parcelamento/${conta.id}`"
                  target="_blank"
                  rel="noopener"
                  aria-label="Termo de parcelamento para assinar"
                  title="Imprimir termo de parcelamento para o cliente assinar"
                  @click.stop
                >
                  <Icone nome="imprimir" />
                </a>
                <button class="botao icone" aria-label="Editar cobrança" @click.stop="abrirConta(conta)">
                  <Icone nome="editar" />
                </button>
                <button class="botao icone" aria-label="Excluir cobrança" @click.stop="excluirConta(conta)">
                  <Icone nome="excluir" />
                </button>
              </td>
            </tr>
            <tr v-if="expandidas.includes(conta.id)">
              <td :colspan="casoId ? 7 : 8" class="detalhes-conta">
                <p v-if="conta.observacoes" class="obs-conta"><Icone nome="casos" :tamanho="13" /> {{ conta.observacoes }}</p>
                <div class="quadro">
                  <table>
                    <thead>
                      <tr>
                        <th>Parcela</th>
                        <th class="num">Valor</th>
                        <th>Vencimento</th>
                        <th>Status</th>
                        <th>Recebimentos</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="parcela in conta.parcelas" :key="parcela.id" :class="`linha-${parcela.situacao}`">
                        <td>
                          <span v-if="parcela.entrada" class="selo acao">Entrada</span>
                          <span v-else class="mono">{{ parcela.numero }}/{{ parcela.total_parcelas }}</span>
                          <div v-if="parcela.observacoes" class="obs" :title="parcela.observacoes">
                            <Icone nome="casos" :tamanho="12" /> {{ parcela.observacoes }}
                          </div>
                        </td>
                        <td class="dinheiro">
                          {{ moeda(parcela.valor) }}
                          <div v-if="parcial(parcela)" class="sub-celula">faltam {{ moeda(parcela.restante) }}</div>
                        </td>
                        <td>{{ data(parcela.vencimento) }}</td>
                        <td><Selo :situacao="parcial(parcela) ? 'parcial' : parcela.situacao" /></td>
                        <td>
                          <span v-if="!parcela.recebimentos.length" class="fraco">—</span>
                          <ul v-else class="recebimentos-parcela">
                            <li v-for="r in parcela.recebimentos" :key="r.id">
                              <div>
                                <span>
                                  {{ data(r.data) }} · <strong>{{ moeda(r.valor) }}</strong>
                                  · {{ r.carteira_nome ?? 'sem conta' }}
                                  <template v-if="r.forma_pagamento"> · {{ rotuloForma(r.forma_pagamento) }}</template>
                                </span>
                                <div v-if="r.observacoes" class="obs"><Icone nome="casos" :tamanho="12" /> {{ r.observacoes }}</div>
                              </div>
                              <span class="acoes-recebimento">
                                <a
                                  class="botao texto"
                                  :href="`/imprimir/recibo/recebimento/${r.id}`"
                                  target="_blank"
                                  rel="noopener"
                                  :aria-label="`Recibo de ${moeda(r.valor)} de ${data(r.data)}`"
                                >
                                  Recibo
                                </a>
                                <button
                                  class="botao texto"
                                  :aria-label="`Estornar ${moeda(r.valor)} de ${data(r.data)}`"
                                  @click="estornar(parcela, r)"
                                >
                                  Estornar
                                </button>
                              </span>
                            </li>
                          </ul>
                        </td>
                        <td class="num nowrap">
                          <template v-if="parcela.status === 'pendente'">
                            <button
                              class="botao icone"
                              aria-label="Alterar parcela"
                              title="Alterar valor, vencimento ou observação"
                              @click="abrirParcela(parcela)"
                            >
                              <Icone nome="editar" />
                            </button>
                            <button class="botao pequeno primario" @click="abrirPagamento(parcela, conta)">
                              <Icone nome="confirmar" /> Registrar pagamento
                            </button>
                          </template>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
          </tbody>
        </template>
      </table>
      <Paginacao
        v-if="contas.dados.value"
        :pagina="contas.dados.value.pagina"
        :paginas="contas.dados.value.paginas"
        :total="contas.dados.value.total"
        @mudar="pagina = $event; contas.recarregar()"
      />
    </Estado>
  </section>

  <Modal
    v-if="modalConta"
    :titulo="contaEditando ? 'Editar cobrança' : 'Nova cobrança'"
    :descricao="contaEditando ? 'Valor e parcelas são ajustados parcela a parcela.' : undefined"
    :salvando="salvando"
    @fechar="modalConta = false"
    @confirmar="salvarConta"
  >
    <div class="campo">
      <label for="descricao">Descrição *</label>
      <input id="descricao" v-model="formConta.descricao" required maxlength="200" />
    </div>
    <template v-if="!contaEditando">
      <div class="grade-2">
        <CampoMoeda id="valor" v-model="formConta.valor_total" rotulo="Valor total a receber *" obrigatorio />
        <CampoMoeda id="entrada" v-model="formConta.entrada" rotulo="Entrada" dica="Em branco se não tem entrada." />
      </div>
      <div v-if="resumoConta.entrada > 0" class="bloco-entrada">
        <div class="campo">
          <label for="entrada-vencimento">Data da entrada *</label>
          <input id="entrada-vencimento" v-model="formConta.entrada_vencimento" type="date" required />
        </div>
        <label class="opcao">
          <input v-model="formConta.entrada_paga" type="checkbox" :disabled="formConta.entrada_vencimento > hoje()" />
          <span><strong>A entrada já foi recebida</strong></span>
        </label>
        <CampoCarteira
          v-if="formConta.entrada_paga && formConta.entrada_vencimento <= hoje()"
          id="entrada-carteira"
          v-model="formConta.entrada_carteira_id"
          :forma="formConta.forma_pagamento"
          rotulo="A entrada entrou em *"
        />
      </div>
      <div class="grade-2">
        <div class="campo">
          <label for="parcelas">Em quantas parcelas? *</label>
          <input id="parcelas" v-model.number="formConta.quantidade_parcelas" type="number" min="1" max="360" required />
        </div>
        <div class="campo">
          <label for="vencimento">
            {{ resumoConta.quantidade > 1 ? 'Vencimento da 1ª parcela *' : 'Vencimento *' }}
          </label>
          <input id="vencimento" v-model="formConta.primeiro_vencimento" type="date" required />
        </div>
      </div>
      <p v-if="resumoConta.total > 0" class="dica" style="margin: -4px 0 12px">
        {{ resumoConta.entrada > 0 ? `Entrada de ${moeda(resumoConta.entrada)} + ` : '' }}{{ resumoConta.quantidade }}x
        de {{ resumoConta.exato ? '' : 'aprox. ' }}{{ moeda(resumoConta.parcela) }}
      </p>
    </template>
    <div class="grade-2">
      <div class="campo">
        <label for="forma">Forma de pagamento</label>
        <select id="forma" v-model="formConta.forma_pagamento">
          <option value="">Não definida</option>
          <option v-for="[valor, rotulo] in FORMAS_PAGAMENTO" :key="valor" :value="valor">{{ rotulo }}</option>
        </select>
      </div>
      <div v-if="!casoId" class="campo">
        <label for="caso">Vincular a um caso</label>
        <select id="caso" v-model="formConta.caso_id">
          <option value="">Sem vínculo</option>
          <option v-for="caso in casos ?? []" :key="caso.id" :value="caso.id">{{ caso.titulo }}</option>
        </select>
      </div>
    </div>
    <div class="campo">
      <label for="obs-conta">Observações</label>
      <textarea id="obs-conta" v-model="formConta.observacoes" maxlength="2000" />
    </div>
    <Aviso :texto="erroFormulario" />
  </Modal>

  <Modal
    v-if="modalParcela"
    titulo="Alterar parcela"
    descricao="Disponível apenas enquanto a parcela não é paga."
    :salvando="salvando"
    @fechar="modalParcela = false"
    @confirmar="salvarParcela"
  >
    <div class="resumo-modal">
      <div>Parcela<strong>{{ parcelaAtual ? rotuloParcela(parcelaAtual) : '' }}</strong></div>
      <div>Valor atual<strong>{{ moeda(parcelaAtual?.valor) }}</strong></div>
      <div>Vencimento atual<strong>{{ data(parcelaAtual?.vencimento) }}</strong></div>
      <div v-if="Number(parcelaAtual?.valor_pago) > 0">Já recebido<strong>{{ moeda(parcelaAtual?.valor_pago) }}</strong></div>
    </div>
    <div class="grade-2">
      <CampoMoeda id="parcela-valor" v-model="formParcela.valor" rotulo="Valor *" obrigatorio />
      <div class="campo">
        <label for="parcela-vencimento">Vencimento *</label>
        <input id="parcela-vencimento" v-model="formParcela.vencimento" type="date" required />
      </div>
    </div>
    <div class="campo">
      <label for="parcela-obs">Observações</label>
      <textarea id="parcela-obs" v-model="formParcela.observacoes" maxlength="2000" />
    </div>
    <p class="dica">
      O valor total da cobrança é recalculado pela soma das parcelas. Para dar desconto no que falta, informe o valor já
      recebido: a parcela fica quitada.
    </p>
    <Aviso :texto="erroFormulario" />
  </Modal>

  <ModalPagamento
    v-if="modalPagamento"
    :form="formPagamento"
    :salvando="salvando"
    :erro="erroFormulario"
    titulo="Registrar recebimento"
    :total="Number(parcelaAtual?.restante ?? 0)"
    parcial
    :advogados="advogados.dados.value?.dados"
    :caso-id="casoDaParcela"
    @fechar="modalPagamento = false"
    @confirmar="salvarPagamento"
  >
    <div class="resumo-modal">
      <div>Parcela<strong>{{ parcelaAtual ? rotuloParcela(parcelaAtual) : '' }}</strong></div>
      <div>Valor<strong>{{ moeda(parcelaAtual?.valor) }}</strong></div>
      <div v-if="Number(parcelaAtual?.valor_pago) > 0">Já recebido<strong>{{ moeda(parcelaAtual?.valor_pago) }}</strong></div>
      <div>Vencimento<strong>{{ data(parcelaAtual?.vencimento) }}</strong></div>
    </div>
  </ModalPagamento>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Aviso from '../components/Aviso.vue'
import BuscaCliente from '../components/BuscaCliente.vue'
import CampoCarteira from '../components/CampoCarteira.vue'
import CampoMoeda from '../components/CampoMoeda.vue'
import Distribuicao from '../components/Distribuicao.vue'
import Icone from '../components/Icone.vue'
import Modal from '../components/Modal.vue'
import { api, type Pagina } from '../api.ts'
import { avisar } from '../avisos.ts'
import { FORMAS_PAGAMENTO, data as formatarData, hoje, moeda, paraNumero, resumoCobranca } from '../format.ts'
import { useRecurso } from '../recurso.ts'
import { restante as sobraDaDivisao, type Repasse } from '../distribuicao.ts'

type AdvogadoResumo = { id: string; nome: string; principal: boolean }

const rota = useRoute()
const router = useRouter()

const advogados = useRecurso(() => api.get<Pagina<AdvogadoResumo>>('/advogados?limite=100'))

const clienteId = ref(String(rota.query.cliente ?? ''))
const buscaCliente = useTemplateRef<InstanceType<typeof BuscaCliente>>('buscaCliente')
const caso = reactive({ titulo: '', valor: '', descricao: '' })
const cobranca = reactive({
  ativa: true,
  descricao: '',
  valor_total: '',
  entrada: '',
  entrada_vencimento: hoje(),
  entrada_paga: true,
  entrada_carteira_id: '',
  quantidade_parcelas: 1,
  primeiro_vencimento: hoje(),
  forma_pagamento: '',
})

const descricaoTocada = ref(false)
const valorTocado = ref(false)
watch(
  () => caso.titulo,
  (titulo) => {
    if (!descricaoTocada.value) cobranca.descricao = titulo ? `Honorários — ${titulo}` : ''
  },
)
watch(
  () => caso.valor,
  (valor) => {
    if (!valorTocado.value) cobranca.valor_total = valor
  },
)

watch(
  () => cobranca.entrada_vencimento,
  (vencimento) => {
    if (vencimento > hoje()) cobranca.entrada_paga = false
  },
)

const distribuicao = ref<Repasse[]>([])

const resumo = computed(() =>
  resumoCobranca(cobranca.valor_total, cobranca.entrada, cobranca.quantidade_parcelas),
)

const salvando = ref(false)
const erroFormulario = ref('')

onMounted(advogados.recarregar)

async function salvar() {
  const { total, entrada, quantidade, restante } = resumo.value
  if (!clienteId.value) {
    erroFormulario.value = 'Escolha o cliente no passo 1 ou cadastre um novo.'
    buscaCliente.value?.focar()
    return
  }
  if (sobraDaDivisao(distribuicao.value) < 0) {
    return (erroFormulario.value = 'A divisão entre advogados passou de 100%.')
  }
  if (cobranca.ativa) {
    if (total <= 0) return (erroFormulario.value = 'Informe o valor total a receber.')
    if (entrada >= total) return (erroFormulario.value = 'A entrada precisa ser menor que o valor total.')
    if (Math.round(restante * 100) < quantidade) {
      return (erroFormulario.value = 'O valor restante é pequeno demais para esse número de parcelas.')
    }
  }

  salvando.value = true
  erroFormulario.value = ''
  try {
    const criado = await api.post<{ id: string; conta_id: string | null }>('/casos', {
      cliente_id: clienteId.value,
      titulo: caso.titulo,
      valor: paraNumero(caso.valor),
      descricao: caso.descricao || undefined,
      advogados: distribuicao.value.filter((p) => Number(p.percentual) > 0),
      conta: cobranca.ativa
        ? {
            descricao: cobranca.descricao,
            valor_total: total,
            entrada: entrada > 0 ? entrada : undefined,
            entrada_vencimento: entrada > 0 ? cobranca.entrada_vencimento : undefined,
            entrada_paga: entrada > 0 ? cobranca.entrada_paga : undefined,
            entrada_carteira_id: entrada > 0 && cobranca.entrada_paga ? cobranca.entrada_carteira_id || null : undefined,
            quantidade_parcelas: quantidade,
            primeiro_vencimento: cobranca.primeiro_vencimento,
            forma_pagamento: cobranca.forma_pagamento || undefined,
          }
        : undefined,
    })
    avisar(
      'Caso criado.',
      'sucesso',
      criado.conta_id && resumo.value.pagamentos > 1
        ? { texto: 'Termo de parcelamento', href: `/imprimir/parcelamento/${criado.conta_id}` }
        : undefined,
    )
    router.push(`/casos/${criado.id}`)
  } catch (e) {
    erroFormulario.value = (e as Error).message
  } finally {
    salvando.value = false
  }
}

const modalCliente = ref(false)
const salvandoCliente = ref(false)
const erroCliente = ref('')
const novoCliente = reactive({ nome: '', documento: '', telefone: '' })

function abrirNovoCliente() {
  Object.assign(novoCliente, { nome: '', documento: '', telefone: '' })
  erroCliente.value = ''
  modalCliente.value = true
}

async function criarCliente() {
  salvandoCliente.value = true
  erroCliente.value = ''
  try {
    const criado = await api.post<{ id: string }>('/clientes', {
      nome: novoCliente.nome,
      documento: novoCliente.documento || undefined,
      telefone: novoCliente.telefone || undefined,
    })
    clienteId.value = criado.id
    modalCliente.value = false
    avisar('Cliente cadastrado.')
  } catch (e) {
    erroCliente.value = (e as Error).message
  } finally {
    salvandoCliente.value = false
  }
}
</script>

<template>
  <div class="topo">
    <div>
      <p class="trilha"><RouterLink to="/casos">Casos</RouterLink></p>
      <h1>Novo caso</h1>
      <p>Cadastre o caso, como o cliente vai pagar e quem recebe. Só o que tem asterisco é obrigatório.</p>
    </div>
  </div>

  <form class="formulario" @submit.prevent="salvar">
    <section class="painel passo">
      <header>
        <span class="passo-numero">1</span>
        <div>
          <h2>Cliente</h2>
          <p>De quem é este caso?</p>
        </div>
      </header>
      <div class="corpo">
        <div class="campo">
          <label for="cliente">Cliente *</label>
          <div class="linha-campo">
            <BuscaCliente id="cliente" ref="buscaCliente" v-model="clienteId" />
            <button type="button" class="botao" @click="abrirNovoCliente">
              <Icone nome="mais" /> Novo cliente
            </button>
          </div>
          <span class="dica">Digite parte do nome ou do documento. Se ainda não existe, cadastre no botão ao lado.</span>
        </div>
      </div>
    </section>

    <section class="painel passo">
      <header>
        <span class="passo-numero">2</span>
        <div>
          <h2>O caso</h2>
          <p>Como você identifica este trabalho.</p>
        </div>
      </header>
      <div class="corpo">
        <div class="campo">
          <label for="titulo">Título do caso *</label>
          <input id="titulo" v-model="caso.titulo" required maxlength="200" placeholder="Ex.: Ação trabalhista" />
        </div>
        <CampoMoeda
          id="valor-caso"
          v-model="caso.valor"
          rotulo="Valor combinado do caso"
          dica="Quanto foi acordado no total. Pode deixar em branco."
        />
        <div class="campo">
          <label for="descricao">Observações</label>
          <textarea id="descricao" v-model="caso.descricao" maxlength="2000" placeholder="Anotações sobre o caso" />
        </div>
      </div>
    </section>

    <section class="painel passo">
      <header>
        <span class="passo-numero">3</span>
        <div>
          <h2>Pagamento</h2>
          <p>Entrada, parcelas e vencimentos.</p>
        </div>
      </header>
      <div class="corpo">
        <label class="opcao">
          <input v-model="cobranca.ativa" type="checkbox" />
          <span>
            <strong>Registrar a cobrança agora</strong>
            <span class="dica">Desmarque se ainda não combinou valores. Dá para lançar depois na ficha do cliente.</span>
          </span>
        </label>

        <template v-if="cobranca.ativa">
          <div class="campo">
            <label for="descricao-cobranca">Descrição da cobrança *</label>
            <input
              id="descricao-cobranca"
              :value="cobranca.descricao"
              required
              maxlength="200"
              @input="cobranca.descricao = ($event.target as HTMLInputElement).value; descricaoTocada = true"
            />
          </div>

          <div class="grade-2">
            <CampoMoeda
              id="valor-total"
              rotulo="Valor total a receber *"
              obrigatorio
              :model-value="cobranca.valor_total"
              @update:model-value="cobranca.valor_total = $event; valorTocado = true"
            />
            <CampoMoeda
              id="entrada"
              v-model="cobranca.entrada"
              rotulo="Entrada"
              dica="Deixe em branco se não tem entrada."
            />
          </div>

          <div v-if="resumo.entrada > 0" class="bloco-entrada">
            <div class="campo">
              <label for="entrada-vencimento">Data da entrada *</label>
              <input id="entrada-vencimento" v-model="cobranca.entrada_vencimento" type="date" required />
            </div>
            <label class="opcao">
              <input v-model="cobranca.entrada_paga" type="checkbox" :disabled="cobranca.entrada_vencimento > hoje()" />
              <span>
                <strong>A entrada já foi recebida</strong>
                <span class="dica">Marcado, ela já entra como paga e você não precisa registrar de novo.</span>
              </span>
            </label>
            <CampoCarteira
              v-if="cobranca.entrada_paga && cobranca.entrada_vencimento <= hoje()"
              id="entrada-carteira"
              v-model="cobranca.entrada_carteira_id"
              :forma="cobranca.forma_pagamento"
              rotulo="A entrada entrou em *"
            />
          </div>

          <div class="grade-2">
            <div class="campo">
              <label for="parcelas">Em quantas parcelas? *</label>
              <input
                id="parcelas"
                v-model.number="cobranca.quantidade_parcelas"
                type="number"
                min="1"
                max="360"
                required
              />
              <span class="dica">Digite 1 para pagamento único.</span>
            </div>
            <div class="campo">
              <label for="primeiro-vencimento">
                {{ resumo.quantidade > 1 ? 'Vencimento da 1ª parcela *' : 'Vencimento *' }}
              </label>
              <input id="primeiro-vencimento" v-model="cobranca.primeiro_vencimento" type="date" required />
              <span class="dica">As próximas vencem no mesmo dia dos meses seguintes.</span>
            </div>
          </div>

          <div class="campo">
            <label for="forma">Forma de pagamento</label>
            <select id="forma" v-model="cobranca.forma_pagamento">
              <option value="">Não definida</option>
              <option v-for="[valor, rotulo] in FORMAS_PAGAMENTO" :key="valor" :value="valor">{{ rotulo }}</option>
            </select>
          </div>

          <div v-if="resumo.total > 0" class="resumo-cobranca">
            <Icone nome="dinheiro" :tamanho="18" />
            <div>
              <p v-if="resumo.entrada > 0">
                Entrada de <strong>{{ moeda(resumo.entrada) }}</strong> em
                {{ formatarData(cobranca.entrada_vencimento) }}
                <span v-if="cobranca.entrada_paga" class="selo pago">já recebida</span>
              </p>
              <p>
                <strong>{{ resumo.quantidade }}x</strong> de
                <strong>{{ resumo.exato ? '' : 'aprox. ' }}{{ moeda(resumo.parcela) }}</strong>,
                a partir de {{ formatarData(cobranca.primeiro_vencimento) }}
              </p>
              <p class="dica">
                Total de {{ moeda(resumo.total) }} em {{ resumo.pagamentos }} pagamento(s).
              </p>
            </div>
          </div>
        </template>
      </div>
    </section>

    <section class="painel passo">
      <header>
        <span class="passo-numero">4</span>
        <div>
          <h2>Quem recebe</h2>
          <p>O advogado principal fica com tudo, a não ser que você divida com outro advogado aqui.</p>
        </div>
      </header>
      <div class="corpo">
        <p v-if="!advogados.dados.value?.dados.length" class="aviso alerta" style="margin: 0">
          <Icone nome="alerta" />
          <span>
            Nenhum advogado cadastrado.
            <RouterLink to="/configuracoes">Cadastre em Configurações</RouterLink> para dividir os valores.
          </span>
        </p>
        <Distribuicao
          v-else
          id="divisao-caso"
          v-model="distribuicao"
          :advogados="advogados.dados.value?.dados ?? []"
          :valor="cobranca.ativa ? resumo.total : 0"
        />
      </div>
    </section>

    <Aviso :texto="erroFormulario" />

    <div class="acoes-formulario">
      <RouterLink class="botao" to="/casos">Cancelar</RouterLink>
      <button type="submit" class="botao primario" :disabled="salvando">
        <Icone nome="confirmar" /> {{ salvando ? 'Salvando…' : 'Criar caso' }}
      </button>
    </div>
  </form>

  <Modal
    v-if="modalCliente"
    titulo="Novo cliente"
    descricao="Os demais dados podem ser completados depois na ficha do cliente."
    :salvando="salvandoCliente"
    @fechar="modalCliente = false"
    @confirmar="criarCliente"
  >
    <div class="campo">
      <label for="novo-cliente-nome">Nome *</label>
      <input id="novo-cliente-nome" v-model="novoCliente.nome" required maxlength="200" autofocus />
    </div>
    <div class="grade-2">
      <div class="campo">
        <label for="novo-cliente-documento">CPF / CNPJ</label>
        <input id="novo-cliente-documento" v-model="novoCliente.documento" maxlength="20" />
      </div>
      <div class="campo">
        <label for="novo-cliente-telefone">Telefone</label>
        <input id="novo-cliente-telefone" v-model="novoCliente.telefone" maxlength="30" />
      </div>
    </div>
    <Aviso :texto="erroCliente" />
  </Modal>
</template>

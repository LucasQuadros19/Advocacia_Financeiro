<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Aviso from '../components/Aviso.vue'
import CampoMoeda from '../components/CampoMoeda.vue'
import Estado from '../components/Estado.vue'
import Icone from '../components/Icone.vue'
import Modal from '../components/Modal.vue'
import PainelUsuarios from '../components/PainelUsuarios.vue'
import { api, type Pagina } from '../api.ts'
import { avisar, confirmar } from '../avisos.ts'
import { iniciais, moeda, paraNumero } from '../format.ts'
import { useRecurso } from '../recurso.ts'

type Advogado = {
  id: string; nome: string; cpf: string | null; oab: string | null; email: string | null
  telefone: string | null; principal: boolean; casos: string
}

type Carteira = { id: string; nome: string; tipo: 'banco' | 'dinheiro'; saldo_inicial: string; saldo: string; ativa: boolean }

const ABAS = { usuarios: 'Usuários', advogados: 'Advogados', bancos: 'Bancos e dinheiro' } as const
type Aba = keyof typeof ABAS

const rota = useRoute()
const navegador = useRouter()
const aba = computed<Aba>({
  get: () => (String(rota.query.aba) in ABAS ? (String(rota.query.aba) as Aba) : 'usuarios'),
  set: (valor) => navegador.replace({ query: { aba: valor } }),
})

const { dados, carregando, erro, recarregar } = useRecurso(() => api.get<Pagina<Advogado>>('/advogados?limite=100'))
const carteiras = useRecurso(() => api.get<{ dados: Carteira[] }>('/carteiras'))
onMounted(() => {
  recarregar()
  carteiras.recarregar()
})

const lista = computed(() => dados.value?.dados ?? [])
const principal = computed(() => lista.value.find((a) => a.principal))

async function trocarPrincipal(evento: Event) {
  const alvo = evento.target as HTMLSelectElement
  const escolhido = lista.value.find((a) => a.id === alvo.value)
  if (!escolhido || escolhido.principal) return
  const ok = await confirmar(
    'Trocar advogado principal',
    `O caixa passará a mostrar os valores de ${escolhido.nome}, conforme a participação dele em cada caso. ` +
      'Casos que já têm divisão salva não mudam.',
    { confirmar: 'Tornar principal' },
  )
  if (!ok) {
    alvo.value = principal.value?.id ?? ''
    return
  }
  try {
    await api.put(`/advogados/${escolhido.id}/principal`)
    avisar('Advogado principal atualizado.')
  } catch (e) {
    avisar((e as Error).message, 'erro')
  }
  await recarregar()
}

const modalAberto = ref(false)
const salvando = ref(false)
const erroFormulario = ref('')
const editando = ref<string>()
const formulario = reactive({ nome: '', cpf: '', oab: '', email: '', telefone: '', principal: false })

function abrir(advogado?: Advogado) {
  editando.value = advogado?.id
  Object.assign(formulario, {
    nome: advogado?.nome ?? '',
    cpf: advogado?.cpf ?? '',
    oab: advogado?.oab ?? '',
    email: advogado?.email ?? '',
    telefone: advogado?.telefone ?? '',
    principal: advogado?.principal ?? !lista.value.length,
  })
  erroFormulario.value = ''
  modalAberto.value = true
}

async function salvar() {
  salvando.value = true
  erroFormulario.value = ''
  const corpo = {
    nome: formulario.nome,
    cpf: formulario.cpf || undefined,
    oab: formulario.oab || undefined,
    email: formulario.email || undefined,
    telefone: formulario.telefone || undefined,
    principal: formulario.principal,
  }
  try {
    if (editando.value) {
      await api.put(`/advogados/${editando.value}`, corpo)
      if (formulario.principal) await api.put(`/advogados/${editando.value}/principal`)
    } else {
      await api.post('/advogados', corpo)
    }
    modalAberto.value = false
    avisar(editando.value ? 'Advogado atualizado.' : 'Advogado cadastrado.')
    await recarregar()
  } catch (e) {
    erroFormulario.value = (e as Error).message
  } finally {
    salvando.value = false
  }
}

const modalCarteira = ref(false)
const carteiraEditando = ref<string>()
const formCarteira = reactive({ nome: '', tipo: 'banco' as 'banco' | 'dinheiro', saldo_inicial: '', ativa: true })

function abrirCarteira(carteira?: Carteira) {
  carteiraEditando.value = carteira?.id
  Object.assign(formCarteira, {
    nome: carteira?.nome ?? '',
    tipo: carteira?.tipo ?? 'banco',
    saldo_inicial: carteira ? Number(carteira.saldo_inicial).toFixed(2).replace('.', ',') : '',
    ativa: carteira?.ativa ?? true,
  })
  erroFormulario.value = ''
  modalCarteira.value = true
}

async function salvarCarteira() {
  salvando.value = true
  erroFormulario.value = ''
  const corpo = {
    nome: formCarteira.nome,
    tipo: formCarteira.tipo,
    saldo_inicial: paraNumero(formCarteira.saldo_inicial),
    ativa: formCarteira.ativa,
  }
  try {
    if (carteiraEditando.value) await api.put(`/carteiras/${carteiraEditando.value}`, corpo)
    else await api.post('/carteiras', corpo)
    modalCarteira.value = false
    avisar(carteiraEditando.value ? 'Conta atualizada.' : 'Conta cadastrada.')
    await carteiras.recarregar()
  } catch (e) {
    erroFormulario.value = (e as Error).message
  } finally {
    salvando.value = false
  }
}

async function excluirCarteira(carteira: Carteira) {
  const ok = await confirmar(
    'Excluir conta',
    `${carteira.nome} será removida. Contas com movimentação não podem ser excluídas — desative em vez disso.`,
    { confirmar: 'Excluir', perigo: true },
  )
  if (!ok) return
  try {
    await api.delete(`/carteiras/${carteira.id}`)
    avisar('Conta excluída.')
    await carteiras.recarregar()
  } catch (e) {
    avisar((e as Error).message, 'erro')
  }
}

async function excluir(advogado: Advogado) {
  const ok = await confirmar(
    'Excluir advogado',
    `${advogado.nome} será removido do cadastro. Advogados vinculados a casos não podem ser excluídos.`,
    { confirmar: 'Excluir', perigo: true },
  )
  if (!ok) return
  try {
    await api.delete(`/advogados/${advogado.id}`)
    avisar('Advogado excluído.')
    await recarregar()
  } catch (e) {
    avisar((e as Error).message, 'erro')
  }
}
</script>

<template>
  <div class="topo">
    <div>
      <h1>Configurações</h1>
      <p>Quem usa o sistema, os advogados do escritório e onde o dinheiro fica.</p>
    </div>
  </div>

  <div class="abas" role="tablist">
    <button
      v-for="(rotulo, chave) in ABAS"
      :key="chave"
      role="tab"
      :aria-selected="aba === chave"
      :class="{ ativo: aba === chave }"
      @click="aba = chave"
    >
      {{ rotulo }}
    </button>
  </div>

  <PainelUsuarios v-if="aba === 'usuarios'" />

  <Estado v-if="aba === 'advogados'" :carregando="carregando" :erro="erro" @repetir="recarregar">
    <section class="painel">
      <header>
        <div>
          <h2>Advogado principal</h2>
          <p>Dono do caixa. Todo caso novo vai 100% para ele, a não ser que você divida na hora de cadastrar.</p>
        </div>
      </header>
      <div class="corpo">
        <div v-if="lista.length" class="campo" style="margin: 0; max-width: 420px">
          <label for="principal">Advogado principal</label>
          <select id="principal" :value="principal?.id ?? ''" @change="trocarPrincipal">
            <option value="" disabled>Nenhum definido</option>
            <option v-for="advogado in lista" :key="advogado.id" :value="advogado.id">{{ advogado.nome }}</option>
          </select>
          <span class="dica">
            Trocar aqui só muda os casos sem divisão salva — os que já têm percentuais continuam como estão.
          </span>
        </div>
        <p v-else class="fraco">Cadastre o primeiro advogado para definir o dono do caixa.</p>
      </div>
    </section>

    <section class="painel">
      <header>
        <div>
          <h2>Advogados</h2>
          <p>Quem pode participar da divisão dos valores recebidos.</p>
        </div>
        <button class="botao primario pequeno" @click="abrir()"><Icone nome="mais" /> Novo advogado</button>
      </header>
      <Estado
        :vazio="!lista.length"
        icone="advogados"
        mensagem="Nenhum advogado cadastrado."
      >
        <template #acao>
          <button class="botao primario" @click="abrir()"><Icone nome="mais" /> Cadastrar advogado</button>
        </template>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>OAB</th>
              <th>CPF</th>
              <th>Telefone</th>
              <th class="num">Casos</th>
              <th class="num">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="advogado in lista" :key="advogado.id">
              <td>
                <div class="principal-celula">
                  <span class="inicial">{{ iniciais(advogado.nome) }}</span>
                  <div>
                    <span class="titulo-celula">{{ advogado.nome }}</span>
                    <span v-if="advogado.principal" class="selo acao" style="margin-left: 8px">Principal</span>
                    <div class="sub-celula">{{ advogado.email ?? 'sem e-mail' }}</div>
                  </div>
                </div>
              </td>
              <td class="mono">{{ advogado.oab ?? '—' }}</td>
              <td class="mono">{{ advogado.cpf ?? '—' }}</td>
              <td class="fraco">{{ advogado.telefone ?? '—' }}</td>
              <td class="num">{{ advogado.casos }}</td>
              <td class="num nowrap">
                <button class="botao pequeno" @click="abrir(advogado)"><Icone nome="editar" /> Editar</button>
                <button class="botao icone" aria-label="Excluir advogado" @click="excluir(advogado)">
                  <Icone nome="excluir" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </Estado>
    </section>
  </Estado>

  <section v-if="aba === 'bancos'" class="painel">
    <header>
      <div>
        <h2>Bancos e dinheiro</h2>
        <p>Onde o dinheiro do escritório fica. Cada recebimento e pagamento diz por qual conta passou.</p>
      </div>
      <button class="botao pequeno" @click="abrirCarteira()"><Icone nome="mais" /> Nova conta</button>
    </header>
    <Estado
      :carregando="carteiras.carregando.value"
      :erro="carteiras.erro.value"
      :vazio="!carteiras.dados.value?.dados.length"
      icone="banco"
      mensagem="Nenhuma conta cadastrada. Cadastre os bancos e o dinheiro em espécie."
      @repetir="carteiras.recarregar"
    >
      <template #acao>
        <button class="botao primario" @click="abrirCarteira()"><Icone nome="mais" /> Cadastrar conta</button>
      </template>
      <table v-if="carteiras.dados.value">
        <thead>
          <tr>
            <th>Conta</th>
            <th>Tipo</th>
            <th class="num">Saldo inicial</th>
            <th class="num">Saldo hoje</th>
            <th class="num">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="carteira in carteiras.dados.value.dados" :key="carteira.id">
            <td>
              <span class="titulo-celula">{{ carteira.nome }}</span>
              <span v-if="!carteira.ativa" class="selo" style="margin-left: 8px">Desativada</span>
            </td>
            <td class="fraco">{{ carteira.tipo === 'dinheiro' ? 'Dinheiro em espécie' : 'Banco' }}</td>
            <td class="dinheiro fraco">{{ moeda(carteira.saldo_inicial) }}</td>
            <td class="dinheiro" :style="Number(carteira.saldo) < 0 ? 'color: var(--erro)' : ''">{{ moeda(carteira.saldo) }}</td>
            <td class="num nowrap">
              <button class="botao pequeno" @click="abrirCarteira(carteira)"><Icone nome="editar" /> Editar</button>
              <button class="botao icone" :aria-label="`Excluir ${carteira.nome}`" @click="excluirCarteira(carteira)">
                <Icone nome="excluir" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </Estado>
  </section>

  <Modal
    v-if="modalCarteira"
    :titulo="carteiraEditando ? 'Editar conta' : 'Nova conta'"
    descricao="O saldo inicial é quanto havia nela antes de começar a lançar no sistema."
    :salvando="salvando"
    @fechar="modalCarteira = false"
    @confirmar="salvarCarteira"
  >
    <div class="campo">
      <label for="carteira-nome">Nome *</label>
      <input id="carteira-nome" v-model="formCarteira.nome" required maxlength="60" placeholder="Ex.: Banco do Brasil" />
    </div>
    <div class="grade-2">
      <div class="campo">
        <label for="carteira-tipo">Tipo *</label>
        <select id="carteira-tipo" v-model="formCarteira.tipo">
          <option value="banco">Banco</option>
          <option value="dinheiro">Dinheiro em espécie</option>
        </select>
      </div>
      <CampoMoeda id="carteira-saldo" v-model="formCarteira.saldo_inicial" rotulo="Saldo inicial" dica="Pode ser negativo." />
    </div>
    <label v-if="carteiraEditando" class="opcao">
      <input v-model="formCarteira.ativa" type="checkbox" />
      <span>
        <strong>Ativa</strong>
        <span class="dica">Desativada, some das opções de pagamento mas mantém o histórico.</span>
      </span>
    </label>
    <Aviso :texto="erroFormulario" />
  </Modal>

  <Modal
    v-if="modalAberto"
    :titulo="editando ? 'Editar advogado' : 'Novo advogado'"
    :salvando="salvando"
    @fechar="modalAberto = false"
    @confirmar="salvar"
  >
    <div class="campo">
      <label for="nome">Nome *</label>
      <input id="nome" v-model="formulario.nome" required maxlength="200" autofocus />
    </div>
    <div class="grade-2">
      <div class="campo">
        <label for="oab">OAB</label>
        <input id="oab" v-model="formulario.oab" maxlength="20" />
      </div>
      <div class="campo">
        <label for="cpf">CPF</label>
        <input id="cpf" v-model="formulario.cpf" maxlength="20" />
      </div>
      <div class="campo">
        <label for="email">E-mail</label>
        <input id="email" v-model="formulario.email" type="email" maxlength="120" />
      </div>
      <div class="campo">
        <label for="telefone">Telefone</label>
        <input id="telefone" v-model="formulario.telefone" maxlength="30" />
      </div>
    </div>
    <label class="opcao">
      <input v-model="formulario.principal" type="checkbox" :disabled="Boolean(editando) && formulario.principal" />
      <span>
        <strong>É o advogado principal (dono do caixa)</strong>
        <span v-if="Boolean(editando) && formulario.principal" class="dica">
          Para trocar, escolha outro no seletor de advogado principal.
        </span>
      </span>
    </label>
    <Aviso :texto="erroFormulario" style="margin-top: 14px" />
  </Modal>
</template>

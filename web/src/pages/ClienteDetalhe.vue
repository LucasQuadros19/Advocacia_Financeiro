<script setup lang="ts">
import { onMounted, reactive, ref, useTemplateRef } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Aviso from '../components/Aviso.vue'
import Cartao from '../components/Cartao.vue'
import Estado from '../components/Estado.vue'
import Icone from '../components/Icone.vue'
import Modal from '../components/Modal.vue'
import Notas from '../components/Notas.vue'
import PainelContas from '../components/PainelContas.vue'
import { api, type Pagina } from '../api.ts'
import { avisar, confirmar } from '../avisos.ts'
import { moeda, rotuloSituacao } from '../format.ts'
import { useRecurso } from '../recurso.ts'

type Caso = { id: string; titulo: string; status: string; valor: string; recebido: string; pendente: string; percentual_principal: string }
type Cliente = {
  id: string; nome: string; documento: string | null; email: string | null; telefone: string | null; observacoes: string | null
  totais: { recebido: string; pendente: string; vencido: string; a_vencer: string; contas: string }
}

const rota = useRoute()
const router = useRouter()
const id = String(rota.params.id)
const aba = ref<'contas' | 'casos' | 'notas'>('contas')
const painel = useTemplateRef<InstanceType<typeof PainelContas>>('painel')

const cliente = useRecurso(() => api.get<Cliente>(`/clientes/${id}`))
const casos = useRecurso(() => api.get<Pagina<Caso>>(`/clientes/${id}/casos?limite=50`))

onMounted(() => {
  cliente.recarregar()
  casos.recarregar()
})

const atualizarTudo = () => Promise.all([cliente.recarregar(), casos.recarregar()])

function novaCobranca() {
  aba.value = 'contas'
  painel.value?.abrirConta()
}

const salvando = ref(false)
const erroFormulario = ref('')

async function executar(acao: () => Promise<unknown>, sucesso: string, fechar?: () => void) {
  salvando.value = true
  erroFormulario.value = ''
  try {
    await acao()
    fechar?.()
    avisar(sucesso)
    await atualizarTudo()
  } catch (e) {
    const mensagem = (e as Error).message
    if (fechar) erroFormulario.value = mensagem
    else avisar(mensagem, 'erro')
  } finally {
    salvando.value = false
  }
}

const modalCliente = ref(false)
const formCliente = reactive({ nome: '', documento: '', email: '', telefone: '', observacoes: '' })

function abrirCliente() {
  const atual = cliente.dados.value
  if (!atual) return
  Object.assign(formCliente, {
    nome: atual.nome,
    documento: atual.documento ?? '',
    email: atual.email ?? '',
    telefone: atual.telefone ?? '',
    observacoes: atual.observacoes ?? '',
  })
  erroFormulario.value = ''
  modalCliente.value = true
}

const salvarCliente = () =>
  executar(
    () =>
      api.put(`/clientes/${id}`, {
        nome: formCliente.nome,
        documento: formCliente.documento || undefined,
        email: formCliente.email || undefined,
        telefone: formCliente.telefone || undefined,
        observacoes: formCliente.observacoes || undefined,
      }),
    'Cliente atualizado.',
    () => (modalCliente.value = false),
  )

async function excluirCliente() {
  const ok = await confirmar(
    'Excluir cliente',
    'Casos e contas sem pagamento registrado também serão removidos. Esta ação não pode ser desfeita.',
    { confirmar: 'Excluir cliente', perigo: true },
  )
  if (!ok) return
  try {
    await api.delete(`/clientes/${id}`)
    avisar('Cliente excluído.')
    router.push('/clientes')
  } catch (e) {
    avisar((e as Error).message, 'erro')
  }
}
</script>

<template>
  <Estado :carregando="cliente.carregando.value" :erro="cliente.erro.value" @repetir="cliente.recarregar">
    <template v-if="cliente.dados.value">
      <div class="topo">
        <div>
          <p class="trilha"><RouterLink to="/clientes">Clientes</RouterLink></p>
          <h1>{{ cliente.dados.value.nome }}</h1>
          <p>
            <span class="mono">{{ cliente.dados.value.documento ?? 'Sem documento' }}</span>
            · {{ cliente.dados.value.telefone ?? 'sem telefone' }}
            · {{ cliente.dados.value.email ?? 'sem e-mail' }}
          </p>
        </div>
        <div class="acoes">
          <button class="botao" @click="abrirCliente"><Icone nome="editar" /> Editar</button>
          <button class="botao" @click="novaCobranca"><Icone nome="dinheiro" /> Nova cobrança</button>
          <RouterLink class="botao primario" :to="`/casos/novo?cliente=${id}`"><Icone nome="mais" /> Novo caso</RouterLink>
          <button class="botao icone perigo" aria-label="Excluir cliente" title="Excluir cliente" @click="excluirCliente">
            <Icone nome="excluir" />
          </button>
        </div>
      </div>

      <section class="cartoes">
        <Cartao
          rotulo="A receber"
          :valor="moeda(cliente.dados.value.totais.pendente)"
          icone="grafico"
          :nota="`${moeda(cliente.dados.value.totais.a_vencer)} a vencer`"
        />
        <Cartao
          rotulo="Vencido"
          :valor="moeda(cliente.dados.value.totais.vencido)"
          icone="alerta"
          :tom="Number(cliente.dados.value.totais.vencido) > 0 ? 'erro' : undefined"
          nota="Parcelas em atraso"
        />
        <Cartao
          rotulo="Recebido"
          :valor="moeda(cliente.dados.value.totais.recebido)"
          tom="sucesso"
          icone="confirmar"
          nota="Total já pago pelo cliente"
        />
        <Cartao
          rotulo="Cobranças"
          :valor="String(cliente.dados.value.totais.contas)"
          icone="casos"
          nota="Cobranças cadastradas"
        />
      </section>

      <div v-if="cliente.dados.value.observacoes" class="painel">
        <div class="corpo">
          <div class="rotulo-campo" style="margin-bottom: 4px">Observações</div>
          {{ cliente.dados.value.observacoes }}
        </div>
      </div>

      <div class="abas">
        <button :class="{ ativo: aba === 'contas' }" @click="aba = 'contas'">Cobranças e pagamentos</button>
        <button :class="{ ativo: aba === 'casos' }" @click="aba = 'casos'">Casos</button>
        <button :class="{ ativo: aba === 'notas' }" @click="aba = 'notas'">Notas</button>
      </div>

      <Notas v-if="aba === 'notas'" :cliente-id="id" descricao="Anotações sobre o cliente: contatos, combinados, pendências." />

      <div v-show="aba === 'contas'">
        <PainelContas ref="painel" :cliente-id="id" :casos="casos.dados.value?.dados" @alterado="atualizarTudo" />
      </div>

      <section v-show="aba === 'casos'" class="painel">
        <header>
          <div>
            <h2>Casos</h2>
            <p>Casos do cliente e a participação do advogado principal.</p>
          </div>
          <RouterLink class="botao pequeno" :to="`/casos/novo?cliente=${id}`"><Icone nome="mais" /> Novo caso</RouterLink>
        </header>
        <Estado
          :carregando="casos.carregando.value"
          :erro="casos.erro.value"
          :vazio="!casos.dados.value?.dados.length"
          mensagem="Nenhum caso cadastrado para este cliente."
          icone="casos"
          @repetir="casos.recarregar"
        >
          <table v-if="casos.dados.value">
            <thead>
              <tr>
                <th>Caso</th>
                <th>Status</th>
                <th class="num">Valor do caso</th>
                <th class="num">Recebido</th>
                <th class="num">Pendente</th>
                <th class="num">Minha participação</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="caso in casos.dados.value.dados" :key="caso.id" class="clicavel" @click="router.push(`/casos/${caso.id}`)">
                <td>
                  <RouterLink class="titulo-celula" :to="`/casos/${caso.id}`" @click.stop>{{ caso.titulo }}</RouterLink>
                </td>
                <td><span class="selo">{{ rotuloSituacao[caso.status] ?? caso.status }}</span></td>
                <td class="dinheiro">{{ moeda(caso.valor) }}</td>
                <td class="dinheiro">{{ moeda(caso.recebido) }}</td>
                <td class="dinheiro">{{ moeda(caso.pendente) }}</td>
                <td class="num"><span class="selo acao">{{ Number(caso.percentual_principal) }}%</span></td>
              </tr>
            </tbody>
          </table>
        </Estado>
      </section>
    </template>
  </Estado>

  <Modal
    v-if="modalCliente"
    titulo="Editar cliente"
    :salvando="salvando"
    @fechar="modalCliente = false"
    @confirmar="salvarCliente"
  >
    <div class="campo">
      <label for="cliente-nome">Nome *</label>
      <input id="cliente-nome" v-model="formCliente.nome" required maxlength="200" />
    </div>
    <div class="grade-2">
      <div class="campo">
        <label for="cliente-documento">CPF / CNPJ</label>
        <input id="cliente-documento" v-model="formCliente.documento" maxlength="20" />
      </div>
      <div class="campo">
        <label for="cliente-telefone">Telefone</label>
        <input id="cliente-telefone" v-model="formCliente.telefone" maxlength="30" />
      </div>
    </div>
    <div class="campo">
      <label for="cliente-email">E-mail</label>
      <input id="cliente-email" v-model="formCliente.email" type="email" maxlength="120" />
    </div>
    <div class="campo">
      <label for="cliente-observacoes">Observações</label>
      <textarea id="cliente-observacoes" v-model="formCliente.observacoes" maxlength="2000" />
    </div>
    <Aviso :texto="erroFormulario" />
  </Modal>

</template>

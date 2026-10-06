<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Aviso from '../components/Aviso.vue'
import ColunaOrdem from '../components/ColunaOrdem.vue'
import Estado from '../components/Estado.vue'
import Icone from '../components/Icone.vue'
import Modal from '../components/Modal.vue'
import Paginacao from '../components/Paginacao.vue'
import { api, type Pagina } from '../api.ts'
import { avisar } from '../avisos.ts'
import { iniciais, moeda } from '../format.ts'
import { useOrdenacao } from '../ordenacao.ts'
import { useRecurso, watchDebounced } from '../recurso.ts'

type Cliente = {
  id: string; nome: string; documento: string | null; email: string | null; telefone: string | null
  casos: string; pendente: string; recebido: string; vencido: string
}

const router = useRouter()
const busca = ref('')
const pagina = ref(1)

const { dados, carregando, erro, recarregar } = useRecurso(() =>
  api.get<Pagina<Cliente>>(
    `/clientes?pagina=${pagina.value}&limite=20&busca=${encodeURIComponent(busca.value)}${query()}`,
  ),
)
const { ordem, ordenar, query } = useOrdenacao(() => (pagina.value === 1 ? recarregar() : (pagina.value = 1)))

watchDebounced(() => busca.value, () => {
  pagina.value = 1
  recarregar()
})
watch(pagina, recarregar)
onMounted(recarregar)

const modalAberto = ref(false)
const salvando = ref(false)
const erroFormulario = ref('')
const formulario = reactive({ nome: '', documento: '', email: '', telefone: '', observacoes: '' })

function abrir() {
  Object.assign(formulario, { nome: '', documento: '', email: '', telefone: '', observacoes: '' })
  erroFormulario.value = ''
  modalAberto.value = true
}

async function salvar() {
  salvando.value = true
  erroFormulario.value = ''
  try {
    const criado = await api.post<Cliente>('/clientes', {
      nome: formulario.nome,
      documento: formulario.documento || undefined,
      email: formulario.email || undefined,
      telefone: formulario.telefone || undefined,
      observacoes: formulario.observacoes || undefined,
    })
    modalAberto.value = false
    avisar('Cliente cadastrado. Agora cadastre o caso.')
    router.push(`/casos/novo?cliente=${criado.id}`)
  } catch (e) {
    erroFormulario.value = (e as Error).message
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <div class="topo">
    <div>
      <h1>Clientes</h1>
      <p>Cadastro e situação financeira de cada cliente.</p>
    </div>
    <button class="botao primario" @click="abrir"><Icone nome="mais" /> Novo cliente</button>
  </div>

  <section class="painel">
    <header>
      <div class="busca">
        <Icone nome="busca" />
        <input v-model="busca" type="search" placeholder="Buscar por nome ou documento" aria-label="Buscar clientes" />
      </div>
    </header>

    <Estado
      :carregando="carregando"
      :erro="erro"
      :vazio="!dados?.dados.length"
      :mensagem="busca ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente cadastrado ainda.'"
      icone="clientes"
      @repetir="recarregar"
    >
      <template #acao>
        <button v-if="!busca" class="botao primario" @click="abrir"><Icone nome="mais" /> Cadastrar cliente</button>
      </template>
      <table v-if="dados">
        <thead>
          <tr>
            <ColunaOrdem campo="nome" :ordem="ordem" @ordenar="ordenar">Cliente</ColunaOrdem>
            <ColunaOrdem campo="documento" :ordem="ordem" @ordenar="ordenar">Documento</ColunaOrdem>
            <ColunaOrdem campo="casos" num :ordem="ordem" @ordenar="ordenar">Casos</ColunaOrdem>
            <ColunaOrdem campo="pendente" num :ordem="ordem" @ordenar="ordenar">A receber</ColunaOrdem>
            <ColunaOrdem campo="vencido" num :ordem="ordem" @ordenar="ordenar">Vencido</ColunaOrdem>
            <ColunaOrdem campo="recebido" num :ordem="ordem" @ordenar="ordenar">Recebido</ColunaOrdem>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cliente in dados.dados" :key="cliente.id" class="clicavel" @click="router.push(`/clientes/${cliente.id}`)">
            <td>
              <div class="principal-celula">
                <span class="inicial">{{ iniciais(cliente.nome) }}</span>
                <div>
                  <RouterLink class="titulo-celula" :to="`/clientes/${cliente.id}`" @click.stop>{{ cliente.nome }}</RouterLink>
                  <div class="sub-celula">{{ cliente.telefone ?? cliente.email ?? 'sem contato' }}</div>
                </div>
              </div>
            </td>
            <td class="fraco mono">{{ cliente.documento ?? '—' }}</td>
            <td class="num">{{ cliente.casos }}</td>
            <td class="dinheiro">{{ moeda(cliente.pendente) }}</td>
            <td class="dinheiro" :style="Number(cliente.vencido) > 0 ? 'color: var(--erro)' : 'color: var(--texto-3)'">
              {{ moeda(cliente.vencido) }}
            </td>
            <td class="dinheiro">{{ moeda(cliente.recebido) }}</td>
          </tr>
        </tbody>
      </table>
      <Paginacao
        v-if="dados"
        :pagina="dados.pagina"
        :paginas="dados.paginas"
        :total="dados.total"
        @mudar="pagina = $event"
      />
    </Estado>
  </section>

  <Modal v-if="modalAberto" titulo="Novo cliente" :salvando="salvando" @fechar="modalAberto = false" @confirmar="salvar">
    <div class="campo">
      <label for="nome">Nome *</label>
      <input id="nome" v-model="formulario.nome" required maxlength="200" autofocus />
    </div>
    <div class="grade-2">
      <div class="campo">
        <label for="documento">CPF / CNPJ</label>
        <input id="documento" v-model="formulario.documento" maxlength="20" />
      </div>
      <div class="campo">
        <label for="telefone">Telefone</label>
        <input id="telefone" v-model="formulario.telefone" maxlength="30" />
      </div>
    </div>
    <div class="campo">
      <label for="email">E-mail</label>
      <input id="email" v-model="formulario.email" type="email" maxlength="120" />
    </div>
    <div class="campo">
      <label for="observacoes">Observações</label>
      <textarea id="observacoes" v-model="formulario.observacoes" maxlength="2000" />
    </div>
    <Aviso :texto="erroFormulario" />
  </Modal>
</template>

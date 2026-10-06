<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Aviso from '../components/Aviso.vue'
import CampoMoeda from '../components/CampoMoeda.vue'
import Distribuicao from '../components/Distribuicao.vue'
import Cartao from '../components/Cartao.vue'
import Estado from '../components/Estado.vue'
import Icone from '../components/Icone.vue'
import Modal from '../components/Modal.vue'
import Notas from '../components/Notas.vue'
import PainelContas from '../components/PainelContas.vue'
import { api, type Pagina } from '../api.ts'
import { avisar, confirmar } from '../avisos.ts'
import { data, moeda, paraNumero, percentual, rotuloSituacao } from '../format.ts'
import { restante, type Repasse } from '../distribuicao.ts'
import { useRecurso } from '../recurso.ts'

type Caso = {
  id: string; cliente_id: string; cliente_nome: string; titulo: string; descricao: string | null
  valor: string; status: string; recebido: string; pendente: string; vencido: string
  percentual_principal: string; repassado: string; advogado_recebido: string; advogado_a_receber: string
  advogados: { advogado_id: string; nome: string; percentual: string; principal: boolean }[]
  contas: { id: string; descricao: string; valor_total: string; recebido: string; pendente: string; criado_em: string }[]
}

const rota = useRoute()
const router = useRouter()
const id = String(rota.params.id)

const caso = useRecurso(() => api.get<Caso>(`/casos/${id}`))
const advogados = useRecurso(() => api.get<Pagina<{ id: string; nome: string; principal: boolean }>>('/advogados?limite=100'))

const distribuicao = ref<Repasse[]>([])
const salvandoDistribuicao = ref(false)
const erroDistribuicao = ref('')

const salva = computed(() =>
  (caso.dados.value?.advogados ?? [])
    .filter((a) => !a.principal)
    .map((a) => ({ advogado_id: a.advogado_id, percentual: Number(a.percentual) })),
)
watch(salva, (lista) => (distribuicao.value = lista.map((r) => ({ ...r }))))
const alterada = computed(() => JSON.stringify(distribuicao.value) !== JSON.stringify(salva.value))

onMounted(() => {
  caso.recarregar()
  advogados.recarregar()
})

async function salvarDistribuicao() {
  salvandoDistribuicao.value = true
  erroDistribuicao.value = ''
  try {
    await api.put(`/casos/${id}/advogados`, {
      advogados: distribuicao.value.filter((p) => Number(p.percentual) > 0),
    })
    avisar('Divisão salva.')
    await caso.recarregar()
  } catch (e) {
    erroDistribuicao.value = (e as Error).message
  } finally {
    salvandoDistribuicao.value = false
  }
}

const modalEdicao = ref(false)
const salvando = ref(false)
const erroFormulario = ref('')
const formulario = reactive({ titulo: '', valor: '', status: 'ativo', descricao: '' })

function abrirEdicao() {
  if (!caso.dados.value) return
  Object.assign(formulario, {
    titulo: caso.dados.value.titulo,
    valor: Number(caso.dados.value.valor).toFixed(2).replace('.', ','),
    status: caso.dados.value.status,
    descricao: caso.dados.value.descricao ?? '',
  })
  erroFormulario.value = ''
  modalEdicao.value = true
}

async function salvarCaso() {
  salvando.value = true
  erroFormulario.value = ''
  try {
    await api.put(`/casos/${id}`, {
      titulo: formulario.titulo,
      valor: paraNumero(formulario.valor),
      status: formulario.status,
      descricao: formulario.descricao || undefined,
    })
    modalEdicao.value = false
    avisar('Caso atualizado.')
    await caso.recarregar()
  } catch (e) {
    erroFormulario.value = (e as Error).message
  } finally {
    salvando.value = false
  }
}

async function excluir() {
  const ok = await confirmar(
    'Excluir caso',
    'A divisão entre advogados será removida. Casos com contas vinculadas não podem ser excluídos.',
    { confirmar: 'Excluir caso', perigo: true },
  )
  if (!ok) return
  try {
    await api.delete(`/casos/${id}`)
    avisar('Caso excluído.')
    router.push('/casos')
  } catch (e) {
    avisar((e as Error).message, 'erro')
  }
}
</script>

<template>
  <Estado :carregando="caso.carregando.value" :erro="caso.erro.value" @repetir="caso.recarregar">
    <template v-if="caso.dados.value">
      <div class="topo">
        <div>
          <p class="trilha">
            <RouterLink to="/casos">Casos</RouterLink> ·
            <RouterLink :to="`/clientes/${caso.dados.value.cliente_id}`">{{ caso.dados.value.cliente_nome }}</RouterLink>
          </p>
          <h1>{{ caso.dados.value.titulo }}</h1>
          <p>
            <span class="selo">{{ rotuloSituacao[caso.dados.value.status] ?? caso.dados.value.status }}</span>
            <span v-if="caso.dados.value.descricao"> · {{ caso.dados.value.descricao }}</span>
          </p>
        </div>
        <div class="acoes">
          <button class="botao perigo" @click="excluir"><Icone nome="excluir" /> Excluir</button>
          <button class="botao" @click="abrirEdicao"><Icone nome="editar" /> Editar</button>
        </div>
      </div>

      <section class="cartoes">
        <Cartao rotulo="Valor do caso" :valor="moeda(caso.dados.value.valor)" icone="casos" nota="Valor acordado" />
        <Cartao
          rotulo="Recebido no caso"
          :valor="moeda(caso.dados.value.recebido)"
          tom="sucesso"
          icone="confirmar"
          :nota="`${moeda(caso.dados.value.pendente)} pendente`"
        />
        <Cartao
          rotulo="Minha parte recebida"
          :valor="moeda(caso.dados.value.advogado_recebido)"
          tom="acao"
          icone="caixa"
          destaque
          :nota="`Recebido menos ${moeda(caso.dados.value.repassado)} em repasses`"
        />
        <Cartao
          rotulo="Minha parte a receber"
          :valor="moeda(caso.dados.value.advogado_a_receber)"
          icone="grafico"
          :nota="`${percentual(caso.dados.value.percentual_principal)} do que falta, pela divisão`"
        />
      </section>

      <section class="painel">
        <header>
          <div>
            <h2>Divisão entre advogados</h2>
            <p>
              Já vem preenchida ao receber uma parcela deste caso.
              <template v-if="Number(caso.dados.value.recebido) > 0">
                Valores calculados sobre o recebido até agora ({{ moeda(caso.dados.value.recebido) }}).
              </template>
            </p>
          </div>
          <div class="acoes">
            <span v-if="alterada" class="selo proxima">Alterações não salvas</span>
            <button v-if="alterada" class="botao pequeno" @click="distribuicao = salva.map((r) => ({ ...r }))">Desfazer</button>
            <button
              class="botao primario pequeno"
              :disabled="!alterada || salvandoDistribuicao || restante(distribuicao) < 0"
              @click="salvarDistribuicao"
            >
              {{ salvandoDistribuicao ? 'Salvando…' : 'Salvar divisão' }}
            </button>
          </div>
        </header>
        <div class="corpo">
          <p v-if="!advogados.dados.value?.dados.length" class="fraco" style="margin: 0">
            Nenhum advogado cadastrado. <RouterLink to="/configuracoes">Cadastre os advogados</RouterLink> para dividir os valores.
          </p>
          <Distribuicao
            v-else
            id="divisao-caso"
            v-model="distribuicao"
            :advogados="advogados.dados.value?.dados ?? []"
            :valor="Number(caso.dados.value.recebido)"
          />
          <Aviso v-if="erroDistribuicao" :texto="erroDistribuicao" style="margin: 12px 0 0" />
        </div>
      </section>

      <PainelContas
        :cliente-id="caso.dados.value.cliente_id"
        :caso-id="id"
        :descricao-nova="`Honorários — ${caso.dados.value.titulo}`"
        @alterado="caso.recarregar"
      />

      <Notas
        :caso-id="id"
        :cliente-id="caso.dados.value.cliente_id"
        :cliente-nome="caso.dados.value.cliente_nome"
        descricao="Andamento do caso: audiências, prazos e combinados."
      />



    </template>
  </Estado>

  <Modal v-if="modalEdicao" titulo="Editar caso" :salvando="salvando" @fechar="modalEdicao = false" @confirmar="salvarCaso">
    <div class="campo">
      <label for="titulo">Título *</label>
      <input id="titulo" v-model="formulario.titulo" required maxlength="200" autofocus />
    </div>
    <div class="grade-2">
      <CampoMoeda id="valor" v-model="formulario.valor" rotulo="Valor do caso" />
      <div class="campo">
        <label for="status">Status</label>
        <select id="status" v-model="formulario.status">
          <option value="ativo">Ativo</option>
          <option value="encerrado">Encerrado</option>
          <option value="arquivado">Arquivado</option>
        </select>
      </div>
    </div>
    <div class="campo">
      <label for="descricao">Descrição</label>
      <textarea id="descricao" v-model="formulario.descricao" maxlength="2000" />
    </div>
    <Aviso :texto="erroFormulario" />
  </Modal>
</template>

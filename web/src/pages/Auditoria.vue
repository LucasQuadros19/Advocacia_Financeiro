<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Estado from '../components/Estado.vue'
import Icone from '../components/Icone.vue'
import Modal from '../components/Modal.vue'
import Paginacao from '../components/Paginacao.vue'
import TabelaDados from '../components/TabelaDados.vue'
import { api, type Pagina } from '../api.ts'
import { dataHora, hoje, iniciais } from '../format.ts'
import { useRecurso, watchDebounced } from '../recurso.ts'

type Registro = {
  id: number; usuario_id: string | null; usuario_nome: string | null; acao: string; alvo: string
  alvo_id: string | null; descricao: string; status: number | null; criado_em: string
}
type Detalhe = Registro & {
  metodo: string | null; rota: string | null; ip: string | null
  dados: Record<string, unknown> | null; antes: Record<string, unknown> | null; resposta: Record<string, unknown> | null
}
type Filtros = { acoes: string[]; alvos: string[]; usuarios: { id: string; nome: string }[] }

const ACOES: Record<string, { rotulo: string; tom: string }> = {
  CRIAR: { rotulo: 'Criou', tom: 'pago' },
  ALTERAR: { rotulo: 'Alterou', tom: 'acao' },
  EXCLUIR: { rotulo: 'Excluiu', tom: 'vencida' },
  BAIXA: { rotulo: 'Baixa', tom: 'pago' },
  ESTORNO: { rotulo: 'Estorno', tom: 'proxima' },
  ADIAR: { rotulo: 'Adiou', tom: 'proxima' },
  LOGIN: { rotulo: 'Entrou', tom: '' },
  LOGOUT: { rotulo: 'Saiu', tom: '' },
  NEGADO: { rotulo: 'Negado', tom: 'negado' },
}
const acao = (codigo: string) => ACOES[codigo] ?? { rotulo: codigo, tom: '' }

const diasAtras = (dias: number) => new Date(Date.now() - dias * 86400000).toLocaleDateString('en-CA')
const ATALHOS = [
  { rotulo: 'Hoje', de: () => hoje() },
  { rotulo: '7 dias', de: () => diasAtras(6) },
  { rotulo: '30 dias', de: () => diasAtras(29) },
  { rotulo: 'Tudo', de: () => '' },
]

const rota = useRoute()
const filtro = reactive({
  de: diasAtras(29),
  ate: '',
  usuario_id: String(rota.query.usuario_id ?? ''),
  acao: '',
  alvo: '',
  busca: '',
  recusadas: false,
})
const pagina = ref(1)

const parametros = computed(() => {
  const p = new URLSearchParams({ pagina: String(pagina.value), limite: '50' })
  for (const [chave, valor] of Object.entries(filtro)) if (valor) p.set(chave, String(valor))
  return p.toString()
})

const registros = useRecurso(() => api.get<Pagina<Registro>>(`/auditoria?${parametros.value}`))
const filtros = useRecurso(() => api.get<Filtros>('/auditoria/filtros'))
const nomes = ref<Record<string, string>>({})
onMounted(async () => {
  registros.recarregar()
  filtros.recarregar()
  const [carteiras, advogados] = await Promise.all([
    api.get<{ dados: { id: string; nome: string }[] }>('/carteiras').catch(() => ({ dados: [] })),
    api.get<Pagina<{ id: string; nome: string }>>('/advogados?limite=100').catch(() => ({ dados: [] })),
  ])
  nomes.value = Object.fromEntries([...carteiras.dados, ...advogados.dados].map((r) => [r.id, r.nome]))
})

const recomecar = () => (pagina.value === 1 ? registros.recarregar() : (pagina.value = 1))
watch(() => [filtro.de, filtro.ate, filtro.usuario_id, filtro.acao, filtro.alvo, filtro.recusadas], recomecar)
watchDebounced(() => filtro.busca, recomecar)
watch(pagina, registros.recarregar)

const atalhoAtivo = (de: () => string) => filtro.de === de() && !filtro.ate

const detalhe = ref<Detalhe>()
async function abrir(r: Registro) {
  detalhe.value = await api.get<Detalhe>(`/auditoria/${r.id}`)
}
const vazio = (o: Record<string, unknown> | null) => !o || !Object.keys(o).length
</script>

<template>
  <div class="topo">
    <div>
      <h1>Auditoria</h1>
      <p>Tudo o que foi feito no sistema, por quem e quando. Estes registros não podem ser alterados nem apagados.</p>
    </div>
  </div>

  <section class="painel">
    <header class="filtros-auditoria">
      <div class="atalhos" role="group" aria-label="Período">
        <button
          v-for="a in ATALHOS"
          :key="a.rotulo"
          type="button"
          class="botao pequeno"
          :class="{ primario: atalhoAtivo(a.de) }"
          :aria-pressed="atalhoAtivo(a.de)"
          @click="Object.assign(filtro, { de: a.de(), ate: '' })"
        >
          {{ a.rotulo }}
        </button>
      </div>
      <div class="filtros">
        <div class="campo">
          <label for="a-de">De</label>
          <input id="a-de" v-model="filtro.de" type="date" :max="hoje()" />
        </div>
        <div class="campo">
          <label for="a-ate">Até</label>
          <input id="a-ate" v-model="filtro.ate" type="date" :max="hoje()" />
        </div>
        <div class="campo">
          <label for="a-usuario">Usuário</label>
          <select id="a-usuario" v-model="filtro.usuario_id">
            <option value="">Todos</option>
            <option v-for="u in filtros.dados.value?.usuarios ?? []" :key="u.id" :value="u.id">{{ u.nome }}</option>
          </select>
        </div>
        <div class="campo">
          <label for="a-acao">Ação</label>
          <select id="a-acao" v-model="filtro.acao">
            <option value="">Todas</option>
            <option v-for="a in filtros.dados.value?.acoes ?? []" :key="a" :value="a">{{ acao(a).rotulo }}</option>
          </select>
        </div>
        <div class="campo">
          <label for="a-alvo">Área</label>
          <select id="a-alvo" v-model="filtro.alvo">
            <option value="">Todas</option>
            <option v-for="a in filtros.dados.value?.alvos ?? []" :key="a" :value="a">{{ a }}</option>
          </select>
        </div>
        <div class="busca">
          <Icone nome="busca" />
          <input v-model="filtro.busca" type="search" placeholder="Procurar na descrição" aria-label="Procurar na auditoria" />
        </div>
        <label class="opcao-linha">
          <input v-model="filtro.recusadas" type="checkbox" />
          Só tentativas recusadas
        </label>
      </div>
    </header>

    <Estado
      :carregando="registros.carregando.value"
      :erro="registros.erro.value"
      :vazio="!registros.dados.value?.dados.length"
      icone="escudo"
      mensagem="Nada registrado com esses filtros."
      @repetir="registros.recarregar"
    >
      <table v-if="registros.dados.value">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Quem</th>
            <th>Ação</th>
            <th>Área</th>
            <th>O que foi feito</th>
            <th>Resultado</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in registros.dados.value.dados"
            :key="r.id"
            class="clicavel"
            :class="{ 'linha-negada': r.acao === 'NEGADO' }"
            tabindex="0"
            @click="abrir(r)"
            @keydown.enter="abrir(r)"
          >
            <td class="nowrap">{{ dataHora(r.criado_em) }}</td>
            <td class="nowrap">
              <div v-if="r.usuario_nome" class="principal-celula">
                <span class="inicial pequena">{{ iniciais(r.usuario_nome) }}</span>
                {{ r.usuario_nome }}
              </div>
              <span v-else class="fraco">Sem sessão</span>
            </td>
            <td>
              <span class="selo" :class="acao(r.acao).tom">
                <Icone v-if="r.acao === 'NEGADO'" nome="escudo" :tamanho="12" /> {{ acao(r.acao).rotulo }}
              </span>
            </td>
            <td class="fraco nowrap">{{ r.alvo }}</td>
            <td>{{ r.descricao }}</td>
            <td class="nowrap">
              <span v-if="r.status && r.status >= 400" class="selo vencida">Recusado</span>
              <span v-else class="fraco">OK</span>
            </td>
          </tr>
        </tbody>
      </table>
      <Paginacao
        v-if="registros.dados.value"
        :pagina="registros.dados.value.pagina"
        :paginas="registros.dados.value.paginas"
        :total="registros.dados.value.total"
        @mudar="pagina = $event"
      />
    </Estado>
  </section>

  <Modal v-if="detalhe" leitura :titulo="detalhe.descricao" @fechar="detalhe = undefined">
    <p v-if="detalhe.acao === 'NEGADO'" class="aviso">
      <Icone nome="escudo" />
      <span>Tentativa barrada pelo sistema. Nada foi alterado.</span>
    </p>
    <p v-else-if="detalhe.status && detalhe.status >= 400" class="aviso alerta">
      <Icone nome="alerta" />
      <span>O sistema recusou: {{ detalhe.resposta?.erro ?? `código ${detalhe.status}` }}. Nada foi alterado.</span>
    </p>
    <div class="resumo-modal">
      <div>Quando<strong>{{ dataHora(detalhe.criado_em) }}</strong></div>
      <div>Quem<strong>{{ detalhe.usuario_nome ?? 'Sem sessão' }}</strong></div>
      <div>Ação<strong>{{ acao(detalhe.acao).rotulo }} · {{ detalhe.alvo }}</strong></div>
      <div>De onde<strong>{{ detalhe.ip ?? '—' }}</strong></div>
    </div>

    <template v-if="!vazio(detalhe.dados)">
      <h3 class="titulo-secao">O que foi informado</h3>
      <TabelaDados
        :objeto="detalhe.dados!"
        :comparar="detalhe.acao === 'ALTERAR' ? detalhe.antes : null"
        :nomes="nomes"
      />
    </template>
    <template v-if="!vazio(detalhe.antes)">
      <h3 class="titulo-secao">Como estava antes</h3>
      <TabelaDados :objeto="detalhe.antes!" :nomes="nomes" />
    </template>
    <template v-if="!vazio(detalhe.resposta) && !(detalhe.status && detalhe.status >= 400)">
      <h3 class="titulo-secao">Como ficou</h3>
      <TabelaDados :objeto="detalhe.resposta!" :comparar="detalhe.antes" :nomes="nomes" />
    </template>
    <p class="dica" style="margin-top: 14px">
      Registro nº {{ detalhe.id }}<template v-if="detalhe.rota"> · {{ detalhe.metodo }} {{ detalhe.rota }}</template>
    </p>
  </Modal>
</template>

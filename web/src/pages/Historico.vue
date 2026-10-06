<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Estado from '../components/Estado.vue'
import Grafico from '../components/Grafico.vue'
import Icone from '../components/Icone.vue'
import Paginacao from '../components/Paginacao.vue'
import { api, type Pagina } from '../api.ts'
import { data, hoje, moeda } from '../format.ts'
import { useRecurso } from '../recurso.ts'

type Conta = {
  id: string | null; nome: string; tipo: 'banco' | 'dinheiro' | null; ativa: boolean
  saldo_inicio_mes: string; saldo_fim_mes: string; entrou_mes: string; saiu_mes: string
}
type Historico = {
  mes: string
  primeiro_mes: string
  contas: Conta[]
  sem_carteira: Conta | null
  resumo: { entradas: string; saidas: string; movimentos: string }
  por_origem: { tipo: string; origem: string; total: string; quantidade: string }[]
  saidas_por_categoria: { categoria: string; total: string }[]
  meses: { mes: string; entradas: string; saidas: string }[]
}
type Movimento = {
  id: string; tipo: 'entrada' | 'saida' | 'transferencia'; origem: string; descricao: string; contraparte: string
  valor: string; data_pagamento: string; carteira_nome: string | null; carteira_destino_nome: string | null
  observacoes: string | null
}

const mes = ref(hoje().slice(0, 7))
const pagina = ref(1)

const historico = useRecurso(() => api.get<Historico>(`/historico?mes=${mes.value}`))
const extrato = useRecurso(() =>
  api.get<Pagina<Movimento>>(`/caixa/lancamentos?mes=${mes.value}&status=pago&pagina=${pagina.value}&limite=25`),
)

onMounted(() => {
  historico.recarregar()
  extrato.recarregar()
})
watch(mes, () => {
  historico.recarregar()
  if (pagina.value === 1) extrato.recarregar()
  else pagina.value = 1
})
watch(pagina, extrato.recarregar)

const rotuloMes = (valor: string) => {
  const texto = new Date(`${valor}-01T00:00:00Z`).toLocaleDateString('pt-BR', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

const meses = computed(() => {
  const lista: string[] = []
  const [anoFim, mesFim] = hoje().slice(0, 7).split('-').map(Number) as [number, number]
  const inicio = historico.dados.value?.primeiro_mes ?? hoje().slice(0, 7)
  let [ano, m] = inicio.split('-').map(Number) as [number, number]
  while (ano < anoFim || (ano === anoFim && m <= mesFim)) {
    lista.push(`${ano}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      ano += 1
    }
  }
  return lista.reverse()
})
const indice = computed(() => meses.value.indexOf(mes.value))
const ir = (passo: number) => {
  const alvo = meses.value[indice.value - passo]
  if (alvo) mes.value = alvo
}

const contas = computed(() => {
  const h = historico.dados.value
  if (!h) return []
  const temMovimento = (c: Conta) => Number(c.saldo_fim_mes) !== 0 || Number(c.entrou_mes) !== 0 || Number(c.saiu_mes) !== 0
  return [...h.contas, ...(h.sem_carteira && temMovimento(h.sem_carteira) ? [h.sem_carteira] : [])]
})
const somar = (campo: keyof Pick<Conta, 'saldo_inicio_mes' | 'saldo_fim_mes'>) =>
  contas.value.reduce((s, c) => s + Math.round(Number(c[campo]) * 100), 0) / 100
const saldoInicio = computed(() => somar('saldo_inicio_mes'))
const saldoFim = computed(() => somar('saldo_fim_mes'))
const resultado = computed(() => Number(historico.dados.value?.resumo.entradas ?? 0) - Number(historico.dados.value?.resumo.saidas ?? 0))
const variacao = (inicio: number, fim: number) =>
  inicio === 0 ? null : Math.round(((fim - inicio) / Math.abs(inicio)) * 1000) / 10

const ORIGEM: Record<string, string> = {
  'entrada:recebimento': 'Honorários recebidos de clientes',
  'entrada:manual': 'Entradas avulsas',
  'saida:despesa': 'Contas programadas pagas',
  'saida:repasse': 'Repasses a advogados',
  'saida:manual': 'Saídas avulsas',
}
const maiorCategoria = computed(() =>
  Math.max(...(historico.dados.value?.saidas_por_categoria ?? []).map((c) => Number(c.total)), 1),
)
const grafico = computed(() =>
  (historico.dados.value?.meses ?? []).map((m) => ({ mes: m.mes, recebido: m.entradas, previsto: m.saidas })),
)
</script>

<template>
  <div class="topo">
    <div>
      <h1>Histórico mensal</h1>
      <p>Como cada conta terminou o mês, o que entrou e o que saiu.</p>
    </div>
    <div class="navegar-mes">
      <button class="botao icone" :disabled="indice >= meses.length - 1" aria-label="Mês anterior" @click="ir(-1)">
        <Icone nome="anterior" />
      </button>
      <select v-model="mes" aria-label="Mês">
        <option v-for="m in meses" :key="m" :value="m">{{ rotuloMes(m) }}</option>
      </select>
      <button class="botao icone" :disabled="indice <= 0" aria-label="Próximo mês" @click="ir(1)">
        <Icone nome="proximo" />
      </button>
      <a
        class="botao"
        :href="`/api/exportar/historico.csv?mes=${mes}`"
        download
        title="Baixar os 12 meses até o mês escolhido"
      >
        <Icone nome="baixar" /> Exportar 12 meses
      </a>
    </div>
  </div>

  <Estado :carregando="historico.carregando.value" :erro="historico.erro.value" @repetir="historico.recarregar">
    <template v-if="historico.dados.value">
      <p v-if="!historico.dados.value.contas.length" class="aviso alerta">
        <Icone nome="alerta" />
        <span>
          Nenhum banco cadastrado. <RouterLink to="/configuracoes?aba=bancos">Cadastre em Configurações</RouterLink>
          para ver o saldo de cada um mês a mês.
        </span>
      </p>

      <section class="cartoes">
        <div v-for="c in contas" :key="c.id ?? 'sem'" class="cartao conta-mes" :class="{ apagado: !c.id }">
          <div class="rotulo">
            <Icone :nome="!c.id ? 'alerta' : c.tipo === 'dinheiro' ? 'dinheiro' : 'banco'" :tamanho="14" /> {{ c.nome }}
          </div>
          <div class="valor" :class="{ negativo: Number(c.saldo_fim_mes) < 0 }">{{ moeda(c.saldo_fim_mes) }}</div>
          <div class="nota">no fim do mês</div>
          <dl>
            <div><dt>Começou com</dt><dd>{{ moeda(c.saldo_inicio_mes) }}</dd></div>
            <div><dt>Entrou</dt><dd class="entrada">+{{ moeda(c.entrou_mes) }}</dd></div>
            <div><dt>Saiu</dt><dd class="saida">−{{ moeda(c.saiu_mes) }}</dd></div>
          </dl>
        </div>
      </section>

      <section class="painel resumo-historico">
        <div>
          <span>Entradas do mês</span>
          <strong class="entrada">{{ moeda(historico.dados.value.resumo.entradas) }}</strong>
        </div>
        <div>
          <span>Saídas do mês</span>
          <strong class="saida">{{ moeda(historico.dados.value.resumo.saidas) }}</strong>
        </div>
        <div>
          <span>Resultado</span>
          <strong :class="resultado < 0 ? 'saida' : 'entrada'">{{ moeda(resultado) }}</strong>
        </div>
        <div>
          <span>Total em caixa no fim do mês</span>
          <strong>{{ moeda(saldoFim) }}</strong>
          <small>
            começou com {{ moeda(saldoInicio) }}
            <b v-if="variacao(saldoInicio, saldoFim) !== null" :class="saldoFim < saldoInicio ? 'saida' : 'entrada'">
              · {{ saldoFim >= saldoInicio ? '+' : '' }}{{ variacao(saldoInicio, saldoFim) }}%
            </b>
          </small>
        </div>
      </section>

      <div class="grade-historico">
        <section class="painel">
          <header><h2>De onde veio e para onde foi</h2></header>
          <table>
            <tbody>
              <tr v-for="o in historico.dados.value.por_origem" :key="`${o.tipo}-${o.origem}`">
                <td>
                  <span class="seta" :class="o.tipo">{{ o.tipo === 'entrada' ? '+' : '−' }}</span>
                  {{ ORIGEM[`${o.tipo}:${o.origem}`] ?? o.origem }}
                  <span class="fraco"> · {{ o.quantidade }}</span>
                </td>
                <td class="dinheiro" :class="o.tipo">{{ moeda(o.total) }}</td>
              </tr>
              <tr v-if="!historico.dados.value.por_origem.length">
                <td class="fraco" colspan="2">Nada entrou nem saiu neste mês.</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="painel">
          <header><h2>Saídas por categoria</h2></header>
          <ul v-if="historico.dados.value.saidas_por_categoria.length" class="barras-categoria">
            <li v-for="c in historico.dados.value.saidas_por_categoria" :key="c.categoria">
              <div><span>{{ c.categoria }}</span><strong>{{ moeda(c.total) }}</strong></div>
              <i :style="{ width: `${(Number(c.total) / maiorCategoria) * 100}%` }" />
            </li>
          </ul>
          <p v-else class="estado">Nenhuma saída neste mês.</p>
        </section>
      </div>

      <section class="painel">
        <header>
          <div>
            <h2>Últimos 12 meses</h2>
            <p>Entradas e saídas pagas em cada mês. O mês escolhido fica destacado.</p>
          </div>
        </header>
        <Grafico :meses="grafico" :rotulos="['Entradas', 'Saídas']" saidas :destaque="mes" />
      </section>

      <section class="painel">
        <header>
          <div>
            <h2>Lançamentos de {{ rotuloMes(mes) }}</h2>
            <p>{{ historico.dados.value.resumo.movimentos }} movimento(s), mais as transferências entre contas.</p>
          </div>
          <RouterLink class="botao pequeno" to="/caixa">Abrir no caixa</RouterLink>
        </header>
        <Estado
          :carregando="extrato.carregando.value"
          :erro="extrato.erro.value"
          :vazio="!extrato.dados.value?.dados.length"
          icone="caixa"
          mensagem="Nenhum lançamento neste mês."
          @repetir="extrato.recarregar"
        >
          <table v-if="extrato.dados.value">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Conta</th>
                <th class="num">Entrada</th>
                <th class="num">Saída</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in extrato.dados.value.dados" :key="`${l.origem}-${l.id}`">
                <td class="nowrap">{{ data(l.data_pagamento) }}</td>
                <td>
                  <div class="titulo-celula">{{ l.descricao }}</div>
                  <div class="sub-celula">{{ l.contraparte }}</div>
                  <div v-if="l.observacoes" class="obs"><Icone nome="casos" :tamanho="12" /> {{ l.observacoes }}</div>
                </td>
                <td class="fraco nowrap">
                  {{ l.tipo === 'transferencia' ? `${l.carteira_nome} → ${l.carteira_destino_nome}` : (l.carteira_nome ?? 'Sem conta') }}
                </td>
                <td class="dinheiro entrada">{{ l.tipo === 'entrada' ? moeda(l.valor) : '' }}</td>
                <td class="dinheiro saida">{{ l.tipo === 'saida' ? moeda(l.valor) : '' }}</td>
              </tr>
            </tbody>
          </table>
          <Paginacao
            v-if="extrato.dados.value"
            :pagina="extrato.dados.value.pagina"
            :paginas="extrato.dados.value.paginas"
            :total="extrato.dados.value.total"
            @mudar="pagina = $event"
          />
        </Estado>
      </section>
    </template>
  </Estado>
</template>

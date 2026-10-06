<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import Estado from '../components/Estado.vue'
import Grafico from '../components/Grafico.vue'
import Cartao from '../components/Cartao.vue'
import Icone from '../components/Icone.vue'
import Selo from '../components/Selo.vue'
import { api } from '../api.ts'
import { moeda, data, prazo } from '../format.ts'
import { useRecurso } from '../recurso.ts'

type Dashboard = {
  financeiro: { a_receber: string; recebido: string; vencido: string; a_vencer: string; previsto_30_dias: string; recebido_mes: string }
  contagens: { clientes: string; casos: string; casos_ativos: string; parcelas_vencidas: string }
  advogado: { recebido: string; a_receber: string; vencido: string; nome: string | null }
  caixa: { saldo: number; contas: number }
  previsao: { dias: number; a_receber: string; a_pagar: string; repasses: string; saldo_previsto: number }[]
  alertas: {
    parcelas_atrasadas: string; parcelas_atrasadas_valor: string; repasses_parados: string
    repasses_parados_valor: string; contas_vencidas: string; contas_vencidas_valor: string
    dias_atraso: number; dias_repasse: number; contas_negativas: { id: string; nome: string; saldo: string }[]
  }
  meses: { mes: string; recebido: string; previsto: string }[]
  proximos: {
    id: string; cliente_id: string; cliente_nome: string; conta_descricao: string; caso_titulo: string | null
    numero: number; total_parcelas: number; entrada: boolean
    valor: string; valor_pago: string; restante: string; vencimento: string; situacao: string; dias_para_vencimento: number
  }[]
}

const { dados, carregando, erro, recarregar } = useRecurso(() => api.get<Dashboard>('/dashboard'))
onMounted(recarregar)

type Alerta = { tom: 'erro' | 'alerta'; texto: string; para: string; acao: string }

const alertas = computed<Alerta[]>(() => {
  const d = dados.value
  if (!d) return []
  const a = d.alertas
  const lista: Alerta[] = []
  if (Number(a.parcelas_atrasadas) > 0) {
    lista.push({
      tom: 'erro',
      texto: `${a.parcelas_atrasadas} parcela(s) vencida(s) há mais de ${a.dias_atraso} dias, somando ${moeda(a.parcelas_atrasadas_valor)}`,
      para: '/caixa?aba=aberto',
      acao: 'Cobrar',
    })
  }
  const recentes = Number(d.contagens.parcelas_vencidas) - Number(a.parcelas_atrasadas)
  if (recentes > 0) {
    lista.push({
      tom: 'alerta',
      texto: `${recentes} parcela(s) vencida(s) nos últimos ${a.dias_atraso} dias`,
      para: '/caixa?aba=aberto',
      acao: 'Ver',
    })
  }
  if (Number(a.contas_vencidas) > 0) {
    lista.push({
      tom: 'erro',
      texto: `${a.contas_vencidas} conta(s) programada(s) vencida(s) sem baixa, somando ${moeda(a.contas_vencidas_valor)}`,
      para: '/caixa?aba=aberto',
      acao: 'Pagar',
    })
  }
  if (Number(a.repasses_parados) > 0) {
    lista.push({
      tom: 'alerta',
      texto: `${a.repasses_parados} repasse(s) esperando há mais de ${a.dias_repasse} dias, somando ${moeda(a.repasses_parados_valor)}`,
      para: '/repasses',
      acao: 'Pagar',
    })
  }
  for (const c of a.contas_negativas) {
    lista.push({ tom: 'erro', texto: `${c.nome} está com saldo negativo: ${moeda(c.saldo)}`, para: '/caixa', acao: 'Ver' })
  }
  return lista
})

const linhasPrevisao = computed(() => {
  const p = dados.value?.previsao ?? []
  return [
    { rotulo: 'A receber de clientes', sinal: '+', valores: p.map((h) => Number(h.a_receber)), classe: 'entrada' },
    { rotulo: 'Contas programadas a pagar', sinal: '−', valores: p.map((h) => Number(h.a_pagar)), classe: 'saida' },
    { rotulo: 'Repasses a pagar', sinal: '−', valores: p.map((h) => Number(h.repasses)), classe: 'saida' },
  ]
})
</script>

<template>
  <div class="topo">
    <div>
      <h1>Dashboard</h1>
      <p>Situação financeira consolidada do escritório.</p>
    </div>
    <RouterLink class="botao" to="/caixa"><Icone nome="caixa" /> Abrir o caixa</RouterLink>
  </div>

  <Estado :carregando="carregando" :erro="erro" @repetir="recarregar">
    <template v-if="dados">
      <section class="painel alertas" aria-label="Alertas">
        <header>
          <div>
            <h2>Atenção</h2>
            <p>O que precisa de ação hoje.</p>
          </div>
          <span v-if="alertas.length" class="selo vencida">{{ alertas.length }} alerta(s)</span>
        </header>
        <ul v-if="alertas.length" class="lista-alertas">
          <li v-for="alerta in alertas" :key="alerta.texto" :class="alerta.tom">
            <Icone nome="alerta" />
            <span>{{ alerta.texto }}</span>
            <RouterLink class="botao pequeno" :to="alerta.para">{{ alerta.acao }}</RouterLink>
          </li>
        </ul>
        <p v-else class="sem-alertas"><Icone nome="confirmar" /> Nenhum alerta. Cobranças, contas e repasses em dia.</p>
      </section>

      <section class="cartoes">
        <Cartao
          rotulo="Total a receber"
          :valor="moeda(dados.financeiro.a_receber)"
          icone="grafico"
          :nota="`${moeda(dados.financeiro.a_vencer)} a vencer`"
        />
        <Cartao
          rotulo="Total recebido"
          :valor="moeda(dados.financeiro.recebido)"
          tom="sucesso"
          icone="confirmar"
          :nota="`${moeda(dados.financeiro.recebido_mes)} neste mês`"
        />
        <Cartao
          rotulo="Total vencido"
          :valor="moeda(dados.financeiro.vencido)"
          icone="alerta"
          :tom="Number(dados.financeiro.vencido) > 0 ? 'erro' : undefined"
          :nota="`${dados.contagens.parcelas_vencidas} parcela(s) em atraso`"
        />
        <Cartao
          rotulo="Previsto em 30 dias"
          :valor="moeda(dados.financeiro.previsto_30_dias)"
          icone="relogio"
          nota="Parcelas com vencimento no período"
        />
      </section>

      <section class="cartoes">
        <Cartao
          rotulo="Meu caixa — a receber"
          :valor="moeda(dados.advogado.a_receber)"
          tom="acao"
          icone="caixa"
          destaque
        >
          <template #nota>
            {{ dados.advogado.nome ?? 'Defina o advogado principal' }} ·
            <RouterLink to="/caixa">ver detalhes</RouterLink>
          </template>
        </Cartao>
        <Cartao
          rotulo="Meu caixa — recebido"
          :valor="moeda(dados.advogado.recebido)"
          icone="caixa"
          nota="O que entrou menos os repasses"
        />
        <Cartao
          rotulo="Saldo em caixa"
          :valor="moeda(dados.caixa.saldo)"
          icone="banco"
          :tom="dados.caixa.saldo < 0 ? 'erro' : undefined"
        >
          <template #nota>
            <RouterLink v-if="dados.caixa.contas" to="/caixa">Bancos e dinheiro · ver no caixa</RouterLink>
            <RouterLink v-else to="/configuracoes?aba=bancos">cadastrar bancos</RouterLink>
          </template>
        </Cartao>
        <Cartao
          rotulo="Casos"
          :valor="String(dados.contagens.casos)"
          icone="casos"
          :nota="`${dados.contagens.casos_ativos} ativo(s)`"
        />
      </section>

      <section class="painel">
        <header>
          <div>
            <h2>Previsão de caixa</h2>
            <p>Saldo de hoje mais o que vence para receber, menos o que vence para pagar.</p>
          </div>
        </header>
        <table class="tabela-previsao">
          <thead>
            <tr>
              <th></th>
              <th v-for="h in dados.previsao" :key="h.dias" class="num">Em {{ h.dias }} dias</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Saldo em caixa hoje</th>
              <td v-for="h in dados.previsao" :key="h.dias" class="dinheiro">{{ moeda(dados.caixa.saldo) }}</td>
            </tr>
            <tr v-for="linha in linhasPrevisao" :key="linha.rotulo">
              <th scope="row">{{ linha.sinal }} {{ linha.rotulo }}</th>
              <td v-for="(valor, i) in linha.valores" :key="i" class="dinheiro" :class="linha.classe">{{ moeda(valor) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">= Saldo previsto</th>
              <td
                v-for="h in dados.previsao"
                :key="h.dias"
                class="dinheiro"
                :class="h.saldo_previsto < 0 ? 'saida' : 'entrada'"
              >
                {{ moeda(h.saldo_previsto) }}
              </td>
            </tr>
          </tfoot>
        </table>
        <p v-if="Number(dados.financeiro.vencido) > 0" class="nota-previsao">
          Parcelas já vencidas ({{ moeda(dados.financeiro.vencido) }}) não entram na previsão: só contam quando o cliente pagar.
        </p>
      </section>

      <section class="painel">
        <header>
          <div>
            <h2>Recebimentos por mês</h2>
            <p>Dois meses anteriores, o mês atual e os próximos três.</p>
          </div>
        </header>
        <Grafico :meses="dados.meses" />
      </section>

      <section class="painel">
        <header>
          <h2>Próximos recebimentos</h2>
          <RouterLink class="botao pequeno" to="/caixa">Ver no caixa</RouterLink>
        </header>
        <p v-if="!dados.proximos.length" class="estado">Nenhum recebimento pendente.</p>
        <table v-else>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Origem</th>
              <th>Vencimento</th>
              <th class="num">Valor</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="parcela in dados.proximos" :key="parcela.id" :class="`linha-${parcela.situacao}`">
              <td>
                <RouterLink :to="`/clientes/${parcela.cliente_id}`">{{ parcela.cliente_nome }}</RouterLink>
              </td>
              <td class="fraco">
                {{ parcela.caso_titulo ?? parcela.conta_descricao }}
                <span v-if="parcela.entrada"> · entrada</span>
                <span v-else-if="parcela.total_parcelas > 1"> · {{ parcela.numero }}/{{ parcela.total_parcelas }}</span>
              </td>
              <td>
                {{ data(parcela.vencimento) }}
                <span class="fraco"> · {{ prazo(parcela.dias_para_vencimento) }}</span>
              </td>
              <td class="dinheiro">
                {{ moeda(parcela.restante) }}
                <div v-if="Number(parcela.valor_pago) > 0" class="sub-celula">de {{ moeda(parcela.valor) }}</div>
              </td>
              <td><Selo :situacao="parcela.situacao" /></td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </Estado>
</template>

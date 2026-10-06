<script setup lang="ts">
import { onMounted } from 'vue'
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
  meses: { mes: string; recebido: string; previsto: string }[]
  proximos: {
    id: string; cliente_id: string; cliente_nome: string; conta_descricao: string; caso_titulo: string | null
    numero: number; total_parcelas: number; entrada: boolean
    valor: string; valor_pago: string; restante: string; vencimento: string; situacao: string; dias_para_vencimento: number
  }[]
}

const { dados, carregando, erro, recarregar } = useRecurso(() => api.get<Dashboard>('/dashboard'))
onMounted(recarregar)
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
      <RouterLink
        v-if="Number(dados.contagens.parcelas_vencidas) > 0"
        class="aviso"
        to="/caixa?situacao=vencida"
        style="color: inherit"
      >
        <Icone nome="alerta" />
        <span>
          <strong>{{ dados.contagens.parcelas_vencidas }} parcela(s) vencida(s)</strong>
          somando {{ moeda(dados.financeiro.vencido) }} — clientes que precisam ser cobrados.
        </span>
      </RouterLink>

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

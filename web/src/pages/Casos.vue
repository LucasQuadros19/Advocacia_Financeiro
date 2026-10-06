<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ColunaOrdem from '../components/ColunaOrdem.vue'
import Estado from '../components/Estado.vue'
import Icone from '../components/Icone.vue'
import Paginacao from '../components/Paginacao.vue'
import { api, type Pagina } from '../api.ts'
import { moeda, rotuloSituacao } from '../format.ts'
import { useOrdenacao } from '../ordenacao.ts'
import { useRecurso, watchDebounced } from '../recurso.ts'

type Caso = {
  id: string; titulo: string; status: string; valor: string; cliente_id: string; cliente_nome: string
  recebido: string; pendente: string; percentual_principal: string; qtd_advogados: string
}

const router = useRouter()
const busca = ref('')
const status = ref('')
const pagina = ref(1)

const { dados, carregando, erro, recarregar } = useRecurso(() =>
  api.get<Pagina<Caso>>(
    `/casos?pagina=${pagina.value}&limite=20&busca=${encodeURIComponent(busca.value)}` +
      `${status.value ? `&status=${status.value}` : ''}${query()}`,
  ),
)
const { ordem, ordenar, query } = useOrdenacao(() => (pagina.value === 1 ? recarregar() : (pagina.value = 1)))

watchDebounced(() => busca.value, () => {
  pagina.value = 1
  recarregar()
})
watch([status, pagina], recarregar)
onMounted(recarregar)

</script>

<template>
  <div class="topo">
    <div>
      <h1>Casos</h1>
      <p>Casos jurídicos, valores recebidos e participação dos advogados.</p>
    </div>
    <RouterLink class="botao primario" to="/casos/novo"><Icone nome="mais" /> Novo caso</RouterLink>
  </div>

  <section class="painel">
    <header>
      <div class="filtros">
        <div class="busca">
          <Icone nome="busca" />
          <input v-model="busca" type="search" placeholder="Buscar por título" aria-label="Buscar casos" />
        </div>
        <div class="campo">
          <label for="status">Status</label>
          <select id="status" v-model="status">
            <option value="">Todos</option>
            <option value="ativo">Ativo</option>
            <option value="encerrado">Encerrado</option>
            <option value="arquivado">Arquivado</option>
          </select>
        </div>
      </div>
    </header>

    <Estado
      :carregando="carregando"
      :erro="erro"
      :vazio="!dados?.dados.length"
      :mensagem="busca || status ? 'Nenhum caso encontrado para esses filtros.' : 'Nenhum caso cadastrado ainda.'"
      icone="casos"
      @repetir="recarregar"
    >
      <template #acao>
        <RouterLink v-if="!busca && !status" class="botao primario" to="/casos/novo">
          <Icone nome="mais" /> Cadastrar caso
        </RouterLink>
      </template>
      <table v-if="dados">
        <thead>
          <tr>
            <ColunaOrdem campo="titulo" :ordem="ordem" @ordenar="ordenar">Caso</ColunaOrdem>
            <ColunaOrdem campo="cliente" :ordem="ordem" @ordenar="ordenar">Cliente</ColunaOrdem>
            <ColunaOrdem campo="status" :ordem="ordem" @ordenar="ordenar">Status</ColunaOrdem>
            <ColunaOrdem campo="valor" num :ordem="ordem" @ordenar="ordenar">Valor</ColunaOrdem>
            <ColunaOrdem campo="recebido" num :ordem="ordem" @ordenar="ordenar">Recebido</ColunaOrdem>
            <ColunaOrdem campo="pendente" num :ordem="ordem" @ordenar="ordenar">Pendente</ColunaOrdem>
            <ColunaOrdem campo="minha_parte" num :ordem="ordem" @ordenar="ordenar">Minha parte</ColunaOrdem>
          </tr>
        </thead>
        <tbody>
          <tr v-for="caso in dados.dados" :key="caso.id" class="clicavel" @click="router.push(`/casos/${caso.id}`)">
            <td>
              <RouterLink class="titulo-celula" :to="`/casos/${caso.id}`" @click.stop>{{ caso.titulo }}</RouterLink>
              <div class="sub-celula">
                {{ Number(caso.qtd_advogados) ? `Dividido com ${caso.qtd_advogados} advogado(s)` : 'Só o advogado principal' }}
              </div>
            </td>
            <td>
              <RouterLink :to="`/clientes/${caso.cliente_id}`" class="fraco" @click.stop>{{ caso.cliente_nome }}</RouterLink>
            </td>
            <td><span class="selo">{{ rotuloSituacao[caso.status] ?? caso.status }}</span></td>
            <td class="dinheiro">{{ moeda(caso.valor) }}</td>
            <td class="dinheiro">{{ moeda(caso.recebido) }}</td>
            <td class="dinheiro">{{ moeda(caso.pendente) }}</td>
            <td class="num"><span class="selo acao">{{ Number(caso.percentual_principal) }}%</span></td>
          </tr>
        </tbody>
      </table>
      <Paginacao v-if="dados" :pagina="dados.pagina" :paginas="dados.paginas" :total="dados.total" @mudar="pagina = $event" />
    </Estado>
  </section>

</template>

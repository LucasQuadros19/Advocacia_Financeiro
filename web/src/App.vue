<script setup lang="ts">
import { useRoute } from 'vue-router'
import Avisos from './components/Avisos.vue'
import BuscaGeral from './components/BuscaGeral.vue'
import Icone from './components/Icone.vue'
import { api } from './api.ts'
import { iniciais } from './format.ts'
import { router } from './router.ts'
import { usuario } from './sessao.ts'

const rota = useRoute()

const grupos = [
  {
    titulo: 'Visão geral',
    itens: [
      { para: '/', rotulo: 'Dashboard', icone: 'painel' },
      { para: '/caixa', rotulo: 'Caixa', icone: 'caixa' },
      { para: '/historico', rotulo: 'Histórico mensal', icone: 'historico' },
      { para: '/contas-programadas', rotulo: 'Contas programadas', icone: 'relogio' },
      { para: '/repasses', rotulo: 'Repasses', icone: 'repasses' },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { para: '/clientes', rotulo: 'Clientes', icone: 'clientes' },
      { para: '/casos', rotulo: 'Casos', icone: 'casos' },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      { para: '/auditoria', rotulo: 'Auditoria', icone: 'escudo' },
      { para: '/configuracoes', rotulo: 'Configurações', icone: 'configuracoes' },
    ],
  },
]

const hojeExtenso = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
})

const ativo = (para: string) => (para === '/' ? rota.path === '/' : rota.path.startsWith(para))

async function sair() {
  await api.post('/auth/logout').catch(() => {})
  usuario.value = null
  router.push('/login')
}
</script>

<template>
  <RouterView v-if="rota.meta.publica || rota.meta.impressao" />
  <div v-else class="app">
    <aside class="lateral">
      <div class="marca">
        <span class="simbolo"><Icone nome="advogados" :tamanho="19" /></span>
        <div>
          <strong>Financeiro</strong>
          <span>Escritório de advocacia</span>
        </div>
      </div>
      <RouterLink class="botao primario acao-principal" to="/casos/novo">
        <Icone nome="mais" /> Novo caso
      </RouterLink>
      <nav>
        <template v-for="grupo in grupos" :key="grupo.titulo">
          <span class="grupo">{{ grupo.titulo }}</span>
          <RouterLink v-for="item in grupo.itens" :key="item.para" :to="item.para" :class="{ ativo: ativo(item.para) }">
            <Icone :nome="item.icone" />
            {{ item.rotulo }}
          </RouterLink>
        </template>
      </nav>
    </aside>
    <main class="conteudo">
      <header class="barra-topo">
        <BuscaGeral />
        <div class="barra-topo-direita">
          <span class="data-hoje">{{ hojeExtenso }}</span>
          <div v-if="usuario" class="quem">
            <span class="inicial">{{ iniciais(usuario.nome) }}</span>
            <div>
              <strong>{{ usuario.nome }}</strong>
              <span>@{{ usuario.login }}</span>
            </div>
          </div>
          <button class="botao pequeno" @click="sair"><Icone nome="sair" /> Sair</button>
        </div>
      </header>
      <RouterView />
    </main>
  </div>
  <Avisos />
</template>

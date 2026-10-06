import { createRouter, createWebHistory } from 'vue-router'
import { carregarSessao, usuario } from './sessao.ts'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./pages/Login.vue'), meta: { publica: true } },
    { path: '/', name: 'dashboard', component: () => import('./pages/Dashboard.vue') },
    { path: '/clientes', name: 'clientes', component: () => import('./pages/Clientes.vue') },
    { path: '/clientes/:id', name: 'cliente', component: () => import('./pages/ClienteDetalhe.vue') },
    { path: '/casos', name: 'casos', component: () => import('./pages/Casos.vue') },
    { path: '/casos/novo', name: 'caso-novo', component: () => import('./pages/CasoNovo.vue') },
    { path: '/casos/:id', name: 'caso', component: () => import('./pages/CasoDetalhe.vue') },
    { path: '/caixa', name: 'caixa', component: () => import('./pages/Caixa.vue') },
    { path: '/historico', name: 'historico', component: () => import('./pages/Historico.vue') },
    { path: '/auditoria', name: 'auditoria', component: () => import('./pages/Auditoria.vue') },
    {
      path: '/contas-programadas',
      name: 'contas-programadas',
      component: () => import('./pages/ContasProgramadas.vue'),
    },
    { path: '/configuracoes', name: 'configuracoes', component: () => import('./pages/Configuracoes.vue') },
    { path: '/repasses', name: 'repasses', component: () => import('./pages/Repasses.vue') },
    {
      path: '/imprimir/recibo/:origem(recebimento|manual)/:id',
      name: 'imprimir-recibo',
      component: () => import('./pages/ImprimirRecibo.vue'),
      meta: { impressao: true },
    },
    {
      path: '/imprimir/parcelamento/:id',
      name: 'imprimir-parcelamento',
      component: () => import('./pages/ImprimirParcelamento.vue'),
      meta: { impressao: true },
    },
    { path: '/advogados', redirect: '/configuracoes' },
    { path: '/recebimentos', redirect: '/caixa' },
    { path: '/despesas', redirect: '/contas-programadas' },
    { path: '/:resto(.*)', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (destino) => {
  if (destino.meta.publica || usuario.value || (await carregarSessao())) return true
  return { name: 'login', query: { de: destino.fullPath } }
})

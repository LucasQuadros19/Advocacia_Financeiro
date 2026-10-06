<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import Aviso from './Aviso.vue'
import Estado from './Estado.vue'
import Icone from './Icone.vue'
import Paginacao from './Paginacao.vue'
import { api, type Pagina } from '../api.ts'
import { avisar, confirmar } from '../avisos.ts'
import { dataHora, iniciais } from '../format.ts'
import { useRecurso } from '../recurso.ts'
import { usuario } from '../sessao.ts'

type Nota = {
  id: string; autor: string; texto: string; criado_em: string; editado_em: string | null
  cliente_id: string | null; caso_id: string | null
}
type Escopo = 'todas' | 'caso' | 'cliente'

const props = defineProps<{ clienteId?: string; casoId?: string; clienteNome?: string; descricao?: string }>()

const noCaso = computed(() => Boolean(props.clienteId && props.casoId))
const escopo = ref<Escopo>(noCaso.value ? 'todas' : 'cliente')
const destino = ref<'caso' | 'cliente'>('caso')
const pagina = ref(1)

const filtro = computed(() => {
  if (!noCaso.value) return `cliente_id=${props.clienteId}`
  if (escopo.value === 'todas') return `caso_id=${props.casoId}&com_cliente=true`
  return escopo.value === 'cliente' ? `cliente_id=${props.clienteId}` : `caso_id=${props.casoId}`
})

const notas = useRecurso(() => api.get<Pagina<Nota>>(`/notas?${filtro.value}&pagina=${pagina.value}&limite=20`))

watch(pagina, notas.recarregar)
watch(escopo, (novo) => {
  if (novo !== 'todas') destino.value = novo
  pagina.value === 1 ? notas.recarregar() : (pagina.value = 1)
})
onMounted(notas.recarregar)

const ESCOPOS: { valor: Escopo; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'caso', rotulo: 'Deste caso' },
  { valor: 'cliente', rotulo: 'Do cliente' },
]

const salvarNoCliente = computed(() => !noCaso.value || destino.value === 'cliente')
const texto = ref('')
const enviando = ref(false)
const erroEnvio = ref('')

async function adicionar() {
  const conteudo = texto.value.trim()
  if (!conteudo) return
  enviando.value = true
  erroEnvio.value = ''
  try {
    await api.post('/notas', {
      cliente_id: salvarNoCliente.value ? props.clienteId : undefined,
      caso_id: salvarNoCliente.value ? undefined : props.casoId,
      texto: conteudo,
    })
    texto.value = ''
    if (escopo.value !== 'todas' && escopo.value !== destino.value) escopo.value = destino.value
    else if (pagina.value !== 1) pagina.value = 1
    else await notas.recarregar()
  } catch (e) {
    erroEnvio.value = (e as Error).message
  } finally {
    enviando.value = false
  }
}

const editando = ref<string>()
const textoEdicao = ref('')
const salvandoEdicao = ref(false)

async function editar(nota: Nota) {
  editando.value = nota.id
  textoEdicao.value = nota.texto
  await nextTick()
  document.getElementById(`editar-nota-${nota.id}`)?.focus()
}

async function salvarEdicao(nota: Nota) {
  const conteudo = textoEdicao.value.trim()
  if (!conteudo) return
  if (conteudo === nota.texto) return (editando.value = undefined)
  salvandoEdicao.value = true
  try {
    await api.put(`/notas/${nota.id}`, { texto: conteudo })
    editando.value = undefined
    avisar('Nota atualizada.')
    await notas.recarregar()
  } catch (e) {
    avisar((e as Error).message, 'erro')
  } finally {
    salvandoEdicao.value = false
  }
}

async function excluir(nota: Nota) {
  const ok = await confirmar('Excluir nota', 'A nota será removida do histórico. Esta ação não pode ser desfeita.', {
    confirmar: 'Excluir',
    perigo: true,
  })
  if (!ok) return
  try {
    await api.delete(`/notas/${nota.id}`)
    avisar('Nota excluída.')
    await notas.recarregar()
  } catch (e) {
    avisar((e as Error).message, 'erro')
  }
}

const mensagemVazia = computed(() =>
  !noCaso.value
    ? 'Nenhuma nota ainda. A primeira aparece aqui.'
    : escopo.value === 'cliente'
    ? 'Este cliente ainda não tem notas gerais.'
    : escopo.value === 'caso'
      ? 'Este caso ainda não tem notas próprias.'
      : 'Nenhuma nota ainda. A primeira aparece aqui.',
)
</script>

<template>
  <section class="painel">
    <header>
      <div>
        <h2>Notas</h2>
        <p v-if="noCaso">
          As do caso e as gerais de {{ clienteNome ?? 'cliente' }} juntas, da mais recente para a mais antiga.
        </p>
        <p v-else>{{ descricao ?? 'Histórico de anotações, da mais recente para a mais antiga.' }}</p>
      </div>
      <div v-if="noCaso" class="segmentado" role="group" aria-label="Quais notas mostrar">
        <button
          v-for="e in ESCOPOS"
          :key="e.valor"
          type="button"
          :class="{ ativo: escopo === e.valor }"
          :aria-pressed="escopo === e.valor"
          @click="escopo = e.valor"
        >
          {{ e.rotulo }}
        </button>
      </div>
    </header>

    <form class="compositor" @submit.prevent="adicionar">
      <label class="rotulo-campo" for="nova-nota">Escrever uma nota</label>
      <textarea
        id="nova-nota"
        v-model="texto"
        maxlength="4000"
        :placeholder="
          salvarNoCliente
            ? 'Vale para o cliente todo. Ex.: prefere contato por WhatsApp à tarde.'
            : 'Vale só para este caso. Ex.: audiência remarcada para sexta.'
        "
        @keydown.ctrl.enter="adicionar"
        @keydown.meta.enter="adicionar"
      />
      <div class="rodape-compositor">
        <div class="destino-nota">
          <template v-if="noCaso">
            <span class="dica">Guardar em</span>
            <div class="segmentado pequeno" role="radiogroup" aria-label="Onde guardar a nota">
              <button
                type="button"
                role="radio"
                :aria-checked="destino === 'caso'"
                :class="{ ativo: destino === 'caso' }"
                @click="destino = 'caso'"
              >
                Este caso
              </button>
              <button
                type="button"
                role="radio"
                :aria-checked="destino === 'cliente'"
                :class="{ ativo: destino === 'cliente' }"
                @click="destino = 'cliente'"
              >
                Cliente (todos os casos)
              </button>
            </div>
          </template>
          <span class="dica">Assinada como <strong>{{ usuario?.nome }}</strong> · Ctrl + Enter envia</span>
        </div>
        <button type="submit" class="botao primario" :disabled="enviando || !texto.trim()">
          <Icone nome="confirmar" /> {{ enviando ? 'Salvando…' : 'Adicionar nota' }}
        </button>
      </div>
      <Aviso :texto="erroEnvio" style="margin: 12px 0 0" />
    </form>

    <Estado
      :carregando="notas.carregando.value"
      :erro="notas.erro.value"
      :vazio="!notas.dados.value?.dados.length"
      icone="casos"
      :mensagem="mensagemVazia"
      @repetir="notas.recarregar"
    >
      <ol v-if="notas.dados.value" class="notas">
        <li
          v-for="nota in notas.dados.value.dados"
          :key="nota.id"
          class="item-nota"
          :class="{ 'do-cliente': noCaso && nota.cliente_id }"
        >
          <span class="inicial">{{ iniciais(nota.autor) }}</span>
          <div class="balao">
            <div class="cabecalho-nota">
              <strong>{{ nota.autor }}</strong>
              <span v-if="noCaso" class="selo" :class="{ acao: nota.cliente_id }">
                {{ nota.cliente_id ? 'Do cliente' : 'Do caso' }}
              </span>
              <time :datetime="nota.criado_em">{{ dataHora(nota.criado_em) }}</time>
              <span v-if="nota.editado_em" class="editada" :title="`Editada ${dataHora(nota.editado_em)}`">· editada</span>
              <span class="acoes-nota">
                <button
                  v-if="editando !== nota.id"
                  type="button"
                  class="botao icone"
                  aria-label="Editar nota"
                  title="Editar nota"
                  @click="editar(nota)"
                >
                  <Icone nome="editar" />
                </button>
                <button type="button" class="botao icone" aria-label="Excluir nota" title="Excluir nota" @click="excluir(nota)">
                  <Icone nome="excluir" />
                </button>
              </span>
            </div>
            <form v-if="editando === nota.id" class="edicao-nota" @submit.prevent="salvarEdicao(nota)">
              <label class="sr" :for="`editar-nota-${nota.id}`">Texto da nota</label>
              <textarea
                :id="`editar-nota-${nota.id}`"
                v-model="textoEdicao"
                maxlength="4000"
                @keydown.ctrl.enter="salvarEdicao(nota)"
                @keydown.meta.enter="salvarEdicao(nota)"
                @keydown.esc="editando = undefined"
              />
              <div class="acoes">
                <button type="button" class="botao pequeno" @click="editando = undefined">Cancelar</button>
                <button type="submit" class="botao pequeno primario" :disabled="salvandoEdicao || !textoEdicao.trim()">
                  {{ salvandoEdicao ? 'Salvando…' : 'Salvar' }}
                </button>
              </div>
            </form>
            <p v-else>{{ nota.texto }}</p>
          </div>
        </li>
      </ol>
      <Paginacao
        v-if="notas.dados.value && notas.dados.value.paginas > 1"
        :pagina="notas.dados.value.pagina"
        :paginas="notas.dados.value.paginas"
        :total="notas.dados.value.total"
        @mudar="pagina = $event"
      />
    </Estado>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import Icone from './Icone.vue'
import { parteDe, restante, restanteEmDinheiro, type Repasse } from '../distribuicao.ts'
import { moeda, percentual as formatarPercentual } from '../format.ts'

const props = withDefaults(
  defineProps<{
    advogados: { id: string; nome: string; principal: boolean }[]
    valor?: number
    id?: string
  }>(),
  { valor: 0, id: 'divisao' },
)
const linhas = defineModel<Repasse[]>({ required: true })

const PRESETS = [50, 40, 30, 20, 10]

const principal = computed(() => props.advogados.find((a) => a.principal))
const disponiveis = computed(() =>
  props.advogados.filter((a) => !a.principal && !linhas.value.some((r) => r.advogado_id === a.id)),
)
const sobra = computed(() => restante(linhas.value))
const nomeDe = (id: string) => props.advogados.find((a) => a.id === id)?.nome ?? 'Advogado'
const campo = (advogadoId: string) => `${props.id}-${advogadoId}`

async function adicionar(evento: Event) {
  const alvo = evento.target as HTMLSelectElement
  const id = alvo.value
  alvo.value = ''
  if (!id) return
  linhas.value = [...linhas.value, { advogado_id: id, percentual: Math.min(50, Math.max(sobra.value, 0)) }]
  await nextTick()
  const entrada = document.getElementById(campo(id)) as HTMLInputElement | null
  entrada?.focus()
  entrada?.select()
}

const remover = (i: number) => (linhas.value = linhas.value.filter((_, x) => x !== i))

function definir(i: number, percentual: number) {
  const valor = Math.min(Math.max(percentual || 0, 0), 100)
  linhas.value = linhas.value.map((r, x) => (x === i ? { ...r, percentual: valor } : r))
}
</script>

<template>
  <div class="divisao">
    <div class="linha-repasse linha-principal">
      <div>
        <div class="titulo-celula">
          {{ principal?.nome ?? 'Advogado principal' }} <span class="selo">Principal</span>
        </div>
        <div class="sub-celula">
          {{ linhas.length ? 'Fica com o que sobra da divisão' : 'Fica com tudo' }}
          <template v-if="valor > 0"> · {{ moeda(Math.max(restanteEmDinheiro(valor, linhas), 0)) }}</template>
        </div>
      </div>
      <strong class="percentual-principal">{{ formatarPercentual(Math.max(sobra, 0)) }}</strong>
    </div>

    <div v-for="(linha, i) in linhas" :key="linha.advogado_id" class="linha-repasse">
      <div>
        <div class="titulo-celula">{{ nomeDe(linha.advogado_id) }}</div>
        <div class="sub-celula">
          {{ valor > 0 ? `Recebe ${moeda(parteDe(valor, linha.percentual))}` : 'Parte deste advogado' }}
        </div>
      </div>
      <div class="atalhos-percentual" role="group" :aria-label="`Atalhos de percentual para ${nomeDe(linha.advogado_id)}`">
        <button
          v-for="preset in PRESETS"
          :key="preset"
          type="button"
          class="botao pequeno"
          :class="{ primario: Number(linha.percentual) === preset }"
          @click="definir(i, preset)"
        >
          {{ preset }}%
        </button>
      </div>
      <div class="entrada-percentual">
        <input
          :id="campo(linha.advogado_id)"
          type="number"
          min="0"
          max="100"
          step="0.01"
          inputmode="decimal"
          :value="linha.percentual"
          :aria-label="`Percentual de ${nomeDe(linha.advogado_id)}`"
          @input="definir(i, Number(($event.target as HTMLInputElement).value))"
        />
        <span>%</span>
      </div>
      <button type="button" class="botao icone" :aria-label="`Remover ${nomeDe(linha.advogado_id)}`" @click="remover(i)">
        <Icone nome="fechar" />
      </button>
    </div>

    <div v-if="disponiveis.length" class="campo adicionar-divisao">
      <label :for="`${id}-adicionar`">{{ linhas.length ? 'Dividir com mais um advogado' : 'Dividir com outro advogado' }}</label>
      <select :id="`${id}-adicionar`" @change="adicionar">
        <option value="">Escolha o advogado…</option>
        <option v-for="a in disponiveis" :key="a.id" :value="a.id">{{ a.nome }}</option>
      </select>
    </div>
    <p v-else-if="!linhas.length" class="fraco adicionar-divisao">
      Nenhum outro advogado cadastrado.
      <RouterLink to="/configuracoes">Cadastre em Configurações</RouterLink> para dividir.
    </p>

    <p v-if="!principal" class="aviso alerta">
      <Icone nome="alerta" />
      <span>
        Nenhum advogado principal definido.
        <RouterLink to="/configuracoes">Defina em Configurações</RouterLink> quem fica com o restante.
      </span>
    </p>
    <p v-if="sobra < 0" class="aviso" role="alert">
      <Icone nome="alerta" /> A divisão passou de 100% em {{ formatarPercentual(-sobra) }}. Diminua algum percentual.
    </p>
  </div>
</template>

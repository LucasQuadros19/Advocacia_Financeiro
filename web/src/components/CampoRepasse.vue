<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icone from './Icone.vue'
import { moeda } from '../format.ts'

export type Repasse = { advogado_id: string; percentual: number }

const props = defineProps<{
  valor: number
  advogados: { id: string; nome: string; principal: boolean }[]
  sugestao?: Repasse[]
}>()
const linhas = defineModel<Repasse[]>({ required: true })

const PRESETS = [50, 40, 30, 25, 20, 10]

const outros = computed(() => props.advogados.filter((a) => !a.principal))
const aberto = ref(false)

watch(
  () => props.sugestao,
  (sugestao) => {
    if (!sugestao?.length) return
    linhas.value = sugestao.map((r) => ({ ...r }))
    aberto.value = true
  },
  { immediate: true },
)

const disponiveis = computed(() => outros.value.filter((a) => !linhas.value.some((r) => r.advogado_id === a.id)))
const total = computed(() => Math.round(linhas.value.reduce((s, r) => s + (Number(r.percentual) || 0), 0) * 100) / 100)
const excedeu = computed(() => total.value > 100)
const parteDe = (percentual: number) => Math.round(props.valor * (Number(percentual) || 0)) / 100
const meuResto = computed(() => props.valor - linhas.value.reduce((s, r) => s + parteDe(r.percentual), 0))
const nomeDe = (id: string) => outros.value.find((a) => a.id === id)?.nome ?? ''

function adicionar(evento: Event) {
  const alvo = evento.target as HTMLSelectElement
  const id = alvo.value
  alvo.value = ''
  if (id) linhas.value = [...linhas.value, { advogado_id: id, percentual: 50 }]
}

const remover = (i: number) => (linhas.value = linhas.value.filter((_, x) => x !== i))

function definir(i: number, percentual: number) {
  const valor = Math.min(Math.max(percentual, 0), 100)
  linhas.value = linhas.value.map((r, x) => (x === i ? { ...r, percentual: valor } : r))
}

defineExpose({ excedeu })
</script>

<template>
  <details class="recolhivel repasse" :open="aberto" @toggle="aberto = ($event.target as HTMLDetailsElement).open">
    <summary>
      <div>
        <strong>
          <Icone nome="advogados" :tamanho="14" />
          {{ linhas.length ? `Repassando ${moeda(valor - meuResto)}` : 'Dividir com outro advogado' }}
        </strong>
        <span class="dica">
          {{
            linhas.length
              ? `Sobram ${moeda(meuResto)} para você`
              : 'Por padrão fica 100% com você. Clique para separar a parte de outro advogado.'
          }}
        </span>
      </div>
      <Icone nome="abrir" class="girar" />
    </summary>
    <div class="corpo">
      <p v-if="valor > 0" class="dica" style="margin-bottom: 12px">
        O caixa recebe os {{ moeda(valor) }} cheios e cada repasse vira uma saída a pagar para o advogado.
      </p>
      <p v-else class="aviso alerta" style="margin: 0 0 12px">
        <Icone nome="alerta" />
        <span>Informe o valor acima para calcular as partes. Você já pode escolher os advogados.</span>
      </p>

      <div v-for="(linha, i) in linhas" :key="linha.advogado_id" class="linha-repasse">
        <div>
          <div class="titulo-celula">{{ nomeDe(linha.advogado_id) }}</div>
          <div class="sub-celula">
            {{ valor > 0 ? `recebe ${moeda(parteDe(linha.percentual))}` : 'aguardando o valor' }}
          </div>
        </div>
        <div class="atalhos-percentual">
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

      <div v-if="disponiveis.length" class="campo" style="margin: 12px 0 0; max-width: 340px">
        <label for="repasse-advogado">Adicionar advogado ao repasse</label>
        <select id="repasse-advogado" @change="adicionar">
          <option value="">Selecione…</option>
          <option v-for="a in disponiveis" :key="a.id" :value="a.id">{{ a.nome }}</option>
        </select>
      </div>
      <p v-else-if="!linhas.length" class="fraco" style="margin: 0">Nenhum outro advogado cadastrado para repassar.</p>

      <div class="rodape-distribuicao" style="margin-top: 12px">
        <span class="total">Repasse: {{ total }}%</span>
        <span v-if="excedeu" class="selo vencida">Passou de 100% do que entrou</span>
        <span v-else-if="linhas.length && valor > 0" class="selo pago">Fica com você: {{ moeda(meuResto) }}</span>
      </div>
    </div>
  </details>
  <p v-if="excedeu" class="aviso" role="alert"><Icone nome="alerta" /> Ajuste os percentuais: o repasse passou de 100%.</p>
</template>

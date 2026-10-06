<script setup lang="ts">
import { computed } from 'vue'
import Icone from './Icone.vue'
import { garantirAutomatico, redistribuir, totalDistribuido, type Participante } from '../distribuicao.ts'
import { moeda, percentual as formatarPercentual } from '../format.ts'

const props = defineProps<{
  modelValue: Participante[]
  advogados: { id: string; nome: string; principal?: boolean }[]
  base?: number
}>()
const emit = defineEmits<{ 'update:modelValue': [Participante[]] }>()

const total = computed(() => totalDistribuido(props.modelValue))
const restante = computed(() => Math.round((100 - total.value) * 100) / 100)
const principal = computed(() => props.advogados.find((a) => a.principal)?.nome ?? 'o advogado principal')
const disponiveis = computed(() => props.advogados.filter((a) => !props.modelValue.some((p) => p.advogado_id === a.id)))

const aplicar = (lista: Participante[]) => emit('update:modelValue', redistribuir(lista))

function definir(indice: number, valor: string) {
  const numero = Math.min(Math.max(Number(valor) || 0, 0), 100)
  aplicar(props.modelValue.map((p, i) => (i === indice ? { ...p, percentual: numero, ajustado: true } : p)))
}

function aoDigitar(indice: number, texto: string) {
  if (texto !== String(Number(texto))) return
  definir(indice, texto)
}

function adicionar(evento: Event) {
  const alvo = evento.target as HTMLSelectElement
  const advogado = props.advogados.find((a) => a.id === alvo.value)
  alvo.value = ''
  if (!advogado) return
  aplicar([...props.modelValue, { advogado_id: advogado.id, nome: advogado.nome, percentual: 0, ajustado: false }])
}

function remover(indice: number) {
  aplicar(garantirAutomatico(props.modelValue.filter((_, i) => i !== indice)))
}

const parte = (valor: number) => ((props.base ?? 0) * valor) / 100
</script>

<template>
  <div>
    <table class="distribuicao">
      <thead>
        <tr>
          <th>Advogado</th>
          <th class="num" style="width: 170px">Percentual</th>
          <th v-if="base !== undefined" class="num" style="width: 180px">Parte do recebido</th>
          <th style="width: 52px"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(participante, indice) in modelValue" :key="participante.advogado_id" :class="{ 'linha-automatica': !participante.ajustado }">
          <td>
            <div class="titulo-celula">{{ participante.nome }}</div>
            <div class="sub-celula">
              <template v-if="!participante.ajustado">Recebe o restante automaticamente</template>
              <template v-else-if="participante.percentual === 0">Sem participação — não será salvo</template>
              <template v-else>Percentual definido manualmente</template>
            </div>
          </td>
          <td>
            <div class="entrada-percentual">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputmode="decimal"
                :value="participante.percentual"
                :aria-label="`Percentual de ${participante.nome}`"
                @input="aoDigitar(indice, ($event.target as HTMLInputElement).value)"
                @change="definir(indice, ($event.target as HTMLInputElement).value)"
              />
              <span>%</span>
            </div>
          </td>
          <td v-if="base !== undefined" class="dinheiro">{{ moeda(parte(participante.percentual)) }}</td>
          <td class="num">
            <button
              type="button"
              class="botao icone"
              :aria-label="`Remover ${participante.nome}`"
              @click="remover(indice)"
            >
              <Icone nome="fechar" />
            </button>
          </td>
        </tr>
        <tr v-if="!modelValue.length">
          <td :colspan="base !== undefined ? 4 : 3" class="fraco" style="padding: 18px">
            Nenhum advogado adicional. O valor do caso pertence integralmente ao advogado principal.
          </td>
        </tr>
      </tbody>
    </table>

    <div class="rodape-distribuicao">
      <span class="total">Total: {{ formatarPercentual(total) }}</span>
      <span v-if="total > 100" class="selo vencida">Excedeu em {{ formatarPercentual(total - 100) }}</span>
      <span v-else-if="total === 100 && modelValue.length" class="selo pago">Distribuição completa</span>
      <span v-else-if="modelValue.length" class="selo parcial">
        {{ formatarPercentual(restante) }} fica com {{ principal }}
      </span>
      <span v-else class="selo">Sem divisão</span>
    </div>

    <div v-if="disponiveis.length" class="corpo" style="padding-top: 16px">
      <div class="campo" style="margin: 0; max-width: 340px">
        <label for="adicionar-advogado">Adicionar advogado ao caso</label>
        <select id="adicionar-advogado" @change="adicionar">
          <option value="">Selecione…</option>
          <option v-for="advogado in disponiveis" :key="advogado.id" :value="advogado.id">
            {{ advogado.nome }}{{ advogado.principal ? ' (principal)' : '' }}
          </option>
        </select>
        <span class="dica">
          O último advogado adicionado assume o restante. Ao digitar um percentual, ele passa a ser fixo.
        </span>
      </div>
    </div>
  </div>
</template>

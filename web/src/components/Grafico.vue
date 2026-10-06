<script setup lang="ts">
import { computed } from 'vue'
import { hoje, moeda } from '../format.ts'

const props = defineProps<{
  meses: { mes: string; recebido: string; previsto: string }[]
  rotulos?: [string, string]
  saidas?: boolean
  destaque?: string
}>()

const maximo = computed(() => {
  const bruto = Math.max(...props.meses.flatMap((m) => [Number(m.recebido), Number(m.previsto)]), 1)
  const escala = 10 ** Math.floor(Math.log10(bruto))
  return Math.ceil(bruto / escala) * escala
})

const referencias = computed(() => [maximo.value, maximo.value / 2, 0])

const altura = (valor: string) => `${Math.max((Number(valor) / maximo.value) * 100, Number(valor) > 0 ? 2 : 0)}%`

const formatadorCompacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const compacto = (valor: number) => formatadorCompacto.format(valor)

const rotulo = (mes: string) =>
  `${new Date(`${mes}-01T00:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '')}/${mes.slice(2, 4)}`

const atual = computed(() => props.destaque ?? hoje().slice(0, 7))
const [rotuloA, rotuloB] = props.rotulos ?? ['Recebido', 'Previsto']
</script>

<template>
  <div class="grafico" :class="{ saidas }">
    <div class="legenda">
      <span><i class="marca-recebido" /> {{ rotuloA }}</span>
      <span><i class="marca-previsto" /> {{ rotuloB }}</span>
    </div>
    <div class="area">
      <div class="eixo">
        <span v-for="valor in referencias" :key="valor">{{ compacto(valor) }}</span>
      </div>
      <div class="plotagem">
        <div class="linhas"><i v-for="valor in referencias" :key="valor" /></div>
        <div class="colunas">
          <div v-for="mes in meses" :key="mes.mes" class="coluna" :class="{ atual: mes.mes === atual }">
            <div class="barras">
              <div
                class="barra recebido"
                :style="{ height: altura(mes.recebido) }"
                :title="`${rotuloA} em ${rotulo(mes.mes)}: ${moeda(mes.recebido)}`"
              />
              <div
                class="barra previsto"
                :style="{ height: altura(mes.previsto) }"
                :title="`${rotuloB} em ${rotulo(mes.mes)}: ${moeda(mes.previsto)}`"
              />
            </div>
            <span class="rotulo">{{ rotulo(mes.mes) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

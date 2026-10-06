<script setup lang="ts">
import { computed } from 'vue'
import { data, dataHora, moeda, percentual, rotuloForma, rotuloSituacao } from '../format.ts'

type Objeto = Record<string, unknown>

const props = defineProps<{ objeto: Objeto; comparar?: Objeto | null; nomes?: Record<string, string> }>()

const ROTULOS: Record<string, string> = {
  descricao: 'Descrição', titulo: 'Título', nome: 'Nome', texto: 'Texto', documento: 'CPF / CNPJ', email: 'E-mail',
  telefone: 'Telefone', oab: 'OAB', cpf: 'CPF', login: 'Usuário', senha: 'Senha', ativo: 'Ativo', ativa: 'Ativa',
  principal: 'Principal', tipo: 'Tipo', categoria: 'Categoria', status: 'Situação', situacao: 'Situação',
  valor: 'Valor', valor_total: 'Valor total', valor_pago: 'Já recebido', restante: 'Falta receber',
  valor_parcela: 'Valor da parcela', entrada: 'Entrada', entrada_paga: 'Entrada já recebida',
  entrada_vencimento: 'Data da entrada', entrada_carteira_id: 'Conta da entrada', quantidade_parcelas: 'Parcelas',
  primeiro_vencimento: '1º vencimento', vencimento: 'Vencimento', vencimento_original: 'Vencimento original',
  competencia: 'Mês de referência', data: 'Data', data_pagamento: 'Data do pagamento',
  forma_pagamento: 'Forma de pagamento', carteira_id: 'Conta', de_carteira_id: 'Saiu de',
  para_carteira_id: 'Entrou em', advogado_id: 'Advogado', percentual: 'Percentual', observacoes: 'Observações',
  numero: 'Nº da parcela', total_parcelas: 'Total de parcelas', dia_vencimento: 'Dia do vencimento',
  inicio: 'Início', fim: 'Fim', saldo_inicial: 'Saldo inicial', conta: 'Cobrança', advogados: 'Divisão do caso',
  repasses: 'Repasses', erro: 'Motivo', conta_descricao: 'Cobrança', cliente_nome: 'Cliente', caso_titulo: 'Caso',
}

const DINHEIRO = /^(valor|valor_total|valor_pago|entrada|saldo_inicial|restante|valor_parcela)$/
const DATA = /^\d{4}-\d{2}-\d{2}$/
const DATA_HORA = /^\d{4}-\d{2}-\d{2}T/
const OCULTOS = /^(id|criado_em|atualizado_em|dias_para_vencimento|versao_sessao|e_entrada)$/
const TIPOS: Record<string, string> = { banco: 'Banco', dinheiro: 'Dinheiro em espécie', entrada: 'Entrada', saida: 'Saída' }

const rotulo = (chave: string) => ROTULOS[chave] ?? chave.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
const ehObjeto = (v: unknown): v is Objeto => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

function formatar(chave: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (chave.endsWith('_id')) return props.nomes?.[String(valor)] ?? 'outro registro'
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não'
  if (DINHEIRO.test(chave) && !Number.isNaN(Number(valor))) return moeda(valor as number)
  if (chave === 'percentual') return percentual(valor as number)
  if (chave === 'forma_pagamento') return rotuloForma(String(valor)) ?? '—'
  if (chave === 'status' || chave === 'situacao') return rotuloSituacao[String(valor)] ?? String(valor)
  if (chave === 'tipo') return TIPOS[String(valor)] ?? String(valor)
  if (chave === 'senha') return '••••••'
  if (typeof valor === 'string' && DATA.test(valor)) return data(valor)
  if (typeof valor === 'string' && DATA_HORA.test(valor)) return dataHora(valor)
  if (Array.isArray(valor)) return valor.map((v) => formatar('', v)).join(', ')
  return String(valor)
}

const visivel = (chave: string, valor: unknown) =>
  !OCULTOS.test(chave) && !(chave.endsWith('_id') && valor && !props.nomes?.[String(valor)])

const linhas = computed(() =>
  Object.entries(props.objeto)
    .filter(([chave, valor]) => visivel(chave, valor))
    .map(([chave, valor]) => {
      const lista = Array.isArray(valor) && valor.every(ehObjeto) ? (valor as Objeto[]) : null
      const filho = ehObjeto(valor) ? valor : null
      const anterior = props.comparar && chave in props.comparar ? props.comparar[chave] : undefined
      const mudou =
        !lista && !filho && anterior !== undefined && formatar(chave, anterior) !== formatar(chave, valor)
      return {
        chave,
        lista,
        filho,
        valor: lista || filho ? '' : formatar(chave, valor),
        anterior: mudou ? formatar(chave, anterior) : null,
      }
    }),
)
</script>

<template>
  <table class="tabela-dados">
    <tbody>
      <tr v-for="l in linhas" :key="l.chave" :class="{ mudou: l.anterior !== null }">
        <th scope="row">{{ rotulo(l.chave) }}</th>
        <td>
          <TabelaDados v-if="l.filho" :objeto="l.filho" :nomes="nomes" />
          <template v-else-if="l.lista">
            <span v-if="!l.lista.length" class="fraco">Nenhum</span>
            <TabelaDados v-for="(item, i) in l.lista" :key="i" :objeto="item" :nomes="nomes" />
          </template>
          <template v-else>
            <template v-if="l.anterior !== null"><span class="anterior">{{ l.anterior }}</span> → </template>
            {{ l.valor }}
          </template>
        </td>
      </tr>
    </tbody>
  </table>
</template>

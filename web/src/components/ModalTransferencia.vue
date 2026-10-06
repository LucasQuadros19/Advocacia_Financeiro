<script setup lang="ts">
import { reactive } from 'vue'
import Aviso from './Aviso.vue'
import CampoCarteira from './CampoCarteira.vue'
import CampoMoeda from './CampoMoeda.vue'
import Modal from './Modal.vue'
import { hoje, paraNumero } from '../format.ts'

defineProps<{ salvando: boolean; erro: string }>()
const emit = defineEmits<{ fechar: []; confirmar: [corpo: Record<string, unknown>] }>()

const form = reactive({ de: '', para: '', valor: '', data: hoje(), observacoes: '' })

const enviar = () =>
  emit('confirmar', {
    de_carteira_id: form.de,
    para_carteira_id: form.para,
    valor: paraNumero(form.valor),
    data: form.data,
    observacoes: form.observacoes || undefined,
  })
</script>

<template>
  <Modal
    titulo="Transferir entre contas"
    descricao="Saque, depósito ou envio entre bancos. Muda onde o dinheiro está, sem contar como entrada ou saída."
    confirmar="Transferir"
    :salvando="salvando"
    @fechar="emit('fechar')"
    @confirmar="enviar"
  >
    <div class="grade-2">
      <CampoCarteira id="t-de" v-model="form.de" rotulo="Sai de *" forma="pix" />
      <CampoCarteira id="t-para" v-model="form.para" rotulo="Entra em *" forma="dinheiro" :excluir="form.de" />
    </div>
    <div class="grade-2">
      <CampoMoeda id="t-valor" v-model="form.valor" rotulo="Valor *" obrigatorio />
      <div class="campo">
        <label for="t-data">Data *</label>
        <input id="t-data" v-model="form.data" type="date" :max="hoje()" required />
      </div>
    </div>
    <div class="campo">
      <label for="t-obs">Observações</label>
      <textarea id="t-obs" v-model="form.observacoes" maxlength="2000" />
    </div>
    <Aviso :texto="erro" />
  </Modal>
</template>

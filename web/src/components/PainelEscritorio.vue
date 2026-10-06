<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import Aviso from './Aviso.vue'
import Estado from './Estado.vue'
import Icone from './Icone.vue'
import type { Escritorio } from './Documento.vue'
import { api } from '../api.ts'
import { avisar } from '../avisos.ts'
import { useRecurso } from '../recurso.ts'

const escritorio = useRecurso(() => api.get<Escritorio>('/escritorio'))
const form = reactive({
  nome: '', documento: '', oab: '', endereco: '', cidade: '', telefone: '', email: '', clausulas_parcelamento: '',
})
const salvando = ref(false)
const erro = ref('')

watch(escritorio.dados, (dados) => {
  if (!dados) return
  for (const chave of Object.keys(form) as (keyof typeof form)[]) form[chave] = dados[chave] ?? ''
})
onMounted(escritorio.recarregar)

async function salvar() {
  salvando.value = true
  erro.value = ''
  try {
    await api.put('/escritorio', form)
    avisar('Dados do escritório salvos.')
    await escritorio.recarregar()
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <Estado :carregando="escritorio.carregando.value" :erro="escritorio.erro.value" @repetir="escritorio.recarregar">
    <form class="painel" @submit.prevent="salvar">
      <header>
        <div>
          <h2>Dados do escritório</h2>
          <p>Saem no cabeçalho do recibo e do termo de parcelamento.</p>
        </div>
        <button type="submit" class="botao primario pequeno" :disabled="salvando">
          <Icone nome="confirmar" /> {{ salvando ? 'Salvando…' : 'Salvar' }}
        </button>
      </header>
      <div class="corpo formulario-escritorio">
        <div class="grade-2">
          <div class="campo">
            <label for="esc-nome">Nome do escritório *</label>
            <input id="esc-nome" v-model="form.nome" required maxlength="200" placeholder="Ex.: Quadros Advocacia" />
          </div>
          <div class="campo">
            <label for="esc-documento">CNPJ ou CPF</label>
            <input id="esc-documento" v-model="form.documento" maxlength="30" />
          </div>
        </div>
        <div class="grade-2">
          <div class="campo">
            <label for="esc-oab">Registro na OAB</label>
            <input id="esc-oab" v-model="form.oab" maxlength="60" placeholder="Ex.: OAB/SC 1234" />
          </div>
          <div class="campo">
            <label for="esc-cidade">Cidade / UF</label>
            <input id="esc-cidade" v-model="form.cidade" maxlength="100" placeholder="Ex.: Florianópolis/SC" />
            <span class="dica">Usada no “local e data” dos documentos.</span>
          </div>
        </div>
        <div class="campo">
          <label for="esc-endereco">Endereço</label>
          <input id="esc-endereco" v-model="form.endereco" maxlength="300" />
        </div>
        <div class="grade-2">
          <div class="campo">
            <label for="esc-telefone">Telefone</label>
            <input id="esc-telefone" v-model="form.telefone" maxlength="40" />
          </div>
          <div class="campo">
            <label for="esc-email">E-mail</label>
            <input id="esc-email" v-model="form.email" type="email" maxlength="200" />
          </div>
        </div>
        <div class="campo">
          <label for="esc-clausulas">Cláusulas padrão do termo de parcelamento</label>
          <textarea
            id="esc-clausulas"
            v-model="form.clausulas_parcelamento"
            maxlength="4000"
            rows="6"
            placeholder="Ex.: O atraso de qualquer parcela implica multa de 2% e juros de 1% ao mês, e autoriza a cobrança imediata do saldo."
          />
          <span class="dica">Texto livre, impresso logo depois da tabela de parcelas. Deixe em branco para não incluir.</span>
        </div>
        <Aviso :texto="erro" />
      </div>
    </form>
  </Estado>
</template>

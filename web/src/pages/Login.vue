<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import Aviso from '../components/Aviso.vue'
import Icone from '../components/Icone.vue'
import { api } from '../api.ts'
import { router } from '../router.ts'
import { usuario, type Usuario } from '../sessao.ts'

const LEMBRAR = 'financeiro:usuario'

const rota = useRoute()
const login = ref('')
const senha = ref('')
const lembrar = ref(true)
const mostrarSenha = ref(false)
const erro = ref('')
const entrando = ref(false)
const campoSenha = ref<HTMLInputElement>()
const campoLogin = ref<HTMLInputElement>()

onMounted(() => {
  try {
    login.value = localStorage.getItem(LEMBRAR) ?? ''
  } catch {
    login.value = ''
  }
  const alvo = login.value ? campoSenha.value : campoLogin.value
  alvo?.focus()
})

async function entrar() {
  entrando.value = true
  erro.value = ''
  try {
    const resposta = await api.post<{ usuario: Usuario }>('/auth/login', { login: login.value, senha: senha.value })
    usuario.value = resposta.usuario
    try {
      if (lembrar.value) localStorage.setItem(LEMBRAR, login.value)
      else localStorage.removeItem(LEMBRAR)
    } catch {}
    router.push(String(rota.query.de ?? '/'))
  } catch (e) {
    erro.value = (e as Error).message
    senha.value = ''
    campoSenha.value?.focus()
  } finally {
    entrando.value = false
  }
}
</script>

<template>
  <div class="tela-login">
    <main>
      <form class="formulario-login" @submit.prevent="entrar">
        <div class="marca">
          <span class="simbolo"><Icone nome="advogados" :tamanho="19" /></span>
          <strong>Financeiro</strong>
        </div>
        <h1>Entrar</h1>
        <p class="fraco">Use seu usuário e senha.</p>

        <div class="campo">
          <label for="login">Usuário</label>
          <div class="campo-icone">
            <Icone nome="usuario" />
            <input
              id="login"
              ref="campoLogin"
              v-model="login"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              required
              maxlength="60"
            />
          </div>
        </div>

        <div class="campo">
          <label for="senha">Senha</label>
          <div class="campo-icone">
            <Icone nome="cadeado" />
            <input
              id="senha"
              ref="campoSenha"
              v-model="senha"
              :type="mostrarSenha ? 'text' : 'password'"
              autocomplete="current-password"
              required
              maxlength="200"
            />
            <button
              type="button"
              class="mostrar-senha"
              :aria-label="mostrarSenha ? 'Esconder senha' : 'Mostrar senha'"
              :aria-pressed="mostrarSenha"
              @click="mostrarSenha = !mostrarSenha"
            >
              <Icone :nome="mostrarSenha ? 'olhoFechado' : 'olho'" />
            </button>
          </div>
        </div>

        <label class="lembrar">
          <input v-model="lembrar" type="checkbox" />
          Lembrar meu usuário neste computador
        </label>

        <Aviso :texto="erro" />

        <button class="botao primario grande" type="submit" :disabled="entrando">
          {{ entrando ? 'Entrando…' : 'Entrar' }}
        </button>

        <p class="dica centro">Esqueceu a senha? Outro usuário pode definir uma nova em Configurações › Usuários.</p>
      </form>
    </main>
  </div>
</template>

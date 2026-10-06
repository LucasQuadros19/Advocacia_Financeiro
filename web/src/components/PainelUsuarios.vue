<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Aviso from './Aviso.vue'
import CampoSenha from './CampoSenha.vue'
import Estado from './Estado.vue'
import Icone from './Icone.vue'
import Modal from './Modal.vue'
import { api } from '../api.ts'
import { avisar, confirmar } from '../avisos.ts'
import { data, dataHora, iniciais } from '../format.ts'
import { useRecurso } from '../recurso.ts'
import { usuario as eu } from '../sessao.ts'

type Usuario = { id: string; nome: string; login: string; ativo: boolean; ultimo_acesso: string | null; criado_em: string }

const usuarios = useRecurso(() => api.get<{ dados: Usuario[] }>('/usuarios'))
onMounted(usuarios.recarregar)

const salvando = ref(false)
const erro = ref('')

const modal = ref<'novo' | 'editar' | 'senha'>()
const alvo = ref<Usuario>()
const form = reactive({ nome: '', login: '', senha: '', confirmacao: '', ativo: true })
const loginTocado = ref(false)

const sugerirLogin = (nome: string) =>
  (nome.trim().split(/\s+/)[0] ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')

watch(
  () => form.nome,
  (nome) => {
    if (modal.value === 'novo' && !loginTocado.value) form.login = sugerirLogin(nome)
  },
)

const regras = computed(() => [
  { ok: form.senha.length >= 8, texto: 'Pelo menos 8 caracteres' },
  { ok: Boolean(form.senha) && form.senha === form.confirmacao, texto: 'As duas senhas são iguais' },
])
const senhaValida = computed(() => regras.value.every((r) => r.ok))

function abrir(tipo: 'novo' | 'editar' | 'senha', u?: Usuario) {
  modal.value = tipo
  alvo.value = u
  loginTocado.value = false
  erro.value = ''
  Object.assign(form, { nome: u?.nome ?? '', login: u?.login ?? '', senha: '', confirmacao: '', ativo: u?.ativo ?? true })
}

async function salvar() {
  if (modal.value !== 'editar' && !senhaValida.value) return (erro.value = 'Confira os requisitos da senha.')
  salvando.value = true
  erro.value = ''
  try {
    if (modal.value === 'novo') {
      await api.post('/usuarios', { nome: form.nome, login: form.login, senha: form.senha })
      avisar(`Usuário ${form.login} cadastrado.`)
    } else if (modal.value === 'editar') {
      await api.put(`/usuarios/${alvo.value!.id}`, { nome: form.nome, login: form.login, ativo: form.ativo })
      if (alvo.value!.id === eu.value?.id && eu.value) eu.value = { ...eu.value, nome: form.nome, login: form.login }
      avisar('Usuário atualizado.')
    } else {
      await api.put(`/usuarios/${alvo.value!.id}/senha`, { senha: form.senha })
      avisar(alvo.value!.id === eu.value?.id ? 'Sua senha foi trocada.' : `Senha de ${alvo.value!.nome} trocada.`)
    }
    modal.value = undefined
    await usuarios.recarregar()
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    salvando.value = false
  }
}

async function alternarAtivo(u: Usuario) {
  if (u.ativo) {
    const ok = await confirmar(
      'Desativar usuário',
      `${u.nome} não vai mais conseguir entrar, e as sessões abertas são encerradas agora. O histórico na auditoria continua.`,
      { confirmar: 'Desativar', perigo: true },
    )
    if (!ok) return
  }
  try {
    await api.put(`/usuarios/${u.id}`, { nome: u.nome, login: u.login, ativo: !u.ativo })
    avisar(u.ativo ? `${u.nome} foi desativado.` : `${u.nome} pode entrar de novo.`)
    await usuarios.recarregar()
  } catch (e) {
    avisar((e as Error).message, 'erro')
  }
}

const titulo = computed(() =>
  modal.value === 'novo' ? 'Novo usuário' : modal.value === 'editar' ? 'Editar usuário' : 'Trocar senha',
)
</script>

<template>
  <section class="painel">
    <header>
      <div>
        <h2>Usuários</h2>
        <p>Quem entra no sistema. Todos podem fazer tudo, e a auditoria registra quem fez cada coisa.</p>
      </div>
      <button class="botao primario pequeno" @click="abrir('novo')"><Icone nome="mais" /> Novo usuário</button>
    </header>
    <Estado
      :carregando="usuarios.carregando.value"
      :erro="usuarios.erro.value"
      :vazio="!usuarios.dados.value?.dados.length"
      icone="usuario"
      @repetir="usuarios.recarregar"
    >
      <ul v-if="usuarios.dados.value" class="lista-usuarios">
        <li v-for="u in usuarios.dados.value.dados" :key="u.id" :class="{ inativo: !u.ativo }">
          <span class="inicial grande">{{ iniciais(u.nome) }}</span>
          <div class="quem-usuario">
            <div>
              <strong>{{ u.nome }}</strong>
              <span v-if="u.id === eu?.id" class="selo acao">Você</span>
              <span v-if="!u.ativo" class="selo">Desativado</span>
            </div>
            <span class="fraco">@{{ u.login }} · desde {{ data(u.criado_em) }}</span>
          </div>
          <div class="acesso-usuario">
            <span class="rotulo-campo">Último acesso</span>
            <span>{{ u.ultimo_acesso ? dataHora(u.ultimo_acesso) : 'Nunca entrou' }}</span>
          </div>
          <div class="acoes">
            <RouterLink class="botao pequeno texto" :to="`/auditoria?usuario_id=${u.id}`">
              <Icone nome="escudo" /> Atividade
            </RouterLink>
            <button class="botao pequeno" @click="abrir('editar', u)"><Icone nome="editar" /> Editar</button>
            <button class="botao pequeno" @click="abrir('senha', u)"><Icone nome="cadeado" /> Senha</button>
            <button
              v-if="u.id !== eu?.id"
              class="botao pequeno"
              :class="{ perigo: u.ativo }"
              @click="alternarAtivo(u)"
            >
              {{ u.ativo ? 'Desativar' : 'Reativar' }}
            </button>
          </div>
        </li>
      </ul>
    </Estado>
  </section>

  <Modal
    v-if="modal"
    :titulo="titulo"
    :descricao="
      modal === 'senha'
        ? alvo?.id === eu?.id
          ? 'As suas outras sessões abertas serão encerradas.'
          : `${alvo?.nome} vai precisar entrar de novo com a senha nova.`
        : undefined
    "
    :salvando="salvando"
    :confirmar="modal === 'novo' ? 'Cadastrar usuário' : 'Salvar'"
    @fechar="modal = undefined"
    @confirmar="salvar"
  >
    <template v-if="modal !== 'senha'">
      <div class="campo">
        <label for="u-nome">Nome *</label>
        <input id="u-nome" v-model="form.nome" required minlength="2" maxlength="120" autofocus placeholder="Ex.: Guilherme Souza" />
      </div>
      <div class="campo">
        <label for="u-login">Usuário para entrar *</label>
        <div class="campo-icone">
          <Icone nome="usuario" />
          <input
            id="u-login"
            v-model="form.login"
            required
            pattern="[a-zA-Z0-9._\-]{3,40}"
            maxlength="40"
            autocapitalize="none"
            spellcheck="false"
            @input="loginTocado = true"
          />
        </div>
        <span class="dica">Letras, números, ponto ou hífen. Sem espaços.</span>
      </div>
    </template>
    <template v-if="modal !== 'editar'">
      <div class="grade-2">
        <CampoSenha id="u-senha" v-model="form.senha" :rotulo="modal === 'senha' ? 'Nova senha *' : 'Senha *'" />
        <CampoSenha id="u-confirmacao" v-model="form.confirmacao" rotulo="Repita a senha *" />
      </div>
      <ul class="requisitos">
        <li v-for="r in regras" :key="r.texto" :class="{ ok: r.ok }">
          <Icone :nome="r.ok ? 'confirmar' : 'fechar'" :tamanho="13" /> {{ r.texto }}
        </li>
      </ul>
    </template>
    <Aviso :texto="erro" />
  </Modal>
</template>

import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'

export function useRecurso<T>(carregar: () => Promise<T>) {
  const dados = shallowRef<T>()
  const carregando = ref(true)
  const erro = ref('')

  async function recarregar() {
    carregando.value = dados.value === undefined
    erro.value = ''
    try {
      dados.value = await carregar()
    } catch (e) {
      erro.value = (e as Error).message
    } finally {
      carregando.value = false
    }
  }

  return { dados, carregando, erro, recarregar }
}

export function watchDebounced<T>(fonte: () => T, efeito: () => void, ms = 300) {
  let temporizador: ReturnType<typeof setTimeout>
  watch(fonte, () => {
    clearTimeout(temporizador)
    temporizador = setTimeout(efeito, ms)
  })
  onBeforeUnmount(() => clearTimeout(temporizador))
}

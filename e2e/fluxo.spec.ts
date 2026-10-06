import { expect, test, type Page } from '@playwright/test'

const hoje = new Date().toLocaleDateString('en-CA')

test.describe.configure({ mode: 'serial' })

const extrato = (page: Page, texto: string) =>
  page.locator('.extrato-tabela tbody tr:not(.linha-dia):not(.linha-filho)').filter({ hasText: texto })

async function entrar(page: Page, login = 'teste', senha = 'senha-de-teste') {
  await page.goto('/login')
  await page.getByLabel('Usuário', { exact: true }).fill(login)
  await page.getByLabel('Senha', { exact: true }).fill(senha)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

test('cliente novo abre o cadastro de caso com cobrança, divisão e caixa', async ({ page }) => {
  await entrar(page)

  await page.getByRole('link', { name: 'Configurações' }).click()
  await page.getByRole('tab', { name: 'Advogados' }).click()
  await page.getByRole('button', { name: 'Novo advogado' }).first().click()
  await page.getByLabel('Nome *').fill('Lucas Quadros')
  await page.getByLabel('É o advogado principal (dono do caixa)').check()
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('row', { name: /Lucas Quadros/ }).getByText('Principal')).toBeVisible()

  await page.getByRole('button', { name: 'Novo advogado' }).first().click()
  await page.getByLabel('Nome *').fill('Ana Martins')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('cell', { name: 'Ana Martins' })).toBeVisible()
  await expect(page.getByLabel('Advogado principal')).toHaveValue(/.+/)

  await page.getByRole('link', { name: 'Clientes' }).click()
  await page.getByRole('button', { name: 'Novo cliente' }).click()
  await page.getByLabel('Nome *').fill('João da Silva')
  await page.getByLabel('CPF / CNPJ').fill('123.456.789-00')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByRole('heading', { name: 'Novo caso' })).toBeVisible()
  await expect(page.locator('.cliente-escolhido')).toContainText('João da Silva')

  await page.getByLabel('Título do caso *').fill('Ação Trabalhista')
  await page.getByLabel('Valor combinado do caso').fill('30000')
  await expect(page.getByLabel('Descrição da cobrança *')).toHaveValue('Honorários — Ação Trabalhista')
  await expect(page.getByLabel('Valor total a receber *')).toHaveValue('30000')

  await page.getByLabel('Valor total a receber *').fill('900')
  await page.getByLabel('Em quantas parcelas? *').fill('3')
  await page.getByLabel('Vencimento da 1ª parcela *').fill(hoje)
  await expect(page.getByText('de R$ 300,00')).toBeVisible()

  const percentualDe = (nome: string) => page.getByLabel(`Percentual de ${nome}`)

  await page.getByText('100% para Lucas Quadros').click()
  await expect(percentualDe('Lucas Quadros')).toHaveValue('100')
  await page.getByLabel('Adicionar advogado ao caso').selectOption({ label: 'Ana Martins' })
  await expect(percentualDe('Lucas Quadros')).toHaveValue('50')
  await percentualDe('Ana Martins').fill('40')
  await expect(percentualDe('Lucas Quadros')).toHaveValue('60')

  await page.getByRole('button', { name: 'Criar caso' }).click()
  await expect(page.getByRole('heading', { name: 'Ação Trabalhista' })).toBeVisible()
  await expect(page.getByText('60% do que falta, pela divisão')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Honorários — Ação Trabalhista' })).toBeVisible()

  await page.getByRole('link', { name: 'João da Silva' }).first().click()
  await page.getByText('Honorários — Ação Trabalhista').click()
  await expect(page.getByRole('cell', { name: '1/3', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'R$ 300,00', exact: true })).toHaveCount(3)

  await page.getByRole('button', { name: 'Alterar' }).first().click()
  await page.getByLabel('Vencimento *').fill('2027-03-10')
  await page.getByLabel('Valor *', { exact: true }).fill('320,00')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByText('Parcela atualizada.')).toBeVisible()
  await expect(page.getByRole('cell', { name: '10/03/2027', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Registrar pagamento' }).first().click()
  await page.getByLabel('Forma de pagamento').selectOption('pix')
  await expect(page.getByText('Fica com você: R$ 192,00')).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar recebimento' }).click()
  await expect(page.getByText('Pagamento registrado e repasse lançado.')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Pago', exact: true })).toBeVisible()

  const cartao = (rotulo: string) => page.locator('.cartao').filter({ hasText: rotulo })

  await page.getByRole('link', { name: 'Caixa', exact: true }).click()
  await page.getByRole('button', { name: 'Por caso' }).click()
  await expect(page.getByRole('row', { name: /Ação Trabalhista/ })).toContainText('60%')

  await page.getByRole('link', { name: 'Dashboard' }).click()
  await expect(cartao('Total a receber')).toContainText('R$ 600,00')
  await expect(cartao('Total recebido')).toContainText('R$ 320,00')
  await expect(cartao('Meu caixa — a receber')).toContainText('R$ 360,00')
})

test('caso com entrada já recebida e cliente cadastrado na própria tela', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Novo caso' }).click()
  await expect(page.getByRole('heading', { name: 'Novo caso' })).toBeVisible()

  await page.getByRole('button', { name: 'Novo cliente' }).click()
  await page.getByLabel('Nome *').fill('Empresa XPTO')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.locator('.cliente-escolhido')).toContainText('Empresa XPTO')

  await page.getByLabel('Título do caso *').fill('Consultoria mensal')
  await page.getByLabel('Valor total a receber *').fill('4.000,00')
  await page.getByLabel('Entrada', { exact: true }).fill('1000')
  await page.getByLabel('Data da entrada *').fill(hoje)
  await expect(page.getByLabel('A entrada já foi recebida')).toBeChecked()
  await page.getByLabel('Em quantas parcelas? *').fill('3')
  await page.getByLabel('Vencimento da 1ª parcela *').fill(hoje)
  await expect(page.getByText('Total de R$ 4.000,00 em 4 pagamento(s).')).toBeVisible()

  await page.getByRole('button', { name: 'Criar caso' }).click()
  await expect(page.getByRole('heading', { name: 'Consultoria mensal' })).toBeVisible()

  const cartao = (rotulo: string) => page.locator('.cartao').filter({ hasText: rotulo })
  await expect(cartao('Recebido no caso')).toContainText('R$ 1.000,00')
  await expect(cartao('Minha parte recebida')).toContainText('R$ 1.000,00')

  await page.getByRole('link', { name: 'Empresa XPTO' }).first().click()
  await expect(page.getByText('Entrada + 3x')).toBeVisible()
  await page.getByText('Honorários — Consultoria mensal').click()
  await expect(page.getByRole('cell', { name: 'Entrada', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '4/4', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'R$ 1.000,00', exact: true })).toHaveCount(4)
})

test('busca de cliente sugere em vez de listar tudo', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Novo caso' }).click()

  const campo = page.getByLabel('Cliente *')
  await expect(page.locator('.sugestoes li')).toHaveCount(0)

  await campo.fill('e')
  await page.waitForTimeout(500)
  await expect(page.locator('.sugestoes li')).toHaveCount(0)

  await campo.fill('xpt')
  await expect(page.locator('.sugestoes li')).toHaveCount(1)
  await expect(page.locator('.sugestoes li').first()).toContainText('Empresa XPTO')

  await campo.fill('joão')
  await expect(page.locator('.sugestoes li').first()).toContainText('João da Silva')
  await campo.press('Enter')
  await expect(page.locator('.cliente-escolhido')).toContainText('João da Silva')

  await page.getByRole('button', { name: 'Trocar' }).click()
  await expect(page.locator('.cliente-escolhido')).toHaveCount(0)

  await page.getByLabel('Título do caso *').fill('Caso sem cliente')
  await page.getByLabel('Registrar a cobrança agora').uncheck()
  await page.getByRole('button', { name: 'Criar caso' }).click()
  await expect(page.getByText('Escolha o cliente no passo 1')).toBeVisible()
  await expect(page.getByLabel('Cliente *')).toBeFocused()
})

test('notas do cliente e do caso aparecem como conversa', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Clientes' }).click()
  await page.getByText('João da Silva').first().click()

  await page.getByRole('button', { name: 'Notas' }).click()
  await expect(page.getByText('Nenhuma nota ainda')).toBeVisible()

  await page.getByLabel('Escrever uma nota').fill('Cliente pediu prazo até sexta.')
  await expect(page.locator('.compositor')).toContainText('Assinada como Lucas Quadros')
  await page.getByRole('button', { name: 'Adicionar nota' }).click()

  const primeira = page.locator('.item-nota').first()
  await expect(primeira).toContainText('Cliente pediu prazo até sexta.')
  await expect(primeira).toContainText('Lucas Quadros')
  await expect(primeira.locator('time')).toContainText('hoje às')

  await page.getByLabel('Escrever uma nota').fill('Contrato enviado por e-mail.')
  await page.getByRole('button', { name: 'Adicionar nota' }).click()
  await expect(page.locator('.item-nota')).toHaveCount(2)
  await expect(page.locator('.item-nota').first()).toContainText('Contrato enviado por e-mail.')

  await page.getByRole('link', { name: 'Casos' }).click()
  await page.getByRole('row', { name: /Ação Trabalhista/ }).click()
  // no caso, as notas do cliente já aparecem junto
  await expect(page.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.item-nota')).toHaveCount(2)
  await page.getByRole('button', { name: 'Deste caso' }).click()
  await expect(page.getByText('Este caso ainda não tem notas próprias.')).toBeVisible()

  await page.getByLabel('Escrever uma nota').fill('Audiência marcada para 10/03.')
  await page.getByRole('button', { name: 'Adicionar nota' }).click()
  await expect(page.locator('.item-nota')).toHaveCount(1)

  await page.getByRole('button', { name: 'Excluir nota' }).click()
  await page.getByRole('button', { name: 'Excluir', exact: true }).last().click()
  await expect(page.getByText('Nota excluída.')).toBeVisible()
  await expect(page.getByText('Este caso ainda não tem notas próprias.')).toBeVisible()
})

test('notas do cliente aparecem dentro do caso, separadas das notas do caso', async ({ page }) => {
  await entrar(page)

  await page.getByRole('link', { name: 'Clientes' }).click()
  await page.getByText('João da Silva').first().click()
  await page.getByRole('button', { name: 'Notas' }).click()
  await page.getByLabel('Escrever uma nota').fill('Prefere ser chamado no celular da esposa.')
  await page.getByRole('button', { name: 'Adicionar nota' }).click()
  await expect(page.locator('.item-nota').first()).toContainText('Prefere ser chamado')

  await page.getByRole('link', { name: 'Casos' }).click()
  await page.getByRole('row', { name: /Ação Trabalhista/ }).click()

  // no caso, "Todas" junta as do caso e as do cliente, cada uma marcada
  const notas = page.locator('.item-nota')
  const doCliente = page.locator('.item-nota.do-cliente')
  await page.getByLabel('Escrever uma nota').fill('Audiência de conciliação em 12/04.')
  await page.getByRole('button', { name: 'Adicionar nota' }).click()
  await expect(notas.first()).toContainText('Audiência de conciliação')
  await expect(notas.first()).toContainText('Do caso')
  await expect(doCliente.filter({ hasText: 'Prefere ser chamado' })).toHaveCount(1)

  // filtrando só o cliente, a do caso não aparece
  await page.getByRole('button', { name: 'Do cliente' }).click()
  await expect(page.getByText('Audiência de conciliação')).toHaveCount(0)
  await expect(doCliente).toHaveCount(await notas.count())

  // nesse filtro, a nota nova vai para o cliente
  const antes = await doCliente.count()
  await expect(page.getByRole('radio', { name: 'Cliente (todos os casos)' })).toHaveAttribute('aria-checked', 'true')
  await page.getByLabel('Escrever uma nota').fill('Mudou de endereço em março.')
  await page.getByRole('button', { name: 'Adicionar nota' }).click()
  await expect(doCliente).toHaveCount(antes + 1)

  await page.getByRole('button', { name: 'Deste caso' }).click()
  await expect(notas).toHaveCount(1)
  await expect(notas.first()).toContainText('Audiência de conciliação')

  // em "Todas" dá para escolher onde guardar
  await page.getByRole('button', { name: 'Todas' }).click()
  await page.getByRole('radio', { name: 'Cliente (todos os casos)' }).click()
  await page.getByLabel('Escrever uma nota').fill('Pediu boleto no lugar do PIX.')
  await page.getByRole('button', { name: 'Adicionar nota' }).click()
  await expect(doCliente.filter({ hasText: 'Pediu boleto' })).toHaveCount(1)
})

test('conta programada vira saída no caixa e aceita baixa', async ({ page }) => {
  await entrar(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Contas programadas' }).click()
  await page.getByRole('button', { name: /Nova conta programada|Cadastrar conta programada/ }).first().click()
  await page.getByLabel('Descrição *').fill('Aluguel da sala')
  await page.getByLabel('Valor mensal *').fill('2.400,00')
  await page.getByLabel('Vence todo dia *').fill('10')
  await page.getByLabel('A partir de *').fill(`${hoje.slice(0, 7)}-01`)
  await page.getByLabel('Categoria').fill('Estrutura')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Conta programada criada.')).toBeVisible()

  const aluguel = page.getByRole('row', { name: /Aluguel da sala/ })
  await expect(aluguel).toContainText('todo dia 10')
  await expect(aluguel).toContainText('pagos em 12 meses')

  // o lançamento do mês corrente aparece sozinho no caixa, como saída a pagar
  await page.getByRole('link', { name: 'Caixa', exact: true }).click()
  const cartaoSaiu = page.locator('.resumo-mes .saida')
  await expect(cartaoSaiu).toContainText('R$ 0,00')
  await page.getByRole('button', { name: /Em aberto/ }).click()
  // "em aberto" lista tudo que se deve, não só o mês: a de setembro vem primeiro
  const linha = page.getByRole('row', { name: /Aluguel da sala/ }).first()
  await expect(linha).toContainText('R$ 2.400,00')
  const emAbertoAntes = await page.getByRole('row', { name: /Aluguel da sala/ }).count()

  await linha.getByRole('button', { name: 'Pagar' }).click()
  await page.getByLabel('Forma de pagamento').selectOption('pix')
  await page.getByRole('button', { name: 'Confirmar pagamento' }).click()
  await expect(page.getByText('Pagamento registrado.')).toBeVisible()

  // e sai de "em aberto", aparecendo no extrato
  await expect(page.getByRole('row', { name: /Aluguel da sala/ })).toHaveCount(emAbertoAntes - 1)
  await page.getByRole('button', { name: 'Movimento' }).click()
  await expect(cartaoSaiu).toContainText('R$ 2.400,00')
  await expect(extrato(page, 'Aluguel da sala').locator('td.dinheiro.saida')).toHaveText('R$ 2.400,00')

  // com pagamento registrado, excluir a regra é bloqueado
  await page.getByRole('navigation').getByRole('link', { name: 'Contas programadas' }).click()
  await aluguel.getByRole('button', { name: 'Excluir conta programada' }).click()
  await page.getByRole('button', { name: 'Excluir', exact: true }).last().click()
  await expect(page.getByText(/não podem ser excluíd|Desative/)).toBeVisible()
})

test('repasse a outro advogado entra cheio e cria a saída', async ({ page }) => {
  await entrar(page)

  await page.getByRole('link', { name: 'Clientes' }).click()
  await page.getByRole('button', { name: 'Novo cliente' }).first().click()
  await page.getByLabel('Nome *').fill('Cliente do Repasse')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await page.getByLabel('Título do caso *').fill('Caso dividido')
  await page.getByLabel('Valor total a receber *').fill('1000,00')
  await page.getByLabel('Vencimento *').fill(hoje)
  await page.getByRole('button', { name: 'Criar caso' }).click()
  await expect(page.getByRole('heading', { name: 'Caso dividido' })).toBeVisible()

  await page.getByRole('link', { name: 'Caixa', exact: true }).click()
  await page.getByRole('button', { name: /Em aberto/ }).click()
  const linha = page.getByRole('row', { name: /Honorários — Caso dividido/ })
  await linha.getByRole('button', { name: 'Receber' }).click()

  // a escolha do advogado fica recolhida até eu abrir
  const repasse = page.getByText('Dividir com outro advogado')
  await expect(repasse).toBeVisible()
  await repasse.click()

  await page.getByLabel('Adicionar advogado ao repasse').selectOption({ label: 'Ana Martins' })
  await page.getByRole('button', { name: '50%', exact: true }).click()
  await expect(page.getByText('Fica com você: R$ 500,00')).toBeVisible()

  await page.getByRole('button', { name: 'Confirmar recebimento' }).click()
  await expect(page.getByText('Pagamento registrado e repasse lançado.')).toBeVisible()

  // a entrada é cheia; a saída do repasse nasce separada e pendente
  await page.getByRole('button', { name: 'Movimento' }).click()
  const entrada = extrato(page, 'Honorários — Caso dividido')
  await expect(entrada.locator('td.dinheiro.entrada')).toHaveText('R$ 1.000,00')
  await expect(entrada.locator('td.dinheiro.saida')).toHaveText('')

  // a saída do repasse nasce em aberto, apontando de onde veio
  await page.getByRole('button', { name: /Em aberto/ }).click()
  const saida = page.getByRole('row', { name: /Repasse a Ana Martins/ }).filter({ hasText: 'Caso dividido' })
  await expect(saida).toContainText('R$ 500,00')
  await expect(saida).toContainText('veio de Honorários — Caso dividido')
  await saida.getByRole('button', { name: 'Pagar' }).click()
  await page.getByRole('button', { name: 'Confirmar pagamento' }).click()
  await expect(page.getByText('Pagamento registrado.')).toBeVisible()
  await page.getByRole('button', { name: 'Movimento' }).click()
  await expect(extrato(page, 'Repasse a Ana Martins').locator('td.dinheiro.saida')).toHaveText('R$ 500,00')
})

test('lançamento manual entra no caixa e aceita repasse', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Caixa', exact: true }).click()
  await page.getByRole('button', { name: 'Novo lançamento' }).first().click()

  // a opção de dividir tem que estar à vista antes de digitar qualquer coisa
  const dividir = page.getByText('Dividir com outro advogado')
  await expect(dividir).toBeVisible()

  await page.getByLabel('Descrição *').fill('Consulta avulsa no balcão')
  await page.getByLabel('Valor *').fill('1.000,00')
  await page.getByLabel('Categoria').fill('Consultoria')

  await dividir.click()
  await page.getByLabel('Adicionar advogado ao repasse').selectOption({ label: 'Ana Martins' })
  await page.getByRole('button', { name: '40%', exact: true }).click()
  await expect(page.getByText('Fica com você: R$ 600,00')).toBeVisible()

  await page.getByRole('button', { name: 'Lançar no caixa' }).click()
  await expect(page.getByText('Lançamento registrado.')).toBeVisible()

  // entrou cheio no extrato, já quitado
  const entrada = extrato(page, 'Consulta avulsa no balcão')
  await expect(entrada.locator('td.dinheiro.entrada')).toHaveText('R$ 1.000,00')
  await expect(entrada).toContainText('Manual')

  // a saída tem que estar visível aqui mesmo, sem trocar de aba
  const filho = page
    .locator('.extrato-tabela tr.linha-filho')
    .filter({ hasText: 'parte de Consulta avulsa no balcão' })
    .filter({ hasText: 'Repasse a Ana Martins' })
  await expect(filho).toBeVisible()
  await expect(filho).toContainText('R$ 400,00')
  await expect(filho).toContainText('A pagar')

  // e a mesma saída também aparece em "em aberto", ligada ao lançamento
  await page.getByRole('button', { name: /Em aberto/ }).click()
  const repasse = page.getByRole('row', { name: /Repasse a Ana Martins/ }).filter({ hasText: 'Consulta avulsa' })
  await expect(repasse).toContainText('R$ 400,00')
  await expect(repasse).toContainText('veio de Consulta avulsa no balcão')

  // dá para quitar o repasse sem sair do extrato
  await page.getByRole('button', { name: 'Movimento' }).click()
  await filho.getByRole('button', { name: 'Pagar' }).click()
  await page.getByRole('button', { name: 'Confirmar pagamento' }).click()
  await expect(page.getByText('Pagamento registrado.')).toBeVisible()
  await expect(filho).toHaveCount(0)
  await expect(extrato(page, 'veio de Consulta avulsa no balcão').locator('td.dinheiro.saida')).toHaveText('R$ 400,00')

  // saída não fala de advogado em lugar nenhum: nem divisão, nem destinatário
  await page.getByRole('button', { name: 'Novo lançamento' }).first().click()
  await page.getByRole('button', { name: /Saída Paguei alguma coisa/ }).click()
  await page.getByLabel('Descrição *').fill('Custas processuais')
  await page.getByLabel('Valor *').fill('150,00')
  await expect(page.getByText('Dividir com outro advogado')).toHaveCount(0)
  await expect(page.getByLabel('Pago a (opcional)')).toHaveCount(0)
  await expect(page.locator('.modal').getByText('Ana Martins')).toHaveCount(0)

  // e voltando para entrada a divisão reaparece
  await page.getByRole('button', { name: /Entrada Recebi dinheiro/ }).click()
  await expect(page.getByText('Dividir com outro advogado')).toBeVisible()
  await page.getByRole('button', { name: /Saída Paguei alguma coisa/ }).click()
  await page.getByRole('button', { name: 'Lançar no caixa' }).click()
  await expect(page.getByText('Lançamento registrado.')).toBeVisible()

  await page.getByRole('button', { name: 'Movimento' }).click()
  await expect(extrato(page, 'Custas processuais').locator('td.dinheiro.saida')).toHaveText('R$ 150,00')
})

test('bancos, recebimento parcial e transferência', async ({ page }) => {
  await entrar(page)

  await page.getByRole('link', { name: 'Configurações' }).click()
  await page.getByRole('tab', { name: 'Bancos e dinheiro' }).click()
  await page.getByRole('button', { name: /Nova conta|Cadastrar conta/ }).first().click()
  await page.getByLabel('Nome *').fill('Banco do Brasil')
  await page.getByLabel('Saldo inicial').fill('1.000,00')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Conta cadastrada.')).toBeVisible()
  await page.getByRole('button', { name: 'Nova conta' }).click()
  await page.getByLabel('Nome *').fill('Dinheiro')
  await page.getByLabel('Tipo *').selectOption('dinheiro')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('row', { name: /Dinheiro em espécie/ })).toBeVisible()

  await page.getByRole('link', { name: 'Clientes' }).click()
  await page.getByRole('button', { name: 'Novo cliente' }).first().click()
  await page.getByLabel('Nome *').fill('Cliente Parcelado')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await page.getByLabel('Título do caso *').fill('Revisional')
  await page.getByLabel('Valor total a receber *').fill('1000')
  await page.getByLabel('Vencimento *').fill(hoje)
  await page.getByRole('button', { name: 'Criar caso' }).click()
  await page.getByRole('link', { name: 'Cliente Parcelado' }).first().click()

  await page.getByText('Honorários — Revisional').click()
  await page.getByRole('button', { name: 'Registrar pagamento' }).click()
  await expect(page.getByLabel('Valor recebido agora *')).toHaveValue('1000,00')
  await page.getByLabel('Valor recebido agora *').fill('400,00')
  await expect(page.getByText('R$ 600,00 continuam em aberto')).toBeVisible()
  await page.getByLabel('Forma de pagamento').selectOption('pix')
  await expect(page.getByLabel('Entrou em *')).toHaveValue(/.+/)
  await page.getByRole('button', { name: 'Confirmar recebimento' }).click()
  await expect(page.getByText('Pagamento registrado.')).toBeVisible()
  await expect(page.getByText('faltam R$ 600,00')).toBeVisible()
  await expect(page.locator('.recebimentos-parcela')).toContainText('Banco do Brasil')

  await page.getByRole('link', { name: 'Caixa', exact: true }).click()
  const cartao = (rotulo: string) =>
    page.locator('.cartao').filter({ has: page.locator('.rotulo').getByText(rotulo, { exact: true }) })
  await expect(cartao('Banco do Brasil')).toContainText('R$ 1.400,00')

  await page.getByRole('button', { name: /Em aberto/ }).click()
  const aberto = page.getByRole('row', { name: /Honorários — Revisional/ })
  await expect(aberto).toContainText('R$ 600,00')
  await expect(aberto).toContainText('recebido R$ 400,00 de R$ 1.000,00')
  const coluna = page.getByRole('columnheader', { name: 'Falta receber' })
  await coluna.getByRole('button').click()
  await expect(coluna).toHaveAttribute('aria-sort', 'descending')

  await page.getByRole('button', { name: 'Transferir' }).click()
  await page.getByLabel('Sai de *').selectOption({ label: 'Banco do Brasil' })
  await page.getByLabel('Entra em *').selectOption({ label: 'Dinheiro (em espécie)' })
  await page.getByLabel('Valor *', { exact: true }).fill('200,00')
  await page.getByRole('button', { name: 'Transferir', exact: true }).last().click()
  await expect(page.getByText('Transferência registrada.')).toBeVisible()
  await expect(cartao('Banco do Brasil')).toContainText('R$ 1.200,00')
  await expect(cartao('Dinheiro')).toContainText('R$ 200,00')

  await page.getByRole('button', { name: 'Movimento' }).click()
  await expect(extrato(page, 'Banco do Brasil → Dinheiro')).toContainText('R$ 200,00 mudaram de conta')
})

test('usuários, baixa e adiamento, auditoria e histórico', async ({ page }) => {
  await entrar(page)

  await page.getByRole('link', { name: 'Configurações' }).click()
  await page.getByRole('button', { name: 'Novo usuário' }).click()
  await page.getByLabel('Nome *').fill('Guilherme Souza')
  await expect(page.getByLabel('Usuário para entrar *')).toHaveValue('guilherme')
  await page.getByLabel('Senha *', { exact: true }).fill('senha-guilherme-1')
  await page.getByLabel('Repita a senha *').fill('senha-guilherme-1')
  await expect(page.locator('.requisitos li.ok')).toHaveCount(2)
  await page.getByRole('button', { name: 'Cadastrar usuário' }).click()
  await expect(page.getByText('Usuário guilherme cadastrado.')).toBeVisible()
  await expect(page.locator('.lista-usuarios')).toContainText('@guilherme')

  await page.getByRole('button', { name: 'Sair' }).click()
  await page.getByLabel('Usuário', { exact: true }).fill('guilherme')
  await page.getByLabel('Senha', { exact: true }).fill('errada-de-proposito')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByText('Usuário ou senha inválidos')).toBeVisible()
  await entrar(page, 'guilherme', 'senha-guilherme-1')
  await expect(page.locator('.lateral .quem')).toContainText('Guilherme Souza')

  await page.getByRole('navigation').getByRole('link', { name: 'Contas programadas' }).click()
  const aluguel = page.getByRole('row', { name: /Aluguel da sala/ })
  await aluguel.getByRole('button', { name: 'Adiar' }).click()
  await page.getByRole('button', { name: 'Adiar', exact: true }).last().click()
  await expect(page.getByText('Aluguel da sala adiada para o mês seguinte.')).toBeVisible()
  await expect(aluguel).toContainText('adiada de')

  await aluguel.getByRole('button', { name: 'Dar baixa' }).click()
  await page.getByRole('button', { name: 'Confirmar pagamento' }).click()
  await expect(page.getByText(/Baixa registrada em Aluguel da sala/)).toBeVisible()

  await page.getByRole('link', { name: 'Auditoria' }).click()
  await page.getByLabel('Usuário', { exact: true }).selectOption({ label: 'Guilherme Souza' })
  await expect(page.locator('tbody tr').filter({ hasText: 'Lucas Quadros' })).toHaveCount(0)
  const baixa = page.getByRole('row', { name: /Deu baixa na conta programada/ })
  await expect(baixa).toContainText('Guilherme Souza')
  await expect(page.getByRole('row', { name: /Adiou a conta para o mês seguinte/ })).toBeVisible()
  await baixa.click()
  await expect(page.getByRole('heading', { name: 'Como estava antes' })).toBeVisible()
  await page.getByRole('button', { name: 'Fechar', exact: true }).last().click()

  await page.getByLabel('Usuário', { exact: true }).selectOption({ label: 'Todos' })
  await page.getByRole('button', { name: 'Tudo' }).click()
  await page.getByLabel('Ação').selectOption({ label: 'Negado' })
  await expect(page.getByRole('row', { name: /Login recusado para "guilherme"/ })).toBeVisible()

  await page.getByRole('link', { name: 'Histórico mensal' }).click()
  await expect(page.getByRole('heading', { name: 'Histórico mensal' })).toBeVisible()
  await expect(page.locator('.conta-mes').filter({ hasText: 'Banco do Brasil' })).toContainText('Começou com')
  await expect(page.getByText('Últimos 12 meses')).toBeVisible()
  await expect(page.getByRole('row', { name: /Aluguel da sala/ })).toHaveCount(2)
})

test('parcelas no caso, conta criada na hora, observação e auditoria legível', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Casos' }).click()
  await expect(page.getByRole('heading', { name: 'Casos', exact: true })).toBeVisible()
  await page.getByRole('row', { name: /Ação Trabalhista/ }).click()

  await expect(page.getByRole('heading', { name: 'Cobranças e parcelas do caso' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '2/3', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Registrar pagamento' }).first().click()

  await page.getByLabel('Entrou em *').selectOption({ label: '+ Cadastrar nova conta…' })
  await page.getByLabel('Nome da nova conta').fill('Caixa Econômica')
  await page.getByRole('button', { name: 'Cadastrar', exact: true }).click()
  await expect(page.getByLabel('Entrou em *')).toHaveValue(/.+/)
  await expect(page.getByLabel('Entrou em *').locator('option:checked')).toHaveText('Caixa Econômica')

  await page.getByLabel('Observações').fill('Pago no escritório, cliente trouxe em mãos')
  await page.getByRole('button', { name: 'Confirmar recebimento' }).click()
  await expect(page.getByText(/Pagamento registrado/)).toBeVisible()
  const recebimentos = page.locator('.recebimentos-parcela').filter({ hasText: 'Caixa Econômica' })
  await expect(recebimentos).toContainText('Pago no escritório, cliente trouxe em mãos')

  await page.getByRole('link', { name: 'Caixa', exact: true }).click()
  await expect(extrato(page, 'Pago no escritório')).toContainText('Caixa Econômica')

  await page.getByRole('link', { name: 'Auditoria' }).click()
  await page.getByRole('button', { name: 'Tudo' }).click()
  await page.getByRole('row', { name: /Cadastrou o caso “Ação Trabalhista”/ }).click()
  const detalhe = page.getByRole('dialog')
  await expect(detalhe.getByRole('rowheader', { name: 'Cobrança' })).toBeVisible()
  await expect(detalhe.getByRole('rowheader', { name: '1º vencimento' })).toBeVisible()
  await expect(detalhe.getByRole('rowheader', { name: 'Divisão do caso' })).toBeVisible()
  await expect(detalhe).not.toContainText('{"')
})

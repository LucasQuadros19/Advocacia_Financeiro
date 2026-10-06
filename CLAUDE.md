# Sistema Financeiro

## Stack

- Node.js
- TypeScript
- Fastify
- PostgreSQL
- Vue 3
- Docker
- Playwright

## Arquitetura

- Começar como monólito modular.
- Não criar microserviços sem necessidade real.
- Separar funcionalidades por módulos.
- Usar PostgreSQL como banco principal.

# Princípios gerais

- Priorizar código simples, legível e manutenível.
- Evitar overengineering.
- Não criar abstrações, serviços ou camadas sem necessidade real.
- Antes de adicionar uma dependência, verificar se a linguagem, framework ou biblioteca existente já resolve o problema.
- Não adicionar tecnologias apenas porque são populares ou "modernas".
- Reutilizar código existente quando fizer sentido.
- Não duplicar lógica desnecessariamente.
- Manter funções e módulos com responsabilidades claras.
- Explicar decisões arquiteturais importantes.
- Nao fazer comentarios no codigo se nao for requerido

## Banco de dados

- Evitar consultas sem limite que possam retornar grandes quantidades de dados.
- Listagens devem utilizar paginação quando puderem crescer significativamente.
- Definir limite máximo para paginação.
- Não utilizar `SELECT *` quando apenas algumas colunas forem necessárias.
- Selecionar apenas os campos necessários.
- Evitar N+1 queries.
- Verificar índices quando houver consultas frequentes sobre grandes volumes.
- Não criar índices sem justificativa.
- Evitar carregar tabelas inteiras na memória da aplicação.
- Preferir agregações no banco quando apropriado.
- Usar migrations para alterações estruturais.
- Não alterar estrutura do banco manualmente quando o projeto utilizar migrations.
- Analisar consultas potencialmente pesadas.

## Segurança

A segurança deve ser considerada em toda implementação.

Verificar:

- Autenticação.
- Autorização.
- Validação de entradas.
- SQL Injection.
- XSS.
- CSRF quando aplicável.
- IDOR/BOLA.
- Command Injection.
- Path Traversal.
- Uploads de arquivos.
- Exposição de informações sensíveis.
- Secrets e credenciais.
- Logs contendo informações sensíveis.
- Dependências vulneráveis.
- Configurações inseguras.

Regras:

- Nunca colocar senhas, tokens ou chaves diretamente no código.
- Nunca versionar arquivos `.env` contendo secrets.
- Nunca confiar apenas na validação do frontend.
- Validar dados também no backend.
- Nunca assumir que um ID fornecido pelo usuário é autorizado.
- Não retornar dados que o usuário não precisa receber.
- Não expor stack traces ou informações internas em produção.
- Nunca afirmar que o sistema está "100% seguro".


Antes de considerar uma funcionalidade concluída, verificar:

- validação de entrada
- exposição de dados sensíveis
- secrets hardcoded
- problemas de configuração

## Testes

Toda funcionalidade importante deve possuir testes.

Usar:

- testes unitários quando necessário
- Playwright para fluxos críticos


## API

- Validar todos os dados recebidos.
- Listagens devem possuir paginação quando necessário.
- Nunca permitir que o cliente solicite quantidade ilimitada de registros.
- Retornar somente os campos necessários.
- Evitar respostas JSON excessivamente grandes.
- Aplicar filtros e ordenação no banco quando apropriado.
- Evitar chamadas desnecessárias ao banco.
- Evitar chamadas repetidas para os mesmos dados.
- Utilizar cache somente quando houver necessidade real.

## Performance

Sempre considerar:

- Tempo de resposta.
- Quantidade de consultas ao banco.
- Tamanho das respostas.
- Uso de memória.
- Uso de CPU.
- Quantidade de requisições.
- Renderização no frontend.
- Tamanho de arquivos.
- Tamanho de imagens.

Antes de adicionar Redis, cache, filas, microserviços ou outras infraestruturas, verificar se realmente existe necessidade.

Não otimizar cegamente.
Primeiro identificar o possível gargalo.

Antes de instalar uma dependência:

1. Verificar se já existe uma solução no projeto.
2. Verificar se a linguagem possui solução nativa.
3. Verificar se o framework já oferece a funcionalidade.
4. Avaliar manutenção e segurança da dependência.
5. Adicionar somente se houver benefício real.

## Arquitetura

- Começar simples.
- Não criar microserviços sem necessidade real.
- Não criar camadas apenas por padrão arquitetural.
- Separar responsabilidades quando isso melhorar manutenção e evolução.
- Considerar crescimento futuro sem implementar complexidade prematuramente.
- Preferir arquitetura que possa evoluir gradualmente.

## Grandes volumes de dados

Ao implementar uma funcionalidade, considerar seu comportamento com 10x e 100x mais dados.

- Não carregar grandes conjuntos de dados completamente na memória.
- Não retornar listas ilimitadas pela API.
- Utilizar paginação quando necessário.
- Evitar renderizar milhares de elementos simultaneamente no frontend.
- Utilizar processamento em lotes ou streaming quando apropriado.

## Regra importante

Antes de implementar uma solução:

1. Entender o problema.
2. Verificar se já existe implementação.
3. Procurar solução simples.
4. Verificar se uma biblioteca existente resolve.
5. Só então criar uma nova abstração ou dependência.

## UI/UX

### Tipo de produto
- Ferramenta interna (admin/dashboard), não produto consumer/marketing.
- Usuários: equipe interna (poucos usuários, uso diário, não precisa "vender" a marca).
- Categoria de referência: Internal Tool / Personal Finance Tracker / Invoice & Billing (não Fintech consumer-facing, não Landing Page).

### Estilo
- Sóbrio, profissional, confiável — não "viajado".
- EVITAR: glassmorphism pesado, gradientes tipo "IA" (roxo/rosa), neumorphism, bento grids decorativos, animações chamativas, dark mode forçado como padrão.
- Preferir: layout denso e funcional, hierarquia visual clara, whitespace controlado (não exagerado), componentes previsíveis (tabelas, formulários, cards simples).
- Paleta: neutra (cinzas/brancos) com 1 cor de destaque só para ações primárias e estados (sucesso/erro/alerta). Nada de paleta "alegre".
- Tipografia: sans-serif padrão, sem pares decorativos - foco em legibilidade em tabelas e números.

### Padrões obrigatórios (dado que é financeiro)
- Tabelas com paginação, ordenação e filtros (bate com as regras de banco que você já tem).
- Números monetários sempre alinhados à direita, com formatação consistente (moeda, casas decimais).
- Estados de loading/erro/vazio explícitos em toda listagem.
- Confirmação explícita (modal/dupla checagem) antes de qualquer ação destrutiva ou financeira irreversível.
- Nada de emoji como ícone — usar SVG (Heroicons/Lucide, conforme já é o padrão do skill).
- Acessibilidade mínima: contraste 4.5:1, foco visível por teclado (útil pra digitação rápida em uso interno).


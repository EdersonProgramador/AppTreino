# PDR - App Treino

## 1. Visao Geral

O App Treino sera uma plataforma de acompanhamento fitness com area publica de vendas, painel administrativo, area do aluno, aplicativo mobile e suporte a pagamentos recorrentes via Asaas.

O objetivo inicial e validar uma operacao completa de assinatura fitness: apresentar o produto, vender planos, cadastrar alunos, liberar treinos, acompanhar evolucao, registrar frequencia automaticamente e oferecer atendimento com historico.

## 2. Objetivos do Produto

- Criar uma landing page clara para captacao e conversao de novos usuarios.
- Permitir que administradores gerenciem alunos, treinos, matriculas, pagamentos, avaliacoes, eventos e atendimentos.
- Permitir que usuarios consultem perfil, treinos, matricula, pagamentos, avaliacoes, frequencia, eventos e suporte.
- Registrar frequencia automaticamente a partir de acessos diarios do usuario.
- Integrar pagamentos com Asaas para cobrancas mensais e anuais.
- Preparar base tecnica para evoluir o Agente de Treino IA.

## 3. Publico-Alvo

- Alunos que treinam de forma recorrente e querem acompanhar plano, evolucao e pagamentos.
- Personal trainers, assessorias ou academias que precisam organizar treinos, alunos e relacionamento.
- Administradores da operacao, responsaveis por cadastro, suporte, eventos e controle financeiro.

## 4. Escopo Inicial

### Landing Page

Menu principal:

- Logo
- Recursos
- Planos
- Entrar
- Teste gratuitamente

Secoes previstas:

- Hero com headline, subheadline, botao principal e imagem.
- Para quem e o App Treino.
- Beneficios principais da plataforma.
- Recursos do App Treino.
- Agente de Treino online.
- Planos mensal e anual.
- Perguntas frequentes.
- Chamada final para conversao.
- Footer com links, suporte, legal, Instagram e TikTok.

Planos comerciais iniciais:

- Mensal: R$ 97,00
- Anual: R$ 1.047,00

### Painel Administrativo

- Cadastro e edicao de perfis de usuario.
- Cadastro e gerenciamento de treinos.
- Cadastro e gerenciamento de matriculas.
- Cadastro, consulta e conciliacao de pagamentos.
- Cadastro e acompanhamento de avaliacoes fisicas.
- Frequencia automatica baseada no acesso diario do usuario.
- Cadastro e gerenciamento de eventos.
- Atendimento ao usuario via chat com historico.

### Area do Usuario

- Perfil com dados cadastrais.
- Treino com ficha atual.
- Matricula com plano ativo e historico.
- Pagamentos com central de cobrancas.
- Avaliacoes com evolucao.
- Frequencia com calendario de acessos.
- Eventos disponiveis.
- Contato e atendimento com historico de conversas.
- Agente de Treino IA.

## 5. MVP Recomendado

Para iniciar com menor risco, o projeto deve ser dividido em fases. A primeira entrega deve validar a jornada essencial sem tentar construir todos os recursos avancados ao mesmo tempo.

### MVP 1 - Base Comercial e Operacional

Entregar primeiro:

- Landing page responsiva.
- Autenticacao de administrador e usuario.
- Cadastro de usuarios.
- Cadastro de treinos.
- Vinculo de treino ao usuario.
- Cadastro de matriculas.
- Planos mensal e anual.
- Integracao inicial com Asaas para criacao de cobranca.
- Area do usuario com perfil, treino, matricula e pagamentos.
- Registro automatico de frequencia por login/acesso diario.

Ficar para depois:

- Chat completo.
- Agente de Treino IA.
- Eventos.
- Avaliacoes avancadas com graficos.
- Automacoes complexas de cobranca.

### MVP 2 - Relacionamento e Evolucao

- Avaliacoes fisicas.
- Historico visual de evolucao.
- Eventos.
- Atendimento via chat.
- Notificacoes basicas.
- Melhorias no painel administrativo.

### MVP 3 - Inteligencia e Mobile

- Aplicativo React Native.
- Agente de Treino IA.
- Recomendacoes personalizadas.
- Push notifications.
- Experiencia mobile completa.

## 6. Stack Tecnica

### Front-end Web

- React.js
- TypeScript
- Vite
- React Router
- TanStack Query para dados remotos
- Zod para validacao de formularios e contratos
- React Hook Form para formularios
- Tailwind CSS ou CSS Modules, conforme preferencia de design system

### Back-end

- Node.js
- TypeScript
- Fastify ou Express
- Prisma ORM
- MySQL
- JWT com refresh token ou sessao segura
- Zod para validacao de entrada

### Mobile

- React Native
- Expo, se a prioridade for velocidade de desenvolvimento
- React Navigation
- TanStack Query

### Pagamentos

- Asaas para clientes, assinaturas/cobrancas e webhooks.
- Webhook para atualizar status de pagamento no banco.

### Infraestrutura Inicial

- Banco MySQL em ambiente gerenciado ou container local para desenvolvimento.
- API Node.js separada do front-end.
- Deploy front-end em Vercel, Netlify ou similar.
- Deploy back-end em Render, Railway, Fly.io, VPS ou ambiente cloud equivalente.
- Variaveis de ambiente para segredos e credenciais.

## 7. Arquitetura Recomendada

Estrutura sugerida em monorepo:

```txt
app-treino/
  apps/
    web/
    api/
    mobile/
  packages/
    shared/
  docs/
  README.md
```

Responsabilidades:

- `apps/web`: landing page, painel administrativo e area do usuario.
- `apps/api`: regras de negocio, autenticacao, banco, webhooks e integracoes.
- `apps/mobile`: app React Native.
- `packages/shared`: tipos, validacoes e utilitarios compartilhados.
- `docs`: documentacao de produto, arquitetura e decisoes tecnicas.

Como o projeto ainda esta vazio, uma alternativa mais simples para comecar e criar primeiro `apps/web` e `apps/api`. O app mobile pode entrar quando a API e os fluxos principais estiverem estabilizados.

## 8. Modulos Principais

### Autenticacao e Autorizacao

Perfis iniciais:

- Administrador
- Usuario

Regras:

- Administrador acessa painel de gestao.
- Usuario acessa apenas seus proprios dados.
- Rotas protegidas por autenticao.
- Permissoes checadas tambem no back-end, nao apenas no front-end.

### Usuarios e Perfis

Dados sugeridos:

- Nome
- E-mail
- Telefone
- CPF, se necessario para cobranca
- Data de nascimento
- Objetivo de treino
- Nivel de treino
- Status ativo/inativo

### Treinos

Entidades sugeridas:

- Treino
- Dia de treino
- Exercicio
- Series, repeticoes, carga, intervalo e observacoes

### Matriculas

Dados sugeridos:

- Usuario
- Plano
- Data de inicio
- Data de fim, quando aplicavel
- Status: ativa, pendente, vencida, cancelada

### Pagamentos

Dados sugeridos:

- Usuario
- Matricula
- Plano
- Valor
- Status
- Vencimento
- ID externo do Asaas
- Link de pagamento
- Data de pagamento

### Frequencia

Regra inicial:

- Ao usuario autenticado acessar a area logada, criar um registro de frequencia para o dia se ainda nao existir.
- A frequencia deve ser unica por usuario e data.
- O usuario visualiza o historico em calendario.
- O administrador pode consultar frequencia por aluno e periodo.

### Avaliacoes

Dados sugeridos:

- Peso
- Altura
- Medidas corporais
- Percentual de gordura, se houver
- Fotos, em fase posterior
- Observacoes do avaliador
- Data da avaliacao

### Eventos

Dados sugeridos:

- Titulo
- Descricao
- Data e horario
- Local ou link
- Status
- Usuarios inscritos, se necessario

### Atendimento

Versao inicial:

- Mensagens entre usuario e administrador.
- Historico por conversa.
- Status: aberto, em atendimento, encerrado.

Versao posterior:

- Notificacoes.
- Anexos.
- Atendimento automatizado com IA.

### Agente de Treino IA

Nao deve ser o primeiro bloco do projeto. Ele depende de dados confiaveis de usuario, treino e historico.

Primeira versao recomendada:

- Chat orientativo baseado no treino cadastrado.
- Respostas com aviso de que nao substitui profissional de saude/educacao fisica.
- Limites claros para nao prescrever condutas medicas.

## 9. Modelo de Dados Inicial

Tabelas sugeridas para o MVP:

- `users`
- `profiles`
- `plans`
- `memberships`
- `payments`
- `workouts`
- `workout_days`
- `exercises`
- `workout_assignments`
- `attendance_records`
- `physical_assessments`
- `events`
- `support_conversations`
- `support_messages`

Relacionamentos principais:

- Um usuario possui um perfil.
- Um usuario pode ter varias matriculas.
- Uma matricula pertence a um plano.
- Uma matricula pode ter varios pagamentos.
- Um treino pode ter varios dias.
- Um dia de treino pode ter varios exercicios.
- Um usuario pode ter um ou mais treinos atribuidos.
- Um usuario tem varios registros de frequencia.
- Um usuario tem varias avaliacoes.
- Uma conversa possui varias mensagens.

## 10. API Inicial

Rotas sugeridas:

```txt
POST   /auth/register
POST   /auth/login
POST   /auth/logout
GET    /me

GET    /admin/users
POST   /admin/users
GET    /admin/users/:id
PUT    /admin/users/:id

GET    /admin/workouts
POST   /admin/workouts
PUT    /admin/workouts/:id
POST   /admin/workouts/:id/assign

GET    /admin/memberships
POST   /admin/memberships
PUT    /admin/memberships/:id

GET    /admin/payments
POST   /admin/payments

GET    /user/profile
PUT    /user/profile
GET    /user/workout
GET    /user/membership
GET    /user/payments
GET    /user/attendance

POST   /webhooks/asaas
```

## 11. Integracao com Asaas

Fluxo recomendado:

1. Usuario escolhe plano mensal ou anual.
2. Sistema cria ou localiza cliente no Asaas.
3. Sistema cria cobranca ou assinatura.
4. API salva ID externo, valor, vencimento, status e link de pagamento.
5. Usuario e direcionado para pagamento.
6. Asaas envia webhook ao back-end.
7. Back-end valida o webhook e atualiza o pagamento.
8. Matricula e ativada ou renovada conforme status recebido.

Cuidados:

- Nunca confiar apenas no retorno do front-end.
- Webhook deve ser idempotente.
- Registrar eventos recebidos para auditoria.
- Usar variaveis de ambiente para credenciais.

## 12. Design e UX

Direcao visual recomendada:

- Interface moderna, limpa e objetiva.
- Landing page com foco em conversao.
- Painel administrativo denso, organizado e facil de escanear.
- Area do usuario simples, com acesso rapido ao treino e pagamentos.
- Mobile-first nos fluxos do aluno.

Componentes prioritarios:

- Menu responsivo.
- Cards de planos.
- Formularios de cadastro.
- Tabelas administrativas.
- Calendario de frequencia.
- Timeline ou lista de avaliacoes.
- Chat de atendimento.

## 13. Sequencia Recomendada Para Inicializar o Projeto

### Etapa 1 - Preparacao

- Criar repositorio com monorepo.
- Configurar TypeScript.
- Configurar lint e formatacao.
- Criar `.env.example`.
- Criar README com comandos de desenvolvimento.

### Etapa 2 - Back-end Base

- Criar API Node.js.
- Configurar Prisma e MySQL.
- Criar migrations iniciais.
- Implementar autenticacao.
- Implementar usuarios e perfis.
- Implementar planos, matriculas e pagamentos.

### Etapa 3 - Front-end Base

- Criar app React.
- Configurar rotas publicas e privadas.
- Implementar landing page.
- Implementar login.
- Implementar painel administrativo basico.
- Implementar area do usuario.

### Etapa 4 - Fluxo Comercial

- Integrar escolha de planos.
- Criar cobrancas no Asaas.
- Processar webhooks.
- Atualizar status de pagamento e matricula.

### Etapa 5 - Treinos e Frequencia

- Implementar CRUD de treinos.
- Atribuir treino ao usuario.
- Exibir treino para usuario.
- Registrar frequencia automatica no acesso diario.
- Exibir calendario de frequencia.

### Etapa 6 - Expansao

- Avaliacoes.
- Eventos.
- Chat.
- Aplicativo mobile.
- Agente de Treino IA.

## 14. Riscos e Decisoes Importantes

- Comecar com web antes do mobile reduz retrabalho e acelera validacao.
- Pagamentos devem ser tratados com webhook e auditoria desde o inicio.
- O Agente IA deve ser faseado para evitar dependencia de dados ainda incompletos.
- O painel administrativo precisa de autorizacao robusta no back-end.
- O modelo de treinos deve ser simples no MVP, mas flexivel para evoluir.

## 15. Checklist de Inicio

- Definir nome final do produto: App Treino ou AppTreino.
- Definir identidade visual basica.
- Definir textos finais da landing page.
- Definir se havera teste gratuito e por quantos dias.
- Criar conta Asaas e credenciais de sandbox.
- Definir formato dos planos: cobranca avulsa recorrente ou assinatura.
- Criar schema inicial do banco.
- Implementar API base.
- Implementar landing page e autenticacao.
- Validar fluxo completo: cadastro, plano, pagamento, acesso e frequencia.

## 16. Criterio de Sucesso do MVP

O MVP sera considerado pronto quando for possivel:

- Um visitante acessar a landing page.
- Escolher um plano.
- Criar conta ou entrar.
- Gerar uma cobranca no Asaas.
- Ter matricula ativada apos confirmacao de pagamento.
- Acessar a area do usuario.
- Visualizar o treino atribuido.
- Registrar frequencia automaticamente no primeiro acesso do dia.
- Administrador consultar usuarios, matriculas, pagamentos, treinos e frequencia.


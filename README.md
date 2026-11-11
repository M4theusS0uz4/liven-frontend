# Liven Frontend

## Autenticação por e-mail e senha

O login usa `POST /api/v1/auth/login` com `{ email, senha }`, sem OTP.
O AuthContext valida a resposta `GlobalAuthResponse` e estabelece sessão global.
Sessões com contexto condominial autorizado abrem o dashboard original.
Contas globais mantêm o mesmo layout, sidebar e cabeçalho; a Visão geral mostra
a escolha entre vínculos autorizados ou a limitação de acesso quando não há vínculos.
Essa condição não substitui o aplicativo por uma tela isolada, nem libera dados protegidos.

Cadastro em `/register`:

- `POST /api/v1/auth/register/request-otp`: `{ email, senha }`.
- `POST /api/v1/auth/register/resend-otp`: `{ email }`.
- `POST /api/v1/auth/register/verify-otp`: `{ email, senha, codigo }`.

A senha exige 8–128 caracteres e confirmação igual. A confirmação OTP exige
HTTP 201 com conta e tokens válidos antes de autenticar automaticamente.
A solicitação genérica não confirma disponibilidade do e-mail ou entrega do código.

Contas antigas sem senha podem usar `/password/setup`:

- `POST /api/v1/auth/password/setup/request-otp`: `{ email, senha }`.
- `POST /api/v1/auth/password/setup/verify-otp`: `{ email, senha, codigo }`.

Esse fluxo confirma o e-mail e autentica com HTTP 200. Seu reenvio repete a
solicitação de definição: não há endpoint separado para essa operação.
Não é recuperação de senha para contas que já possuem senha.

Senhas ficam apenas no estado do formulário; não são gravadas em storage ou logs.
Espaços externos do e-mail são removidos; a senha não é aparada.
Tokens ficam em memória/sessionStorage, sem identidade persistida como autorização.
Revalidação, renovação e logout globais continuam usando `/auth/global/me`,
`/auth/global/refresh` e `/auth/global/logout`. O backend não fornece vínculo
condominial nessa resposta; tokens globais não são enviados aos módulos protegidos.

OTP usa campo único de seis dígitos. O cooldown usa `Retry-After` quando disponível,
com intervalo visual de 60 segundos na ausência; limites reais e expiração são
responsabilidade do backend. Os testes simulam HTTP, sem envio real de códigos.
Integração real e interação/responsividade no navegador permanecem pendentes.

React 19, TypeScript, Vite e Tailwind CSS. O backend e a infraestrutura estão em repositório separado.

## Desenvolvimento

Use uma versão de Node compatível com as dependências do lockfile (Node 22.12+ na linha 22, ou uma versão posterior compatível).

```sh
cd frontend
npm ci
cp .env.example .env.local
```

Preencha `VITE_CONDOMINIO_ID` em `.env.local` com o ID de um condomínio ativo **existente no PostgreSQL**. Não há descoberta pública de condomínios no contrato atual. Essa é uma configuração da instalação, não uma escolha de privilégios pelo usuário. O ID não é segredo; o backend deve validar os vínculos.

Na instalação local inspecionada, a consulta somente leitura identificou o condomínio `1`, “Condomínio principal”, ativo. O `.env.local` local foi configurado com esse ID e é ignorado pelo Git; em outra instalação, confirme o cadastro real.

```env
VITE_CONDOMINIO_ID=1
VITE_API_URL=/api/v1
```

```sh
npm run dev
```

Abra `http://localhost:5173`. O proxy do Vite encaminha `/api` a `http://localhost:8000`. Reinicie o Vite após alterar `.env.local`. Em produção configure o proxy do servidor para `/api`, ou uma `VITE_API_URL` absoluta com CORS apropriado no backend; o proxy de desenvolvimento não é parte do build.

## Referência histórica: autenticação OTP legada

Esta seção documenta o fluxo anterior. O login atual é por senha, conforme os
contratos acima; os endpoints OTP de login foram descontinuados pelo backend.

Contratos conferidos em `backend/schemas/auth.py`, `backend/routers/auth.py`, `backend/security.py` do backend vizinho e no OpenAPI local.

| Etapa | Endpoint | Payload / autenticação |
|---|---|---|
| Solicitar | `POST /api/v1/auth/request-otp` | `{email, condominio_id}`, sem Bearer |
| Verificar | `POST /api/v1/auth/verify-otp` | `{email, condominio_id, codigo}`, sem Bearer |
| Identificar usuário | `GET /api/v1/me` | Bearer recebido da verificação |
| Renovar | `POST /api/v1/auth/refresh` | `{refresh_token}`, sem Bearer |
| Encerrar | `POST /api/v1/auth/logout` | `{refresh_token}` e Bearer |

O login usa e-mail cadastrado em `Usuario`, normalizado com remoção de espaços externos e minúsculas. O backend valida o formato e a unicidade por condomínio; o frontend faz uma validação preliminar. O telefone continua nos cadastros de contato e não autentica. E-mails de moradores não são copiados automaticamente para contas.

A solicitação precisa ser aceita pela API antes de mostrar a verificação. A mensagem de aceitação não confirma entrega de SMS nem existência da conta. Os cards Morador, Portaria e Síndico preservam sua aparência e seleção visual; não são enviados à API. Apenas `/me` define o perfil e o condomínio do usuário autenticado. O endpoint antigo `/auth/login` não é utilizado.

O formulário bloqueia operações simultâneas, exige seis dígitos, permite trocar e-mail e reenviar. Há intervalo visual de 60 segundos, mantido ao trocar e-mail ou remontar a tela. HTTP 429 aplica `Retry-After` quando fornecido, com fallback visual de 60 segundos. O backend continua responsável pelo limite real: recarregar a página não elimina os limites impostos no servidor. O contrato atual não fornece o prazo restante de reenvio; aceitação genérica também não garante emissão de um novo código.

### Demonstração acadêmica

No backend, configure `APP_ENV=development` e `MOCK_OTP=true`, seguindo as instruções do repositório dele. Quando a resposta **real** da API contiver `codigo_mock`, o frontend em desenvolvimento exibe o código e permite copiá-lo. Não existe código fixo nem validação local que substitua o backend.

O aviso informa: “Ambiente de demonstração: utilize o código de teste abaixo. Nenhum SMS foi enviado.” Esse fluxo não comprova posse do telefone. O código permanece somente no estado do componente e é descartado ao reenviar, alterar telefone ou sair da tela; não é gravado em storage. Builds de produção não exibem o código, mesmo que o backend o retorne indevidamente. O backend também deve impedir seu retorno em produção e disponibilizar entrega real de OTP.

### Sessão e segurança

A sessão só é estabelecida depois de tokens válidos e resposta de `/me` com usuário ativo, perfil conhecido e condomínio correspondente à solicitação. Não confiamos em usuário salvo no navegador; sessões legadas são descartadas. Na abertura/recarregamento há loading durante revalidação e opção de tentar novamente em falha de rede.

Access token, refresh token, duração e instante de expiração ficam em memória e em `sessionStorage` da aba para permitir recarregamento. JSON inválido é removido. Se storage estiver bloqueado, a sessão usa apenas memória. O usuário não é persistido como fonte de autorização.

**Limitação:** o contrato atual entrega tokens JSON, sem cookies HttpOnly. `sessionStorage` é acessível a JavaScript e não protege contra XSS; encerrar a aba não revoga automaticamente o refresh token remoto. Uma proteção por cookies exige suporte do backend, que não foi inventado neste frontend.

A renovação é antecipada e compartilhada entre requisições concorrentes; um 401 protegido permite somente uma renovação e uma repetição. OTP incorreto nunca dispara refresh. Refresh inválido remove a sessão; falha transitória permite nova tentativa controlada. O logout remove a sessão local imediatamente e solicita revogação ao servidor; se o access token expirou, tenta renovar e revogar a sessão resultante sem restaurar o login local. Falha de revogação remota é informada.

## Testes

```sh
cd frontend
npm test
npm run lint
npm run build
```

Os testes automatizados usam o runner nativo do Node e compilam os módulos TypeScript reais em memória com o esbuild já trazido pelo Vite. `fetch` é simulado para verificar payloads, headers, erros, timeout, sessão, concorrência de refresh, logout e os três perfis. Esses testes não substituem a integração com FastAPI/PostgreSQL nem testes de interação no navegador.

Smoke test opcional contra a API real, sem criar usuários ou executar seed:

```sh
LIVEN_TEST_UNKNOWN_EMAIL=TELEFONE_NAO_CADASTRADO \
LIVEN_TEST_CONDOMINIO_ID=ID_REAL \
npm run test:integration
```

Use somente um e-mail confirmado como não cadastrado. Opcionalmente defina `LIVEN_TEST_API_URL`; o padrão é `http://localhost:8000/api/v1`. O teste consulta OpenAPI, solicita OTP para o e-mail não cadastrado, verifica rejeição de código, acesso anônimo a `/me` e refresh inválido. A solicitação pode consumir o rate limit do backend.

### Validar com usuários existentes

1. Consulte, por procedimento administrativo autorizado no backend, `condominios` e `usuarios`; confirme usuário ativo, condomínio ativo, telefone exato e perfil. Não use o login antigo para criar ou promover usuários.
2. Configure o ID real e inicie frontend e backend.
3. Solicite o código para o telefone cadastrado. Em demonstração, use o código que a API retornou nessa solicitação; em produção, o código entregue pelo provedor.
4. Verifique no painel de rede a sequência `request-otp → verify-otp → me`. O payload não deve conter `perfil`; `/me` deve retornar o perfil cadastrado, independentemente do card selecionado.
5. Confira a navegação permitida, recarregue a página, valide renovação/expiração e use Sair. Repita com usuários existentes de cada perfil.
6. Teste código incorreto, expirado e consumido, telefone inválido/não cadastrado, usuário inativo, reenvio e 429, além de indisponibilidade de rede.

Na consulta local desta implementação não havia usuários ativos. Portanto login bem-sucedido, renovação/logout válidos e os três perfis reais dependem de cadastro administrativo no backend e **não foram declarados validados**. O backend retorna a mesma resposta 401 para código incorreto, expirado, usuário inativo/não cadastrado e tentativas esgotadas; o frontend não inventa uma distinção inexistente. Para exibir prazos precisos de reenvio/bloqueio, o backend precisará documentar metadados ou `Retry-After`.


A migração `20261110_0008` do backend precisa ser aplicada pelo operador antes de usar este frontend. Nenhuma migration foi aplicada nesta alteração. Consulte `backend/docs/OTP.md` no repositório backend para provisionamento explícito, Resend e credenciais. O serviço real exige remetente/domínio verificado e configuração do servidor; o mock local não envia mensagens.

# Contratos de autenticação conferidos

Referência local: `/Users/mateus/Downloads/liven-backend-main/backend`, arquivos
`routers/registration.py`, `routers/auth.py`, `schemas/registration.py` e
`services/global_auth.py`. A versão implantada não foi consultada.

Todos os caminhos abaixo têm prefixo `/api/v1`. POSTs usam JSON.

| Operação | Endpoint | Corpo | Sucesso |
| --- | --- | --- | --- |
| Cadastro | POST /auth/register/request-otp | email, senha | 200 genérico |
| Reenvio | POST /auth/register/resend-otp | email | 200 genérico |
| Confirmar cadastro | POST /auth/register/verify-otp | email, codigo, senha | 201 com GlobalAuthResponse |
| Login | POST /auth/login | email, senha | 200 com GlobalAuthResponse |
| Definir senha inicial | POST /auth/password/setup/request-otp | email, senha | 200 genérico |
| Confirmar senha inicial | POST /auth/password/setup/verify-otp | email, codigo, senha | 200 com GlobalAuthResponse |

A senha de cadastro tem 8–128 caracteres; o código é string de seis dígitos.
A verificação compara a senha com o hash pendente original. Reenvio não aceita
senha e preserva esse hash. Código incorreto, expirado, consumido, tentativas
esgotadas e senha divergente compartilham HTTP 401, sem distinção pública.

A resposta genérica pode representar envio, cooldown, conta inelegível ou falha
na entrega. Não confirma recebimento do e-mail. O frontend usa Retry-After quando
exposto pelo servidor e 60 segundos de espera visual na ausência; o backend local
não fornece prazo exato para todos os bloqueios. Os limites do servidor continuam
válidos após recarga da página. Envio e verificação têm controles visuais separados.

GlobalAuthResponse contém tokens, conta verificada, scope, usuario e vinculos.
O backend seleciona automaticamente exatamente um vínculo autorizado. Sem vínculo,
a conta permanece global e vê orientação de autorização. Com múltiplos vínculos,
a seleção usa POST /auth/global/select-condominio com usuario_id e Bearer.
Nenhum perfil ou vínculo é criado pelo frontend.

Tokens ficam em memória/sessionStorage. A confirmação não é abortada no transporte:
se o servidor já emitiu tokens após cancelamento da tela, o contexto rejeita sua
persistência e tenta revogá-los. Falha de rede pode impedir confirmação dessa
revogação, mas nunca restaura a sessão local. Solicitações de envio são canceláveis.

Testes usam HTTP simulado e um agendador determinístico para handlers/hooks reais.
Não substituem testes de navegador nem validam entrega real de e-mail.
O script test:integration existente é legado e pode solicitar OTP real;
não foi executado nesta correção.

# Segurança, privacidade e LGPD — Brasil BI

Este documento separa com clareza **o que já é garantido hoje** (aplicação
cliente) do **que depende do back-end** descrito em `ARQUITETURA.md`. Nada aqui
descreve como "pronto" algo que ainda não está implementado.

---

## 1. Modelo de ameaça da versão atual

A aplicação roda inteiramente no navegador do usuário. Isso muda o mapa de riscos:

| Risco | Situação |
| --- | --- |
| Vazamento em trânsito | **Não se aplica**: nenhum dado do usuário é transmitido. Os arquivos são lidos com a File API e processados em memória. |
| Vazamento no servidor | **Não se aplica**: não há servidor de dados. O hosting serve apenas HTML/CSS/JS estáticos. |
| Acesso de terceiros ao dispositivo | **Risco real**: quem tiver acesso ao perfil do navegador vê os dados. Mitigação atual: botão "Apagar tudo" e orientação de uso em máquina confiável. |
| XSS | Mitigado: a construção de DOM usa `textContent` (helper `el`), não `innerHTML`, para todo conteúdo vindo de arquivo. `innerHTML` só é usado com SVG estático de ícones definido no código. |
| Dependências maliciosas | **Não se aplica**: zero dependências de terceiros em runtime. A única requisição externa é a fonte tipográfica (opcional, com fallback). |
| Perda de dados | Risco: limpar o navegador apaga tudo. Mitigação: aviso quando o armazenamento não é durável e exportação de configuração/dados. |

### O que NÃO existe nesta versão (e está sinalizado na interface)

- Login, sessão, 2FA e recuperação de senha.
- Separação real entre usuários — os perfis são uma matriz de permissões
  documentada, não um controle aplicado.
- Links compartilhados com senha e expiração **aplicadas** (o link atual carrega
  apenas a configuração do painel; os dados vêm do navegador de quem abre).
- Criptografia em repouso, logs de acesso do servidor e backup gerenciado.

Cada uma dessas telas exibe um aviso explícito. A regra adotada foi: **é melhor
declarar o limite do que dar falsa sensação de segurança.**

---

## 2. Privacidade e LGPD hoje

| Princípio (LGPD) | Como é atendido |
| --- | --- |
| Finalidade e necessidade | Só é processado o arquivo que o usuário escolhe importar; nenhuma coleta implícita, telemetria ou analytics. |
| Transparência | A tela de importação e as configurações informam onde os dados ficam e o que sai (ou não) do dispositivo. |
| Segurança | Dados nunca trafegam; ficam restritos ao perfil do navegador. |
| Eliminação | "Apagar tudo" remove IndexedDB + localStorage de forma definitiva; excluir uma fonte apaga suas linhas imediatamente. |
| Portabilidade | Exportação em CSV, XLSX e JSON a qualquer momento, além do backup da configuração. |
| Registro de operações | Trilha local de atividades (importações, exclusões, criação de painéis). |

**Atenção ao dado pessoal.** Planilhas de vendas frequentemente contêm CPF,
telefone e e-mail. Recomendações operacionais:

1. Remova colunas de dado pessoal que não sejam necessárias à análise — use
   "Remover coluna" no tratamento, antes de montar o painel.
2. Ao exportar PDF/CSV para terceiros, verifique se a tabela de registros
   detalhados não expõe identificadores.
3. Em máquina compartilhada, use "Apagar tudo" ao terminar.

---

## 3. Perfis e matriz de permissões (contrato para o back-end)

| Perfil | Importar | Tratar | Modelar | Criar painel | Editar painel | Exportar | Compartilhar | Usuários/config |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Administrador | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gestor | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Analista | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Editor | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Visualizador | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cliente | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ conforme o link | ❌ | ❌ |

Visualizador e Cliente podem aplicar filtros — isso não altera dados nem layout.

---

## 4. Especificação de segurança do back-end

Quando o servidor entrar, estes são os requisitos mínimos:

**Autenticação**
- Senhas com **argon2id** (nunca MD5/SHA simples).
- 2FA via TOTP; códigos de recuperação de uso único.
- Sessões em cookie `HttpOnly; Secure; SameSite=Lax`, rotação no login,
  expiração por inatividade (30 min) e absoluta (12 h).
- Recuperação de senha por token de uso único com validade de 30 min, sem
  revelar se o e-mail existe.
- Bloqueio progressivo após tentativas falhas + CAPTCHA a partir da 5ª.

**Autorização**
- RBAC pela matriz acima, verificado **no servidor** a cada requisição.
- Postgres com **Row Level Security** por `org_id` — defesa em profundidade
  contra bug de aplicação que esqueça o filtro de organização.

**Dados**
- TLS 1.3 obrigatório; HSTS.
- Criptografia em repouso: volumes do Postgres e bucket S3 com SSE-KMS.
- Uploads em bucket privado, acesso só por URL assinada de curta duração;
  validação de tipo real (magic bytes), limite de tamanho e varredura antivírus.
- Retenção configurável por organização, com expurgo automático.

**Compartilhamento**
- Token aleatório de 256 bits, hash no banco.
- Senha do link com argon2id; expiração verificada no servidor.
- Revogação imediata; toda abertura registrada no log de auditoria.

**Observabilidade**
- Log de auditoria imutável (quem, o quê, quando, IP, user-agent).
- Alertas de anomalia: exportações em massa, acessos fora do horário, muitas
  falhas de login.

**Cabeçalhos HTTP recomendados (válidos já para a versão estática)**

```
Content-Security-Policy: default-src 'self';
  style-src 'self' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob:;
  script-src 'self';
  connect-src 'self';
  frame-ancestors 'none';
  base-uri 'self'
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Permissions-Policy: geolocation=(), microphone=(), camera=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

> Observação: a aplicação não usa `eval` nem `new Function` — o motor de fórmulas
> tem lexer e parser próprios exatamente para permitir uma CSP sem
> `unsafe-eval`. Também não há `script` inline exceto o pequeno módulo do botão
> de recolher menu em `index.html`; se a CSP for aplicada sem `unsafe-inline`,
> mova esse trecho para um arquivo `.js` (é o único ajuste necessário).

---

## 5. Checklist antes de expor a plataforma a clientes

- [ ] Servir sobre HTTPS com os cabeçalhos acima.
- [ ] Definir política de retenção e informá-la na interface.
- [ ] Publicar aviso de privacidade explicando o processamento local.
- [ ] Treinar a equipe: remover dado pessoal desnecessário antes de importar.
- [ ] Implementar o back-end antes de prometer login, multiusuário ou links
      públicos protegidos.

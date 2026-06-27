# WhatsApp Business MCP Server

Servidor MCP (Model Context Protocol) em TypeScript que expõe ferramentas para interagir com a **WhatsApp Business Cloud API** (Meta Graph API) via stdio.

## Requisitos

- Node.js 18+
- Uma conta WhatsApp Business configurada na Meta (App, Phone Number ID, Business Account ID e token de acesso)

## Instalação

```bash
npm install
npm run build
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Sim | Token de acesso da Graph API com permissão para `whatsapp_business_messaging` / `whatsapp_business_management` |
| `WHATSAPP_PHONE_NUMBER_ID` | Sim | ID do número de telefone do WhatsApp Business |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Sim | ID da conta de negócios do WhatsApp (WABA) |
| `WHATSAPP_API_VERSION` | Não | Versão da Graph API (padrão: `v20.0`) |

O token de acesso **nunca** é exibido em logs, mensagens de erro ou nas respostas das ferramentas.

## Executando

```bash
WHATSAPP_ACCESS_TOKEN=xxx \
WHATSAPP_PHONE_NUMBER_ID=xxx \
WHATSAPP_BUSINESS_ACCOUNT_ID=xxx \
WHATSAPP_API_VERSION=v20.0 \
npm start
```

O servidor se comunica via **stdio**, seguindo o protocolo MCP.

### Configuração em um cliente MCP

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["/caminho/para/whatsapp-mcp-server/dist/index.js"],
      "env": {
        "WHATSAPP_ACCESS_TOKEN": "xxx",
        "WHATSAPP_PHONE_NUMBER_ID": "xxx",
        "WHATSAPP_BUSINESS_ACCOUNT_ID": "xxx",
        "WHATSAPP_API_VERSION": "v20.0"
      }
    }
  }
}
```

## Ferramentas disponíveis

### `send_text_message`

Envia uma mensagem de texto simples.

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `to` | `string` | Sim | Número do destinatário em formato E.164 (ex: `5511999999999`) |
| `message` | `string` | Sim | Conteúdo da mensagem |

### `send_template_message`

Envia uma mensagem baseada em template aprovado pela Meta.

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `to` | `string` | Sim | Número do destinatário em formato E.164 |
| `template_name` | `string` | Sim | Nome do template aprovado |
| `language_code` | `string` | Sim | Código de idioma do template (ex: `pt_BR`) |
| `parameters` | `string[]` | Não | Parâmetros de texto para o corpo do template, na ordem esperada |

### `get_business_profile`

Retorna o perfil de negócio (about, descrição, e-mail, sites, etc.) do número configurado. Não recebe parâmetros.

### `list_message_templates`

Lista os templates de mensagem cadastrados na conta (`WHATSAPP_BUSINESS_ACCOUNT_ID`).

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `limit` | `number` | Não | Número máximo de templates a retornar |

## Tratamento de erros

Erros retornados pela Graph API são capturados e devolvidos como conteúdo de erro da ferramenta (`isError: true`), com a mensagem de erro da Meta — sem nunca incluir o token de acesso.

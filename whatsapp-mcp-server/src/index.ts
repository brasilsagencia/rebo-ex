#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const API_VERSION = process.env.WHATSAPP_API_VERSION || "v20.0";

if (!ACCESS_TOKEN || !PHONE_NUMBER_ID || !BUSINESS_ACCOUNT_ID) {
  console.error(
    "Erro: defina as variáveis de ambiente WHATSAPP_ACCESS_TOKEN, " +
      "WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_BUSINESS_ACCOUNT_ID antes de iniciar o servidor."
  );
  process.exit(1);
}

const GRAPH_BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

class GraphApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
    this.name = "GraphApiError";
  }
}

async function graphRequest(
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string> } = {}
): Promise<unknown> {
  const url = new URL(`${GRAPH_BASE_URL}${path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message =
      (data as { error?: { message?: string } })?.error?.message ??
      `Requisição à Graph API falhou com status ${response.status}`;
    throw new GraphApiError(message, response.status, data);
  }

  return data;
}

function jsonResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(error: unknown) {
  const message =
    error instanceof GraphApiError
      ? `Erro da Graph API (status ${error.status}): ${error.message}`
      : error instanceof Error
      ? error.message
      : "Erro desconhecido";

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
  };
}

const server = new McpServer({
  name: "whatsapp-business-mcp-server",
  version: "1.0.0",
});

server.tool(
  "send_text_message",
  "Envia uma mensagem de texto via WhatsApp Business Cloud API.",
  {
    to: z.string().describe("Número de telefone do destinatário, em formato E.164 (ex: 5511999999999)"),
    message: z.string().min(1).describe("Conteúdo da mensagem de texto a ser enviada"),
  },
  async ({ to, message }) => {
    try {
      const data = await graphRequest(`/${PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        body: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body: message },
        },
      });
      return jsonResult(data);
    } catch (error) {
      return errorResult(error);
    }
  }
);

server.tool(
  "send_template_message",
  "Envia uma mensagem baseada em template aprovado via WhatsApp Business Cloud API.",
  {
    to: z.string().describe("Número de telefone do destinatário, em formato E.164 (ex: 5511999999999)"),
    template_name: z.string().min(1).describe("Nome do template aprovado na Meta"),
    language_code: z.string().min(1).describe("Código do idioma do template (ex: pt_BR, en_US)"),
    parameters: z
      .array(z.string())
      .optional()
      .describe("Lista opcional de parâmetros de texto para o corpo do template, na ordem esperada"),
  },
  async ({ to, template_name, language_code, parameters }) => {
    try {
      const components = parameters?.length
        ? [
            {
              type: "body",
              parameters: parameters.map((text) => ({ type: "text", text })),
            },
          ]
        : undefined;

      const data = await graphRequest(`/${PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        body: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          template: {
            name: template_name,
            language: { code: language_code },
            ...(components ? { components } : {}),
          },
        },
      });
      return jsonResult(data);
    } catch (error) {
      return errorResult(error);
    }
  }
);

server.tool(
  "get_business_profile",
  "Obtém o perfil de negócio (about, descrição, e-mail, sites, etc.) do número configurado.",
  {},
  async () => {
    try {
      const data = await graphRequest(`/${PHONE_NUMBER_ID}/whatsapp_business_profile`, {
        query: {
          fields: "about,address,description,email,profile_picture_url,websites,vertical",
        },
      });
      return jsonResult(data);
    } catch (error) {
      return errorResult(error);
    }
  }
);

server.tool(
  "list_message_templates",
  "Lista os templates de mensagem cadastrados na conta do WhatsApp Business.",
  {
    limit: z
      .number()
      .int()
      .positive()
      .max(100)
      .optional()
      .describe("Número máximo de templates a retornar (padrão da API caso omitido)"),
  },
  async ({ limit }) => {
    try {
      const data = await graphRequest(`/${BUSINESS_ACCOUNT_ID}/message_templates`, {
        query: limit ? { limit: String(limit) } : undefined,
      });
      return jsonResult(data);
    } catch (error) {
      return errorResult(error);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("WhatsApp Business MCP server rodando via stdio.");
}

main().catch((error) => {
  console.error("Falha ao iniciar o servidor MCP:", error instanceof Error ? error.message : error);
  process.exit(1);
});

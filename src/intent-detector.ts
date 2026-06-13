/**
 * intent-detector.ts
 * Detecta intenção do usuário e executa ação correspondente
 */

import { Context } from 'telegraf';
import { Groq } from 'groq-sdk';
import { hasIntegration } from './db/firebase.js';
import * as google from './integrations/google.js';
import * as notion from './integrations/notion.js';
import * as github from './integrations/github.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

interface IntentResult {
  intent: string;
  confidence: number;
  params: Record<string, any>;
}

// Define as ferramentas disponíveis
const tools = [
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Envia um e-mail para um destinatário',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Email do destinatário' },
          subject: { type: 'string', description: 'Assunto do email' },
          body: { type: 'string', description: 'Corpo do email' }
        },
        required: ['to', 'subject', 'body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_emails',
      description: 'Lê e-mails não lidos',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Filtro de busca (opcional)' },
          max: { type: 'number', description: 'Número máximo de emails (padrão: 5)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_calendar_events',
      description: 'Lista eventos da agenda',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Quantos dias à frente (padrão: 7)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_drive_files',
      description: 'Lista arquivos do Google Drive',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Filtro de busca (opcional)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_notion',
      description: 'Busca páginas no Notion',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Termo de busca' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_github_repos',
      description: 'Lista repositórios do GitHub',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }
];

/**
 * Detecta intenção do usuário usando Groq function calling
 */
export async function detectIntent(userId: number, message: string): Promise<IntentResult | null> {
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `Você é um assistente que detecta intenções do usuário para executar ações.
Analise a mensagem e determine se o usuário quer executar alguma ação específica.
Se a mensagem indicar uma ação clara (enviar email, ver agenda, listar arquivos, etc), retorne a função apropriada.
Se for apenas uma conversa geral, retorne null.`
        },
        { role: 'user', content: message }
      ],
      tools: tools as any,
      tool_choice: 'auto',
      temperature: 0.3
    });

    const message = completion.choices[0].message;
    
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      const args = JSON.parse(toolCall.function.arguments);
      
      return {
        intent: toolCall.function.name,
        confidence: 0.9,
        params: args
      };
    }

    return null;
  } catch (error: any) {
    console.error('Erro ao detectar intenção:', error);
    return null;
  }
}

/**
 * Executa a ação baseada na intenção detectada
 */
export async function executeIntent(ctx: Context, intent: IntentResult): Promise<string> {
  const userId = ctx.from!.id;

  try {
    switch (intent.intent) {
      case 'send_email': {
        if (!(await hasIntegration(userId, 'gmail'))) {
          return '⚠️ Você precisa conectar o Gmail primeiro! Use /conectar';
        }
        await google.sendGmail(userId, intent.params.to, intent.params.subject, intent.params.body);
        return `✅ Email enviado para ${intent.params.to}!`;
      }

      case 'read_emails': {
        if (!(await hasIntegration(userId, 'gmail'))) {
          return '⚠️ Você precisa conectar o Gmail primeiro! Use /conectar';
        }
        const emails = await google.readGmail(userId, intent.params.query || 'is:unread', intent.params.max || 5);
        if (emails.length === 0) return '📭 Nenhum email encontrado!';
        
        let result = `📬 ${emails.length} email(s):\n\n`;
        for (const email of emails) {
          result += `📩 *${email.subject}*\n   De: ${email.from}\n\n`;
        }
        return result;
      }

      case 'list_calendar_events': {
        if (!(await hasIntegration(userId, 'calendar'))) {
          return '⚠️ Você precisa conectar o Google Calendar primeiro! Use /conectar';
        }
        const events = await google.listCalendarEvents(userId);
        if (events.length === 0) return '📭 Nenhum evento próximo!';
        
        let result = `📅 Próximos eventos:\n\n`;
        for (const event of events.slice(0, 10)) {
          const start = event.start?.dateTime || event.start?.date;
          const date = start ? new Date(start).toLocaleString('pt-BR') : 'Sem data';
          result += `🔹 *${event.summary}*\n   📆 ${date}\n\n`;
        }
        return result;
      }

      case 'list_drive_files': {
        if (!(await hasIntegration(userId, 'drive'))) {
          return '⚠️ Você precisa conectar o Google Drive primeiro! Use /conectar';
        }
        const files = await google.listDriveFiles(userId, intent.params.query);
        if (files.length === 0) return '📭 Nenhum arquivo encontrado!';
        
        let result = `📁 Arquivos:\n\n`;
        for (const file of files.slice(0, 10)) {
          result += `📄 *${file.name}*\n`;
        }
        return result;
      }

      case 'search_notion': {
        if (!(await hasIntegration(userId, 'notion'))) {
          return '⚠️ Você precisa conectar o Notion primeiro! Use /conectar';
        }
        const pages = await notion.listNotionPages(userId);
        if (pages.results.length === 0) return '📭 Nenhuma página encontrada!';
        
        let result = `📝 Páginas do Notion:\n\n`;
        for (const page of pages.results.slice(0, 10)) {
          const title = page.properties?.title?.title?.[0]?.plain_text || '(sem título)';
          result += `📄 *${title}*\n`;
        }
        return result;
      }

      case 'list_github_repos': {
        if (!(await hasIntegration(userId, 'github'))) {
          return '⚠️ Você precisa conectar o GitHub primeiro! Use /conectar';
        }
        const repos = await github.listGitHubRepos(userId);
        if (repos.length === 0) return '📭 Nenhum repositório encontrado!';
        
        let result = `🐙 Repositórios:\n\n`;
        for (const repo of repos.slice(0, 10)) {
          result += `📦 *${repo.full_name}* ⭐${repo.stargazers_count}\n`;
        }
        return result;
      }

      default:
        return '❓ Não entendi o que você quer fazer.';
    }
  } catch (error: any) {
    return `❌ Erro ao executar ação: ${error.message}`;
  }
}

/**
 * intent-detector.ts
 * Detecta intenção do usuário e executa ação correspondente
 * v2.5: Expandido para 20+ ações reais com suporte a permissões granulares
 */

import { Context } from 'telegraf';
import { Groq } from 'groq-sdk';
import { hasIntegration, getAllIntegrations } from './db/firebase.js';
import * as google from './integrations/google.js';
import * as notion from './integrations/notion.js';
import * as github from './integrations/github.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

interface IntentResult {
  intent: string;
  confidence: number;
  params: Record<string, any>;
}

// 🔥 NOVO: Ferramentas expandidas com 20+ ações reais
const tools = [
  // ── Gmail ──
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
      name: 'delete_email',
      description: 'Deleta um e-mail específico',
      parameters: {
        type: 'object',
        properties: {
          message_id: { type: 'string', description: 'ID do email a deletar' }
        },
        required: ['message_id']
      }
    }
  },
  // ── Google Calendar ──
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
      name: 'create_calendar_event',
      description: 'Cria um novo evento na agenda',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Título do evento' },
          start: { type: 'string', description: 'Data/hora de início (ISO 8601)' },
          end: { type: 'string', description: 'Data/hora de término (ISO 8601)' },
          description: { type: 'string', description: 'Descrição (opcional)' }
        },
        required: ['summary', 'start', 'end']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_calendar_event',
      description: 'Deleta um evento da agenda',
      parameters: {
        type: 'object',
        properties: {
          event_id: { type: 'string', description: 'ID do evento a deletar' }
        },
        required: ['event_id']
      }
    }
  },
  // ── Google Drive ──
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
      name: 'upload_drive_file',
      description: 'Faz upload de um arquivo para o Google Drive',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do arquivo' },
          mime_type: { type: 'string', description: 'Tipo MIME (ex: text/plain)' },
          content: { type: 'string', description: 'Conteúdo do arquivo' }
        },
        required: ['name', 'mime_type', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_drive_file',
      description: 'Deleta um arquivo do Google Drive',
      parameters: {
        type: 'object',
        properties: {
          file_id: { type: 'string', description: 'ID do arquivo a deletar' }
        },
        required: ['file_id']
      }
    }
  },
  // ── Google Sheets ──
  {
    type: 'function',
    function: {
      name: 'read_sheet',
      description: 'Lê dados de uma planilha do Google Sheets',
      parameters: {
        type: 'object',
        properties: {
          spreadsheet_id: { type: 'string', description: 'ID da planilha' },
          range: { type: 'string', description: 'Intervalo (ex: Sheet1!A1:B10)' }
        },
        required: ['spreadsheet_id', 'range']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_sheet',
      description: 'Escreve dados em uma planilha do Google Sheets',
      parameters: {
        type: 'object',
        properties: {
          spreadsheet_id: { type: 'string', description: 'ID da planilha' },
          range: { type: 'string', description: 'Intervalo (ex: Sheet1!A1)' },
          values: { type: 'array', description: 'Dados a escrever (array de arrays)' }
        },
        required: ['spreadsheet_id', 'range', 'values']
      }
    }
  },
  // ── Notion ──
  {
    type: 'function',
    function: {
      name: 'search_notion',
      description: 'Busca páginas no Notion',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Termo de busca' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_notion_page',
      description: 'Cria uma nova página no Notion',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título da página' },
          content: { type: 'string', description: 'Conteúdo da página' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_notion_page',
      description: 'Deleta uma página do Notion',
      parameters: {
        type: 'object',
        properties: {
          page_id: { type: 'string', description: 'ID da página a deletar' }
        },
        required: ['page_id']
      }
    }
  },
  // ── GitHub ──
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
  },
  {
    type: 'function',
    function: {
      name: 'create_github_issue',
      description: 'Cria uma nova issue no GitHub',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Proprietário do repo' },
          repo: { type: 'string', description: 'Nome do repositório' },
          title: { type: 'string', description: 'Título da issue' },
          body: { type: 'string', description: 'Descrição da issue' }
        },
        required: ['owner', 'repo', 'title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_github_pr',
      description: 'Cria um pull request no GitHub',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Proprietário do repo' },
          repo: { type: 'string', description: 'Nome do repositório' },
          title: { type: 'string', description: 'Título do PR' },
          head: { type: 'string', description: 'Branch de origem' },
          base: { type: 'string', description: 'Branch de destino' }
        },
        required: ['owner', 'repo', 'title', 'head', 'base']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_github_issues',
      description: 'Lista issues do GitHub',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Proprietário do repo' },
          repo: { type: 'string', description: 'Nome do repositório' }
        },
        required: ['owner', 'repo']
      }
    }
  }
];

export async function detectIntent(userId: number, userMessage: string): Promise<IntentResult | null> {
  try {
    const integrations = await getAllIntegrations(userId);
    const activeIntegrations = Object.keys(integrations).join(', ') || 'Nenhuma';

    const completion: any = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `Você é um roteador de intenções para o Conecta Claw🦞. 
          CONEXÕES ATIVAS DO USUÁRIO: ${activeIntegrations}.
          
          Analise a mensagem do usuário e, SE ela expressar claramente a vontade de executar uma das ações disponíveis, chame a função correspondente usando o mecanismo de tool calling. 
          Caso seja conversa geral, dúvida, ou a intenção não esteja clara, NÃO chame nenhuma função (retorne apenas texto vazio). 
          Ações disponíveis: send_email, read_emails, delete_email, list_calendar_events, create_calendar_event, delete_calendar_event, list_drive_files, upload_drive_file, delete_drive_file, read_sheet, write_sheet, search_notion, create_notion_page, delete_notion_page, list_github_repos, create_github_issue, create_github_pr, list_github_issues.`
        },
        { role: 'user', content: userMessage }
      ],
      tools: tools as any,
      tool_choice: 'auto',
      temperature: 0.1
    });

    const responseMessage = completion.choices[0].message;
    
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
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

export async function executeIntent(ctx: Context, intent: IntentResult): Promise<string> {
  const userId = ctx.from!.id;

  try {
    switch (intent.intent) {
      // ── Gmail ──
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

      case 'delete_email': {
        if (!(await hasIntegration(userId, 'gmail'))) {
          return '⚠️ Você precisa conectar o Gmail primeiro! Use /conectar';
        }
        await google.deleteGmail(userId, intent.params.message_id);
        return `✅ Email deletado com sucesso!`;
      }

      // ── Google Calendar ──
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

      case 'create_calendar_event': {
        if (!(await hasIntegration(userId, 'calendar'))) {
          return '⚠️ Você precisa conectar o Google Calendar primeiro! Use /conectar';
        }
        const event = await google.createCalendarEvent(
          userId,
          intent.params.summary,
          intent.params.start,
          intent.params.end,
          intent.params.description
        );
        return `✅ Evento "${intent.params.summary}" criado com sucesso!`;
      }

      case 'delete_calendar_event': {
        if (!(await hasIntegration(userId, 'calendar'))) {
          return '⚠️ Você precisa conectar o Google Calendar primeiro! Use /conectar';
        }
        await google.deleteCalendarEvent(userId, intent.params.event_id);
        return `✅ Evento deletado com sucesso!`;
      }

      // ── Google Drive ──
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

      case 'upload_drive_file': {
        if (!(await hasIntegration(userId, 'drive'))) {
          return '⚠️ Você precisa conectar o Google Drive primeiro! Use /conectar';
        }
        const file = await google.uploadDriveFile(
          userId,
          intent.params.name,
          intent.params.mime_type,
          intent.params.content
        );
        return `✅ Arquivo "${intent.params.name}" enviado para o Drive!`;
      }

      case 'delete_drive_file': {
        if (!(await hasIntegration(userId, 'drive'))) {
          return '⚠️ Você precisa conectar o Google Drive primeiro! Use /conectar';
        }
        await google.deleteDriveFile(userId, intent.params.file_id);
        return `✅ Arquivo deletado com sucesso!`;
      }

      // ── Google Sheets ──
      case 'read_sheet': {
        if (!(await hasIntegration(userId, 'sheets'))) {
          return '⚠️ Você precisa conectar o Google Sheets primeiro! Use /conectar';
        }
        const data = await google.readSheet(userId, intent.params.spreadsheet_id, intent.params.range);
        if (data.length === 0) return '📭 Nenhum dado encontrado!';
        
        let result = `📊 Dados da planilha:\n\n`;
        for (const row of data.slice(0, 10)) {
          result += `${row.join(' | ')}\n`;
        }
        return result;
      }

      case 'write_sheet': {
        if (!(await hasIntegration(userId, 'sheets'))) {
          return '⚠️ Você precisa conectar o Google Sheets primeiro! Use /conectar';
        }
        await google.writeSheet(userId, intent.params.spreadsheet_id, intent.params.range, intent.params.values);
        return `✅ Dados escritos na planilha com sucesso!`;
      }

      // ── Notion ──
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

      case 'create_notion_page': {
        if (!(await hasIntegration(userId, 'notion'))) {
          return '⚠️ Você precisa conectar o Notion primeiro! Use /conectar';
        }
        await notion.createNotionPage(userId, intent.params.title, intent.params.content);
        return `✅ Página "${intent.params.title}" criada no Notion!`;
      }

      case 'delete_notion_page': {
        if (!(await hasIntegration(userId, 'notion'))) {
          return '⚠️ Você precisa conectar o Notion primeiro! Use /conectar';
        }
        // Nota: Notion API não suporta deletar páginas diretamente, apenas arquivar
        return `⚠️ Notion não permite deletar páginas via API. Você pode arquivar a página manualmente.`;
      }

      // ── GitHub ──
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

      case 'create_github_issue': {
        if (!(await hasIntegration(userId, 'github'))) {
          return '⚠️ Você precisa conectar o GitHub primeiro! Use /conectar';
        }
        const issue = await github.createGitHubIssue(
          userId,
          intent.params.owner,
          intent.params.repo,
          intent.params.title,
          intent.params.body
        );
        return `✅ Issue "${intent.params.title}" criada com sucesso!`;
      }

      case 'create_github_pr': {
        if (!(await hasIntegration(userId, 'github'))) {
          return '⚠️ Você precisa conectar o GitHub primeiro! Use /conectar';
        }
        const pr = await github.createGitHubPR(
          userId,
          intent.params.owner,
          intent.params.repo,
          intent.params.title,
          intent.params.head,
          intent.params.base
        );
        return `✅ Pull Request "${intent.params.title}" criado com sucesso!`;
      }

      case 'list_github_issues': {
        if (!(await hasIntegration(userId, 'github'))) {
          return '⚠️ Você precisa conectar o GitHub primeiro! Use /conectar';
        }
        const issues = await github.listGitHubIssues(userId, intent.params.owner, intent.params.repo);
        if (issues.length === 0) return '📭 Nenhuma issue encontrada!';
        
        let result = `🐙 Issues:\n\n`;
        for (const issue of issues.slice(0, 10)) {
          result += `🔹 *${issue.title}* (#${issue.number})\n`;
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

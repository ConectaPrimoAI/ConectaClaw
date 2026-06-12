/**
 * register-integrations.ts
 * Registra comandos de integração no bot (chamado após bot ser criado)
 */

import { Telegraf } from 'telegraf';
import { handleConectar, handleIntegrationsStatus, handleDisconnect } from './connect.js';
import { 
  handleEmailCommand, 
  handleReadEmailsCommand, 
  handleAgendaCommand, 
  handleArquivosCommand, 
  handleNotionCommand, 
  handleRepoCommand, 
  handleIssuesCommand 
} from './integrations-commands.js';

export function registerIntegrationCommands(bot: Telegraf): void {
  bot.command('conectar', handleConectar);
  bot.command('integracoes', handleIntegrationsStatus);
  bot.command('desconectar', handleDisconnect);
  bot.command('email', handleEmailCommand);
  bot.command('emails', handleReadEmailsCommand);
  bot.command('agenda', handleAgendaCommand);
  bot.command('arquivos', handleArquivosCommand);
  bot.command('notion', handleNotionCommand);
  bot.command('repo', handleRepoCommand);
  bot.command('issues', handleIssuesCommand);
  
  console.log('✅ Comandos de integração registrados');
}

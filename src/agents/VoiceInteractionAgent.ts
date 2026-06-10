/**
 * VoiceInteractionAgent.ts
 * CORREÇÃO V24: Removido - suas keywords conflitavam com VoiceAgent.
 * Este agente foi integrado ao VoiceAgent que é mais completo.
 * Mantido como stub para compatibilidade de importação no index.ts.
 */
import { Agent, AgentContext, AgentResult } from './Agent.js';
import { Context } from 'telegraf';

export class VoiceInteractionAgent implements Agent {
    name = 'VoiceInteractionAgent';
    description = 'Stub de compatibilidade — funcionalidade migrada para VoiceAgent.';
    // Sem keywords: não vai competir por roteamento
    keywords = [];
    priority = -1; // Nunca será escolhido via roteamento normal
    category: 'communication' = 'communication';

    async canHandle(_ctx: AgentContext): Promise<boolean> {
        return false; // Desativado — VoiceAgent cobre isso
    }

    async execute(_agentCtx: AgentContext, _telegrafCtx: Context): Promise<AgentResult | string | null> {
        return null;
    }

    public async handleVoiceMessage(chatId: number, voiceFileId: string): Promise<void> {
        console.log(`[VoiceInteractionAgent] chat ${chatId} file ${voiceFileId}`);
    }

    public async sendVoiceMessage(chatId: number, audioUrl: string): Promise<void> {
        console.log(`[VoiceInteractionAgent] send to ${chatId} from ${audioUrl}`);
    }
}

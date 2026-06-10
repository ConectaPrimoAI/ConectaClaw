import { Skill } from './Skill.js';
import { Context } from 'telegraf';
import {
    adicionarLembrete,
    listarLembretes,
    cancelarLembrete,
    cancelarTodos
} from '../reminderManager.js';
import { addLog } from '../web-terminal.js';

// ─── Parser de hora "17:00", "9h", "9hrs", "17h30" etc. ─────
function parseHora(raw: string): string | null {
    raw = raw.trim().replace(',', ':').replace('h', ':').replace(/::+/, ':');
    const m1 = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (m1) {
        const h = parseInt(m1[1]), min = parseInt(m1[2]);
        if (h < 24 && min < 60) return `${h.toString().padStart(2, '0')}:${m1[2]}`;
    }
    const m2 = raw.match(/^(\d{1,2}):?$/);
    if (m2) {
        const h = parseInt(m2[1]);
        if (h < 24) return `${h.toString().padStart(2, '0')}:00`;
    }
    return null;
}

// ─── Próxima data com hora alvo (para lembretes "hoje" ou "amanhã") ─
function proximaData(hora: string): string {
    const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const [hh, mm] = hora.split(':').map(Number);
    const alvo = new Date(agora);
    alvo.setHours(hh, mm, 0, 0);
    // Se já passou, agenda para amanhã
    if (alvo <= agora) alvo.setDate(alvo.getDate() + 1);
    const mo = (alvo.getMonth() + 1).toString().padStart(2, '0');
    const dd = alvo.getDate().toString().padStart(2, '0');
    return `${alvo.getFullYear()}-${mo}-${dd}`;
}

function extrair(bloco: string, chave: string): string | null {
    const re = new RegExp(`${chave}\\s*=\\s*["']([^"']+)["']`, 'i');
    const m = bloco.match(re);
    return m ? m[1].trim() : null;
}

export class ReminderSkill implements Skill {
    name = 'ReminderSkill';
    description = 'Agenda lembretes normais, repetitivos e em rotina de ciclos.';

    canHandle(intent: string): boolean {
        return intent.includes('[SYSTEM_REMINDER:');
    }

    async execute(params: any, ctx: Context): Promise<string> {
        const userId = (ctx.from as any)?.id;
        if (!userId) return '⚠️ Não consegui identificar seu usuário.';

        // Detecta bloco principal
        const match = params.match(/\[SYSTEM_REMINDER:([\s\S]*?)\]/i);
        if (!match) return '';

        const bloco = match[1];
        const acao  = extrair(bloco, 'acao') || 'criar';

        // ── LISTAR ────────────────────────────────────────────
        if (acao === 'listar') {
            const lista = listarLembretes(userId);
            if (!lista.length) return '📭 Você não tem lembretes ativos.';

            const linhas = lista.map(l => {
                const tipoEmoji = l.tipo === 'repetitivo' ? '🔁' : l.tipo === 'rotina' ? '🔄' : '📌';
                let extra = '';
                if (l.tipo === 'rotina') {
                    const fase = l.emCicloOn ? `ON (${l.diasRestantesNoCiclo} dias restantes)` : `PAUSA (${l.diasRestantesNoCiclo} dias restantes)`;
                    extra = ` | Ciclo ${l.ciclosCompletados ?? 0}/${l.totalCiclos} — ${fase}`;
                }
                return `${tipoEmoji} *[${l.id}]* ${l.mensagem} às *${l.hora}*${extra}`;
            });

            return `⏰ *Seus lembretes ativos (${lista.length}):*\n\n${linhas.join('\n')}\n\n_Use /cancelarlembrete [ID] para cancelar._`;
        }

        // ── CANCELAR ──────────────────────────────────────────
        if (acao === 'cancelar') {
            const id = extrair(bloco, 'id');
            if (!id) return '⚠️ Informe o ID do lembrete. Use /lembretes para ver os IDs.';
            const ok = cancelarLembrete(id, userId);
            return ok ? `✅ Lembrete [${id}] cancelado.` : `⚠️ Lembrete [${id}] não encontrado.`;
        }

        // ── CANCELAR TODOS ────────────────────────────────────
        if (acao === 'cancelar_todos') {
            const n = cancelarTodos(userId);
            return n > 0 ? `✅ ${n} lembrete(s) cancelado(s).` : '📭 Nenhum lembrete ativo para cancelar.';
        }

        // ── CRIAR ─────────────────────────────────────────────
        const tipo      = (extrair(bloco, 'tipo') || 'normal') as 'normal' | 'repetitivo' | 'rotina' | 'agendado';
        
        if (tipo === 'agendado') {
            const msg   = extrair(bloco, 'mensagem') || 'Tarefa Agendada';
            const horaRaw = extrair(bloco, 'hora') || '09:00';
            const hora  = parseHora(horaRaw) || '09:00';
            const data  = extrair(bloco, 'data') || 'hoje';
            
            // Converte agendado para normal para persistir no manager
            const dataAlvo = data === 'hoje' || data === 'amanhã' ? proximaData(hora) : data;
            
            adicionarLembrete({
                userId, mensagem: msg, tipo: 'normal', hora,
                dataAlvo, ativo: true
            });

            addLog(`📅 Agendamento Agêntico: ${msg} para ${dataAlvo} às ${hora}`);
            return `✅ Agendado com sucesso: "${msg}" para ${dataAlvo} às ${hora}`;
        }
        const mensagem  = extrair(bloco, 'mensagem') || extrair(bloco, 'msg') || 'Lembrete';
        const horaRaw   = extrair(bloco, 'hora') || '09:00';
        const hora      = parseHora(horaRaw) || horaRaw;

        if (!parseHora(hora)) {
            return `⚠️ Hora inválida: "${horaRaw}". Use o formato HH:MM (ex: 17:00).`;
        }

        // ── Normal ────────────────────────────────────────────
        if (tipo === 'normal') {
            const dataAlvo = proximaData(hora);
            const l = adicionarLembrete({
                userId, mensagem, tipo: 'normal', hora,
                dataAlvo, ativo: true
            });
            const amanha = dataAlvo !== new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).toLocaleDateString('sv');
            const quando = amanha ? `amanhã (${dataAlvo}) às ${hora}` : `hoje às ${hora}`;
            return `✅ Lembrete criado! *[${l.id}]*\n📌 "${mensagem}"\n🕐 ${quando}`;
        }

        // ── Repetitivo ────────────────────────────────────────
        if (tipo === 'repetitivo') {
            const l = adicionarLembrete({
                userId, mensagem, tipo: 'repetitivo', hora, ativo: true
            });
            return `✅ Lembrete repetitivo criado! *[${l.id}]*\n🔁 "${mensagem}"\n🕐 Todo dia às ${hora}`;
        }

        // ── Rotina ────────────────────────────────────────────
        if (tipo === 'rotina') {
            const diasOn  = parseInt(extrair(bloco, 'dias_on')  || extrair(bloco, 'on')  || '10');
            const diasOff = parseInt(extrair(bloco, 'dias_off') || extrair(bloco, 'off') || '20');
            const ciclos  = parseInt(extrair(bloco, 'ciclos')   || extrair(bloco, 'repeticoes') || '3');

            if (isNaN(diasOn) || isNaN(diasOff) || isNaN(ciclos)) {
                return '⚠️ Para rotina, informe dias_on, dias_off e ciclos. Ex: dias_on="10", dias_off="20", ciclos="3"';
            }

            const l = adicionarLembrete({
                userId, mensagem, tipo: 'rotina', hora,
                diasOn, diasOff, totalCiclos: ciclos,
                ciclosCompletados: 0,
                emCicloOn: true,
                diasRestantesNoCiclo: diasOn,
                ativo: true
            });

            const duracaoTotal = ciclos * diasOn + (ciclos - 1) * diasOff;
            return (
                `✅ Rotina criada! *[${l.id}]*\n` +
                `🔄 "${mensagem}"\n` +
                `🕐 Às ${hora} durante ${diasOn} dias\n` +
                `⏸️ Pausa de ${diasOff} dias entre ciclos\n` +
                `🔢 ${ciclos} ciclo(s) no total (~${duracaoTotal} dias)`
            );
        }

        addLog(`⚠️ ReminderSkill: tipo desconhecido "${tipo}"`);
        return '';
    }
}

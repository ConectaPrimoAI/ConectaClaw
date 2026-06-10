import { Telegraf } from 'telegraf';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { addLog } from './web-terminal.js';

// ─── Tipos de lembrete ────────────────────────────────────────
export interface Lembrete {
    id: string;
    userId: number;
    mensagem: string;
    tipo: 'normal' | 'repetitivo' | 'rotina';
    hora: string;           // "HH:MM" horário de Brasília

    // normal: dispara uma vez em data específica (ou "hoje" se omitido)
    dataAlvo?: string;      // "YYYY-MM-DD"

    // rotina: ciclos ON/OFF
    diasOn?: number;
    diasOff?: number;
    totalCiclos?: number;
    ciclosCompletados?: number;
    emCicloOn?: boolean;
    diasRestantesNoCiclo?: number;

    ultimoDisparoData?: string;  // "YYYY-MM-DD" — evita disparar 2x no mesmo dia
    ativo: boolean;
    criadoEm: string;
}

// ─── Persistência ────────────────────────────────────────────
const DATA_DIR  = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'reminders.json');
let lembretes: Lembrete[] = [];
let botRef: Telegraf | null = null;

function carregar() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        if (fs.existsSync(DATA_FILE)) {
            lembretes = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        }
    } catch {
        lembretes = [];
    }
}

function salvar() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(lembretes, null, 2), 'utf-8');
    } catch (e) {
        addLog(`⚠️ Reminder: falha ao salvar: ${e}`);
    }
}

// ─── Hora atual no fuso de Brasília (UTC-3) ──────────────────
function agora(): { hhmm: string; data: string; diaSemana: number } {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const mo = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    return {
        hhmm: `${hh}:${mm}`,
        data: `${d.getFullYear()}-${mo}-${dd}`,
        diaSemana: d.getDay() // 0=Dom … 6=Sab
    };
}

// ─── Verificação minuto a minuto ──────────────────────────────
async function verificar() {
    const { hhmm, data } = agora();
    let mudou = false;

    for (const l of lembretes) {
        if (!l.ativo) continue;
        if (l.hora !== hhmm) continue;          // hora errada
        if (l.ultimoDisparoData === data) continue; // já disparou hoje

        let deveDisparar = false;

        // ── Normal: uma única vez ────────────────────────────
        if (l.tipo === 'normal') {
            deveDisparar = !l.dataAlvo || l.dataAlvo <= data;
            if (deveDisparar) {
                l.ativo = false; // remove após disparar
            }
        }

        // ── Repetitivo: todo dia no horário ──────────────────
        if (l.tipo === 'repetitivo') {
            deveDisparar = true;
        }

        // ── Rotina: ciclos ON/OFF ─────────────────────────────
        if (l.tipo === 'rotina') {
            if (l.emCicloOn) {
                deveDisparar = true;
                l.diasRestantesNoCiclo = (l.diasRestantesNoCiclo ?? (l.diasOn ?? 10)) - 1;

                if (l.diasRestantesNoCiclo <= 0) {
                    // Ciclo ON terminou
                    l.ciclosCompletados = (l.ciclosCompletados ?? 0) + 1;
                    if (l.ciclosCompletados >= (l.totalCiclos ?? 1)) {
                        l.ativo = false; // todos os ciclos concluídos
                        addLog(`✅ Rotina "${l.mensagem}" concluída para user ${l.userId}`);
                    } else {
                        l.emCicloOn = false;
                        l.diasRestantesNoCiclo = l.diasOff ?? 20;
                        addLog(`🔄 Rotina "${l.mensagem}": pausa de ${l.diasRestantesNoCiclo} dias`);
                    }
                }
            } else {
                // Fase OFF — apenas conta o tempo
                l.diasRestantesNoCiclo = (l.diasRestantesNoCiclo ?? (l.diasOff ?? 20)) - 1;
                if (l.diasRestantesNoCiclo <= 0) {
                    l.emCicloOn = true;
                    l.diasRestantesNoCiclo = l.diasOn ?? 10;
                    addLog(`🔄 Rotina "${l.mensagem}": reiniciando ciclo ON`);
                }
                deveDisparar = false;
            }
        }

        if (deveDisparar && botRef) {
            try {
                const textoExtras = l.tipo === 'rotina'
                    ? `\n📅 _Ciclo ${(l.ciclosCompletados ?? 0) + (l.ativo ? 1 : 0)}/${l.totalCiclos} — ainda ${l.diasRestantesNoCiclo} dias_`
                    : '';
                const textoTipo = l.tipo === 'repetitivo' ? ' 🔁' : l.tipo === 'rotina' ? ' 🔄' : '';

                await botRef.telegram.sendMessage(
                    l.userId,
                    `⏰ *Lembrete${textoTipo}*\n\n${l.mensagem}${textoExtras}`,
                    { parse_mode: 'Markdown' }
                );

                l.ultimoDisparoData = data;
                mudou = true;
                addLog(`🔔 Lembrete disparado para ${l.userId}: "${l.mensagem.substring(0, 40)}"`);
            } catch (err: any) {
                addLog(`⚠️ Reminder falhou envio: ${err.message}`);
            }
        }
    }

    if (mudou) salvar();
}

// ─── API pública ─────────────────────────────────────────────
export function startReminderManager(bot: Telegraf) {
    botRef = bot;
    carregar();
    const ativos = lembretes.filter(l => l.ativo).length;
    addLog(`⏰ ReminderManager: ${ativos} lembrete(s) ativo(s)`);

    // Verifica todo minuto (sincronizado com o início do próximo minuto)
    const msAteProximoMinuto = (60 - new Date().getSeconds()) * 1000;
    setTimeout(() => {
        verificar();
        setInterval(verificar, 60 * 1000);
    }, msAteProximoMinuto);
}

export function adicionarLembrete(dados: Omit<Lembrete, 'id' | 'criadoEm'>): Lembrete {
    carregar();
    const novo: Lembrete = {
        ...dados,
        id: Math.random().toString(36).substring(2, 8).toUpperCase(),
        criadoEm: new Date().toISOString()
    };
    lembretes.push(novo);
    salvar();
    addLog(`➕ Lembrete criado: [${novo.id}] ${novo.mensagem} @ ${novo.hora}`);
    return novo;
}

export function listarLembretes(userId: number): Lembrete[] {
    carregar();
    return lembretes.filter(l => l.userId === userId && l.ativo);
}

export function cancelarLembrete(id: string, userId: number): boolean {
    carregar();
    const l = lembretes.find(l => l.id.toUpperCase() === id.toUpperCase() && l.userId === userId);
    if (!l) return false;
    l.ativo = false;
    salvar();
    addLog(`🗑️ Lembrete cancelado: [${id}]`);
    return true;
}

export function cancelarTodos(userId: number): number {
    carregar();
    let count = 0;
    lembretes.forEach(l => {
        if (l.userId === userId && l.ativo) { l.ativo = false; count++; }
    });
    if (count > 0) salvar();
    return count;
}

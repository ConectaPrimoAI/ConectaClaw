/**
 * LongTermMemory.ts
 * Memória de longo prazo do Conecta Claw🦞 — capaz de lembrar de coisas de meses atrás.
 *
 * Estrutura:
 *  - Fatos persistentes (key-value) salvos em JSON
 *  - Conversas indexadas por usuário/datas para contexto histórico
 *  - Resumos mensais para evitar explosão de tokens
 *  - Busca semântica simples (overlap de tokens)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { addLog } from '../web-terminal.js';

const DATA_DIR  = path.join(process.cwd(), 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'long_term_memory.json');
const CHATS_FILE  = path.join(DATA_DIR, 'long_term_chats.json');
const SUMMARIES_FILE = path.join(DATA_DIR, 'monthly_summaries.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

interface FactEntry {
    value: any;
    timestamp: number;
    category?: string;
    lastAccessed?: number;
    accessCount?: number;
}

interface ChatEntry {
    userId: number;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    tags?: string[];
}

interface MonthlySummary {
    month: string; // YYYY-MM
    userId: number;
    summary: string;
    timestamp: number;
}

export class LongTermMemory {
    private facts: Record<string, FactEntry> = {};
    private chats: ChatEntry[] = [];
    private summaries: MonthlySummary[] = [];

    constructor() {
        this.load();
    }

    // ── Persistência ─────────────────────────────────────────
    private load() {
        try {
            if (fs.existsSync(MEMORY_FILE)) {
                this.facts = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
            }
            if (fs.existsSync(CHATS_FILE)) {
                this.chats = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf-8'));
            }
            if (fs.existsSync(SUMMARIES_FILE)) {
                this.summaries = JSON.parse(fs.readFileSync(SUMMARIES_FILE, 'utf-8'));
            }
        } catch (e) {
            addLog(`⚠️ LongTermMemory load: ${e}`);
        }
    }

    private saveFacts() {
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.facts, null, 2));
    }

    private saveChats() {
        // Limita histórico em 5000 entradas (suficiente para meses)
        if (this.chats.length > 5000) {
            this.chats = this.chats.slice(-5000);
        }
        fs.writeFileSync(CHATS_FILE, JSON.stringify(this.chats, null, 2));
    }

    private saveSummaries() {
        fs.writeFileSync(SUMMARIES_FILE, JSON.stringify(this.summaries, null, 2));
    }

    // ── API de fatos (key/value) ─────────────────────────────
    save(key: string, value: any, category = 'general'): FactEntry {
        const entry: FactEntry = {
            value,
            timestamp: Date.now(),
            category,
            lastAccessed: Date.now(),
            accessCount: 0
        };
        this.facts[key] = entry;
        this.saveFacts();
        addLog(`🧠 Memória salva [${category}]: ${key}`);
        return entry;
    }

    get(key: string): any {
        const e = this.facts[key];
        if (!e) return null;
        e.lastAccessed = Date.now();
        e.accessCount = (e.accessCount || 0) + 1;
        this.saveFacts();
        return e.value;
    }

    delete(key: string): boolean {
        if (this.facts[key]) {
            delete this.facts[key];
            this.saveFacts();
            return true;
        }
        return false;
    }

    /** Retorna todos os fatos formatados (para usar em prompt) */
    getAllFormatted(limit = 200): string {
        const entries = Object.entries(this.facts)
            .sort((a, b) => (b[1].lastAccessed || 0) - (a[1].lastAccessed || 0))
            .slice(0, limit);

        if (entries.length === 0) return '(vazio)';

        return entries
            .map(([k, v]) => {
                const date = new Date(v.timestamp).toLocaleDateString('pt-BR');
                return `[${date}] ${k}: ${JSON.stringify(v.value).substring(0, 200)}`;
            })
            .join('\n');
    }

    getAll(): Record<string, any> {
        return Object.fromEntries(
            Object.entries(this.facts).map(([k, v]) => [k, v.value])
        );
    }

    // ── API de conversas ─────────────────────────────────────
    recordChat(userId: number, role: 'user' | 'assistant', content: string, tags?: string[]) {
        this.chats.push({
            userId, role, content,
            timestamp: Date.now(),
            tags
        });
        this.saveChats();
    }

    /** Retorna chats recentes de um usuário */
    getRecentChats(userId: number, days = 30, max = 200): ChatEntry[] {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        return this.chats
            .filter(c => c.userId === userId && c.timestamp >= cutoff)
            .slice(-max);
    }

    /** Busca simples por overlap de tokens */
    searchChats(userId: number, query: string, max = 10): ChatEntry[] {
        const q = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        if (q.length === 0) return [];

        const scored = this.chats
            .filter(c => c.userId === userId)
            .map(c => {
                const txt = c.content.toLowerCase();
                const score = q.reduce((acc, w) => acc + (txt.includes(w) ? 1 : 0), 0);
                return { entry: c, score };
            })
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, max);

        return scored.map(x => x.entry);
    }

    // ── Resumos mensais ───────────────────────────────────────
    saveMonthlySummary(userId: number, month: string, summary: string) {
        const idx = this.summaries.findIndex(s => s.userId === userId && s.month === month);
        if (idx >= 0) this.summaries[idx].summary = summary;
        else this.summaries.push({ userId, month, summary, timestamp: Date.now() });
        this.saveSummaries();
    }

    getMonthlySummary(userId: number, month: string): string | null {
        return this.summaries.find(s => s.userId === userId && s.month === month)?.summary ?? null;
    }

    getAllSummaries(userId: number): MonthlySummary[] {
        return this.summaries.filter(s => s.userId === userId);
    }

    /** Gera texto completo de contexto (fatos + resumos) */
    getContextForLLM(userId: number): string {
        const facts = this.getAllFormatted(50);
        const summaries = this.getAllSummaries(userId)
            .map(s => `[${s.month}] ${s.summary}`)
            .join('\n');

        return `MEMÓRIA DE FATOS:\n${facts}\n\nRESUMOS MENSAIS:\n${summaries || '(nenhum)'}`;
    }

    /** Limpa memória antiga (chats com mais de 180 dias) */
    cleanup(daysKeep = 180) {
        const cutoff = Date.now() - daysKeep * 24 * 60 * 60 * 1000;
        const before = this.chats.length;
        this.chats = this.chats.filter(c => c.timestamp >= cutoff);
        this.saveChats();
        addLog(`🧹 Memória: removidas ${before - this.chats.length} entradas antigas`);
    }
}

export const longTermMemory = new LongTermMemory();

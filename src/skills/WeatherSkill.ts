import { Skill } from './Skill.js';
import { Context } from 'telegraf';
import axios from 'axios';
import { addLog } from '../web-terminal.js';

export class WeatherSkill implements Skill {
    name = 'WeatherSkill';
    description = 'Clima real com dados horários — responde "vai chover às 17h?" de verdade.';

    canHandle(i: string): boolean { return i.includes('[SYSTEM_WEATHER:'); }

    async execute(params: string, _ctx: Context): Promise<string> {
        const m = params.match(/\[SYSTEM_WEATHER:\s*local="([^"]+)"(?:\s*,\s*hora="(\d+)")?\]/i);
        const local = m ? m[1].trim() : 'Chapecó, SC';
        const horaAlvo = m?.[2] ? parseInt(m[2]) : null;

        addLog(`🌤️ Weather: "${local}"${horaAlvo != null ? ` hora=${horaAlvo}h` : ''}`);

        try {
            const encoded = encodeURIComponent(local);
            // &m = métrico (Celsius) | &lang=pt = respostas em PT
            const res = await axios.get(
                `https://wttr.in/${encoded}?format=j1&m&lang=pt`,
                { timeout: 12000 }
            );
            const d = res.data;
            const cc = d.current_condition?.[0];
            if (!cc) return `⚠️ Sem dados para "${local}".`;

            // ── Pergunta sobre hora específica ────────────────────
            if (horaAlvo != null) {
                return this.respostaHoraria(d, local, horaAlvo);
            }

            // ── Resumo completo ───────────────────────────────────
            const tC        = parseInt(cc.temp_C);
            const sensC     = parseInt(cc.FeelsLikeC);
            const umid      = cc.humidity;
            const vento     = cc.windspeedKmph;
            const desc      = cc.weatherDesc?.[0]?.value || '';
            const uv        = cc.uvIndex;
            const chuvaAgr  = cc.precipMM || '0';
            const vis       = cc.visibility || '?';

            const emojiT    = tC >= 35 ? '🥵' : tC >= 28 ? '☀️' : tC >= 18 ? '🌤️' : tC >= 8 ? '🧥' : '🥶';

            // Previsão 3 dias
            const dias = ['Hoje', 'Amanhã', 'Depois'];
            const previsao = (d.weather || []).slice(0, 3).map((dia: any, i: number) => {
                const max    = dia.maxtempC;
                const min    = dia.mintempC;
                const horas  = dia.hourly || [];
                const chuva  = Math.round(horas.reduce((a: number, h: any) => a + parseInt(h.chanceofrain || 0), 0) / Math.max(horas.length, 1));
                const precip = horas.reduce((a: number, h: any) => a + parseFloat(h.precipMM || 0), 0).toFixed(1);
                const descDia = horas[4]?.weatherDesc?.[0]?.value || '';
                const emoji  = chuva > 70 ? '🌧️' : chuva > 40 ? '🌦️' : chuva > 15 ? '⛅' : '☀️';
                return `${emoji} *${dias[i]}:* ${min}°C–${max}°C | ${descDia} | 🌧️${chuva}% | 💧${precip}mm`;
            }).join('\n');

            // Próximas horas de hoje
            const hoje      = d.weather?.[0]?.hourly || [];
            const horaAtual = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours();
            const proxHoras = hoje
                .filter((h: any) => parseInt(h.time) / 100 >= horaAtual)
                .slice(0, 4)
                .map((h: any) => {
                    const hr    = String(parseInt(h.time) / 100).padStart(2, '0') + 'h';
                    const t     = h.tempC;
                    const pc    = h.chanceofrain;
                    const pEmoji = parseInt(pc) > 60 ? '🌧️' : parseInt(pc) > 30 ? '🌦️' : '☀️';
                    return `${pEmoji} ${hr}: ${t}°C | chuva ${pc}%`;
                }).join('\n') || 'Sem dados horários';

            return (
                `🌍 *${local}*\n\n` +
                `${emojiT} *Agora:* ${tC}°C (sensação ${sensC}°C)\n` +
                `📋 ${desc}\n` +
                `💧 Umidade ${umid}% | 💨 Vento ${vento} km/h | ☀️ UV ${uv} | 👁️ Vis. ${vis} km\n` +
                `🌧️ Precipitação agora: ${chuvaAgr}mm\n\n` +
                `⏰ *Próximas horas:*\n${proxHoras}\n\n` +
                `📅 *Previsão dos próximos dias:*\n${previsao}`
            );

        } catch (e: any) {
            addLog(`❌ Weather: ${e.message}`);
            return `⚠️ Erro ao buscar clima para "${local}". Verifique o nome da cidade.`;
        }
    }

    private respostaHoraria(data: any, local: string, horaAlvo: number): string {
        const hoje = data.weather?.[0]?.hourly || [];
        // wttr.in usa time = "0","300","600","900","1200","1500","1800","2100"
        // Encontrar a hora mais próxima do alvo
        let melhor: any = null;
        let menorDiff = 999;

        for (const h of hoje) {
            const hVal = Math.floor(parseInt(h.time) / 100);
            const diff = Math.abs(hVal - horaAlvo);
            if (diff < menorDiff) { menorDiff = diff; melhor = h; }
        }

        if (!melhor) return `⚠️ Sem dados horários para ${horaAlvo}h em "${local}".`;

        const hr        = String(Math.floor(parseInt(melhor.time) / 100)).padStart(2, '0');
        const tC        = melhor.tempC;
        const chuva     = parseInt(melhor.chanceofrain);
        const precipMM  = parseFloat(melhor.precipMM || 0);
        const desc      = melhor.weatherDesc?.[0]?.value || '';
        const vento     = melhor.windspeedKmph;
        const sensC     = melhor.FeelsLikeC;

        const respostaChuva =
            chuva >= 80 ? `Sim, muito provável que chova (${chuva}% de chance).` :
            chuva >= 50 ? `Pode chover (${chuva}% de chance). Melhor levar guarda-chuva.` :
            chuva >= 25 ? `Pequena chance de chuva (${chuva}%). Possível garoa.` :
            `Não deve chover (apenas ${chuva}% de chance).`;

        return (
            `🕐 *${local} — ${hr}h:*\n\n` +
            `🌡️ Temperatura: ${tC}°C (sensação ${sensC}°C)\n` +
            `📋 ${desc}\n` +
            `🌧️ Chuva: ${respostaChuva}\n` +
            `💧 Precipitação prevista: ${precipMM}mm\n` +
            `💨 Vento: ${vento} km/h`
        );
    }
}

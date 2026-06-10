/**
 * DevOpsAgent.ts
 * Agente DevOps: Docker, CI/CD, infraestrutura, deploy.
 */
import { Agent, AgentContext, AgentResult } from './Agent.js';
import { Context } from 'telegraf';
import Groq from 'groq-sdk';
import { addLog } from '../web-terminal.js';

let groqInstance: Groq | null = null;
function getGroq(): Groq {
    if (!groqInstance) groqInstance = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return groqInstance;
}

export class DevOpsAgent implements Agent {
    name = 'DevOpsAgent';
    description = 'Docker, Kubernetes, CI/CD, AWS/GCP, deploy, infraestrutura.';
    keywords = ['docker', 'dockerfile', 'kubernetes', 'k8s', 'terraform', 'ansible', 'ci/cd', 'github actions', 'jenkins', 'aws', 'gcp', 'azure', 'deploy', 'deployment', 'helm', 'nginx', 'infraestrutura', 'monitoramento', 'prometheus', 'grafana', 'logs'];
    category = 'code' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/devops') || l.startsWith('/docker') || l.startsWith('/deploy') || l.startsWith('/infra') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        addLog(`🚀 DevOps: ${ctx.userMessage.substring(0, 60)}`);

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                temperature: 0.2,
                messages: [
                    {
                        role: 'system',
                        content: `Você é o DevOpsAgent do Conecta Claw🦞 — um engenheiro sênior de DevOps/SRE.
REGRAS:
1. Forneça sempre código pronto para produção (Dockerfile, YAML, scripts)
2. Use boas práticas: multi-stage builds, secrets management, health checks
3. Explique o "porquê" de cada decisão
4. Quando relevante, mencione custos e trade-offs
5. Use blocos de código com linguagem: \`\`\`dockerfile, \`\`\`yaml, \`\`\`bash`
                    },
                    { role: 'user', content: ctx.userMessage }
                ]
            });
            return `🚀 *DevOpsAgent:*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            return `❌ Erro: ${e.message}`;
        }
    }
}

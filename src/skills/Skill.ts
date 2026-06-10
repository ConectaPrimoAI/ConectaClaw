import { Context } from 'telegraf';

export type SkillResult =
    | string
    | null
    | undefined
    | { text?: string; file?: string; type?: 'document' | 'photo' | 'video' | 'voice' };

export function isSkillObject(r: SkillResult): r is { text?: string; file?: string; type?: 'document' | 'photo' | 'video' | 'voice' } {
    return typeof r === 'object' && r !== null;
}

export function isSkillString(r: SkillResult): r is string {
    return typeof r === 'string';
}

export interface Skill {
    name: string;
    description: string;
    canHandle(intent: string): boolean | Promise<boolean>;
    execute(params: string, ctx: Context): Promise<SkillResult>;
}

export class SkillRegistry {
    private skills: Skill[] = [];

    register(skill: Skill) {
        this.skills.push(skill);
        console.log(`[Registry] ✅ ${skill.name}`);
    }

    async selectBestSkill(intent: string): Promise<Skill | null> {
        const up = intent.toUpperCase();
        for (const s of this.skills) {
            try { if (await s.canHandle(up)) return s; } catch {}
        }
        return null;
    }

    getAll(): Skill[] { return this.skills; }
}

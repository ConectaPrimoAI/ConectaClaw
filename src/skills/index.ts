import { SkillRegistry } from './Skill.js';
import { ReminderSkill } from './ReminderSkill.js';
// Gmail, Drive and GitHub skills are currently disabled/missing
// Note: Integration commands in conectaclaw-agent.ts handle these directly via integrations-commands.ts
import { WeatherSkill }  from './WeatherSkill.js';
import { VideoSkill }    from './VideoSkill.js';
import { ImageSkill }    from './ImageSkill.js';
import { SlidesSkill }   from './SlidesSkill.js';
import { BrowserSkill }  from './BrowserSkill.js';
import { ExecSkill }     from './ExecSkill.js';

export const registry = new SkillRegistry();

// Ordem importa — primeira skill que bater no canHandle() ganha
registry.register(new ReminderSkill());
// As skills de Gmail, Drive e GitHub foram removidas deste registro pois os comandos 
// /email, /arquivos, /repo, etc., são gerenciados diretamente pelo bot via integrações OAuth2.
registry.register(new WeatherSkill());
registry.register(new VideoSkill());
registry.register(new ImageSkill());
registry.register(new SlidesSkill());
registry.register(new BrowserSkill());
registry.register(new ExecSkill());

export * from './Skill.js';

import { SkillRegistry } from './Skill.js';
import { ReminderSkill } from './ReminderSkill.js';
import { GmailSkill }    from './GmailSkill.js';
import { DriveSkill }    from './DriveSkill.js';
import { GitHubSkill }   from './GitHubSkill.js';
import { WeatherSkill }  from './WeatherSkill.js';
import { VideoSkill }    from './VideoSkill.js';
import { ImageSkill }    from './ImageSkill.js';
import { SlidesSkill }   from './SlidesSkill.js';
import { BrowserSkill }  from './BrowserSkill.js';
import { ExecSkill }     from './ExecSkill.js';

export const registry = new SkillRegistry();

// Ordem importa — primeira skill que bater no canHandle() ganha
registry.register(new ReminderSkill());  // [SYSTEM_REMINDER:
registry.register(new GmailSkill());     // [SYSTEM_GMAIL:
registry.register(new DriveSkill());     // [SYSTEM_DRIVE:
registry.register(new GitHubSkill());    // [SYSTEM_GIT:
registry.register(new WeatherSkill());   // [SYSTEM_WEATHER:
registry.register(new VideoSkill());     // [SYSTEM_VIDEO:
registry.register(new ImageSkill());     // [SYSTEM_IMAGE:
registry.register(new SlidesSkill());    // [SYSTEM_SLIDES:
registry.register(new BrowserSkill());   // [SYSTEM_BROWSER:
registry.register(new ExecSkill());      // [SYSTEM_EXEC:

export * from './Skill.js';

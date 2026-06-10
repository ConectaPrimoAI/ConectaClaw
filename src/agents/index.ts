/**
 * index.ts — Registro central de todos os agentes do JoelBot
 * CORREÇÃO V24: MathAgent adicionado ao registro (estava faltando!).
 * VoiceInteractionAgent mantido como stub (desativado).
 */
import { agentRegistry } from './Agent.js';
import { VoiceInteractionAgent } from './VoiceInteractionAgent.js';
import { AutonomousCoreAgent } from './AutonomousCoreAgent.js';
import { SpecializedAgent } from './SpecializedAgent.js';

// ── Memória e Mídia ──
import { VoiceAgent }       from './VoiceAgent.js';
import { VisionAgent }      from './VisionAgent.js';
import { ImageGenAgent }    from './ImageGenAgent.js';
import { VideoGenAgent }    from './VideoGenAgent.js';
import { MemoryAgent }      from './MemoryAgent.js';

// ── Produtividade ──
import { ProductivityAgent } from './ProductivityAgent.js';
import { HealthAgent }       from './HealthAgent.js';
import { CareerAgent }       from './CareerAgent.js';
import { StartupAgent }      from './StartupAgent.js';

// ── Análise e Conhecimento ──
import { ResearchAgent }     from './ResearchAgent.js';
import { SummarizerAgent }   from './SummarizerAgent.js';
import { NewsAgent }         from './NewsAgent.js';
import { FinanceAgent }      from './FinanceAgent.js';
import { SportsAgent }       from './SportsAgent.js';
import { StudyAgent }        from './StudyAgent.js';
import { ReviewAgent }       from './ReviewAgent.js';
import { MathAgent }         from './MathAgent.js';  // ← ADICIONADO (estava faltando!)

// ── Criatividade ──
import { CreativeAgent }     from './CreativeAgent.js';
import { CookingAgent }      from './CookingAgent.js';
import { TravelAgent }       from './TravelAgent.js';
import { SocialAgent }       from './SocialAgent.js';
import { MusicAgent }        from './MusicAgent.js';
import { GameAgent }         from './GameAgent.js';
import { BrainstormAgent }   from './BrainstormAgent.js';
import { QuoteAgent }        from './QuoteAgent.js';

// ── Técnico ──
import { CodeAgent }         from './CodeAgent.js';
import { DevOpsAgent }       from './DevOpsAgent.js';

// ── Comunicação ──
import { TranslatorAgent }   from './TranslatorAgent.js';

// ── Sistema / Segurança ──
import { SecurityAgent }     from './SecurityAgent.js';

// ── ORDEM IMPORTA: agentes mais específicos primeiro ──────────
// Os agentes de alta prioridade e mais específicos devem vir primeiro
// para evitar que a busca por keywords seja "roubada" por agentes genéricos.

// ── Mídia (alta especificidade) ──
agentRegistry.register(new VoiceAgent());         // 1. Áudio / TTS
agentRegistry.register(new VisionAgent());        // 2. Análise de imagens
agentRegistry.register(new ImageGenAgent());      // 3. Gerar imagem
agentRegistry.register(new VideoGenAgent());      // 4. Gerar vídeo

// ── Sistema (alta prioridade) ──
agentRegistry.register(new AutonomousCoreAgent()); // 5. Automação web (priority=5)
agentRegistry.register(new SecurityAgent());       // 6. Segurança

// ── Técnico (muito específico) ──
agentRegistry.register(new CodeAgent());           // 7. Programação
agentRegistry.register(new DevOpsAgent());         // 8. DevOps / infra
agentRegistry.register(new MathAgent());           // 9. Matemática ← ADICIONADO

// ── Análise (específicos primeiro) ──
agentRegistry.register(new MemoryAgent());         // 10. Memória longo prazo
agentRegistry.register(new SummarizerAgent());     // 11. Resumos
agentRegistry.register(new ResearchAgent());       // 12. Pesquisa (priority=3)
agentRegistry.register(new ReviewAgent());         // 13. Revisão de texto
agentRegistry.register(new NewsAgent());           // 14. Notícias
agentRegistry.register(new FinanceAgent());        // 15. Cotações / finanças
agentRegistry.register(new SportsAgent());         // 16. Esportes
agentRegistry.register(new StudyAgent());          // 17. Estudos (corrigido)
agentRegistry.register(new TranslatorAgent());     // 18. Tradução

// ── Produtividade ──
agentRegistry.register(new ProductivityAgent());   // 19. TODO / planejamento
agentRegistry.register(new HealthAgent());         // 20. Saúde / bem-estar
agentRegistry.register(new CareerAgent());         // 21. Carreira
agentRegistry.register(new StartupAgent());        // 22. Startups / negócios

// ── Criatividade ──
agentRegistry.register(new CreativeAgent());       // 23. Escrita criativa
agentRegistry.register(new CookingAgent());        // 24. Receitas (corrigido)
agentRegistry.register(new TravelAgent());         // 25. Viagens
agentRegistry.register(new SocialAgent());         // 26. Redes sociais
agentRegistry.register(new MusicAgent());          // 27. Música
agentRegistry.register(new GameAgent());           // 28. Jogos
agentRegistry.register(new BrainstormAgent());     // 29. Brainstorm
agentRegistry.register(new QuoteAgent());          // 30. Citações

// ── Stub desativado ──
agentRegistry.register(new VoiceInteractionAgent()); // Stub (canHandle=false)

// ── Agentes Especializados (genéricos — ficam por último) ────
agentRegistry.register(new SpecializedAgent('DataAnalystAgent',   'Analisa dados, planilhas, métricas e gera insights estatísticos.'));
agentRegistry.register(new SpecializedAgent('MarketingAgent',     'Cria estratégias de marketing digital e conteúdo persuasivo.'));
agentRegistry.register(new SpecializedAgent('SalesAgent',         'Auxilia em vendas, prospecção e negociação comercial.'));
agentRegistry.register(new SpecializedAgent('CustomerSupportAgent','Oferece suporte ao cliente e resolve problemas de atendimento.'));
agentRegistry.register(new SpecializedAgent('LegalAgent',         'Fornece informações jurídicas, contratos e análises legais.'));
agentRegistry.register(new SpecializedAgent('MedicalAgent',       'Oferece informações médicas e orientações de saúde preliminares.'));
agentRegistry.register(new SpecializedAgent('EducationAgent',     'Ajuda no aprendizado pedagógico e criação de materiais didáticos.'));
agentRegistry.register(new SpecializedAgent('HRManagerAgent',     'Gerencia recursos humanos, recrutamento e seleção de talentos.'));
agentRegistry.register(new SpecializedAgent('ProjectManagerAgent','Planeja, organiza e gerencia projetos com metodologias ágeis.'));
agentRegistry.register(new SpecializedAgent('ContentCreatorAgent','Gera conteúdo criativo para blogs, vídeos e redes sociais.'));
agentRegistry.register(new SpecializedAgent('FinancialAdvisorAgent','Oferece consultoria financeira, planejamento e investimentos.'));
agentRegistry.register(new SpecializedAgent('RealEstateAgent',    'Auxilia na compra, venda e aluguel de imóveis e avaliações.'));
agentRegistry.register(new SpecializedAgent('EventPlannerAgent',  'Planeja e organiza eventos corporativos e sociais.'));
agentRegistry.register(new SpecializedAgent('ChefAgent',          'Cria receitas elaboradas e planos de cardápio personalizados.'));
agentRegistry.register(new SpecializedAgent('FitnessCoachAgent',  'Desenvolve planos de treino físico e nutrição esportiva.'));
agentRegistry.register(new SpecializedAgent('TherapistAgent',     'Oferece suporte emocional e psicológico com empatia.'));
agentRegistry.register(new SpecializedAgent('LanguageTutorAgent', 'Ensina idiomas, corrige textos e explica gramática.'));
agentRegistry.register(new SpecializedAgent('GameDeveloperAgent', 'Auxilia no desenvolvimento de jogos, game design e engines.'));
agentRegistry.register(new SpecializedAgent('CyberSecurityAgent', 'Monitora ameaças cibernéticas e protege sistemas digitais.'));
agentRegistry.register(new SpecializedAgent('EnvironmentalAgent', 'Fornece informações ambientais e soluções sustentáveis.'));

export * from './VoiceInteractionAgent.js';
export * from './AutonomousCoreAgent.js';
export * from './SpecializedAgent.js';
export * from './Agent.js';
export * from './LongTermMemory.js';
export { VoiceAgent, transcribeAudio, synthesizeSpeech } from './VoiceAgent.js';
export { VisionAgent, analyzeImage } from './VisionAgent.js';

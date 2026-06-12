/**
 * types.ts
 * Tipagens compartilhadas para todas as integrações
 */

export type ProviderName = 'gmail' | 'drive' | 'calendar' | 'sheets' | 'notion' | 'github';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export interface IntegrationStatus {
  provider: ProviderName;
  connected: boolean;
  scope?: string;
  connectedAt?: number;
  lastUpdated?: number;
}

export interface ConnectorCard {
  id: ProviderName | 'spotify';
  name: string;
  description: string;
  logo: string;
  available: boolean;
  scopes?: { id: string; label: string; description: string }[];
}

export const CONNECTORS: ConnectorCard[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Ler, enviar e gerenciar e-mails',
    logo: 'gmail',
    available: true,
    scopes: [
      { id: 'read', label: 'Ler e-mails', description: 'Acesso de leitura às suas mensagens' },
      { id: 'send', label: 'Enviar e-mails', description: 'Enviar mensagens em seu nome' },
      { id: 'manage', label: 'Gerenciar', description: 'Criar labels, marcar como lido, etc.' },
    ],
  },
  {
    id: 'drive',
    name: 'Google Drive',
    description: 'Acessar e gerenciar seus arquivos',
    logo: 'drive',
    available: true,
    scopes: [
      { id: 'read', label: 'Ler arquivos', description: 'Visualizar seus arquivos e pastas' },
      { id: 'write', label: 'Criar e editar', description: 'Criar novos arquivos e editar existentes' },
    ],
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    description: 'Gerenciar sua agenda e eventos',
    logo: 'calendar',
    available: true,
    scopes: [
      { id: 'read', label: 'Ler eventos', description: 'Visualizar sua agenda' },
      { id: 'write', label: 'Criar eventos', description: 'Criar e editar eventos' },
    ],
  },
  {
    id: 'sheets',
    name: 'Google Sheets',
    description: 'Ler e editar planilhas',
    logo: 'sheets',
    available: true,
    scopes: [
      { id: 'read', label: 'Ler planilhas', description: 'Visualizar dados das planilhas' },
      { id: 'write', label: 'Editar planilhas', description: 'Modificar dados das planilhas' },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Acessar suas páginas e bancos de dados',
    logo: 'notion',
    available: true,
    scopes: [
      { id: 'read', label: 'Ler conteúdo', description: 'Visualizar páginas e bancos de dados' },
      { id: 'write', label: 'Criar conteúdo', description: 'Criar e editar páginas' },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Acessar repositórios e issues',
    logo: 'github',
    available: true,
    scopes: [
      { id: 'read', label: 'Ler repositórios', description: 'Visualizar repos, issues e PRs' },
      { id: 'write', label: 'Criar issues/PRs', description: 'Criar issues e pull requests' },
    ],
  },
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Controle sua música e playlists',
    logo: 'spotify',
    available: false,
  },
];

export interface GoogleScopes {
  gmail: string[];
  drive: string[];
  calendar: string[];
  sheets: string[];
}

export const GOOGLE_SCOPES: GoogleScopes = {
  gmail: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
  ],
  drive: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.file',
  ],
  calendar: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  sheets: [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/spreadsheets',
  ],
};

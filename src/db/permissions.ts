/**
 * permissions.ts
 * Sistema de permissões granulares por serviço
 */

export const PERMISSION_SCOPES: Record<string, Record<string, { scope: string; label: string }>> = {
  gmail: {
    read: { scope: 'https://www.googleapis.com/auth/gmail.readonly', label: 'Ler e-mails' },
    send: { scope: 'https://www.googleapis.com/auth/gmail.send', label: 'Enviar e-mails' },
    draft: { scope: 'https://www.googleapis.com/auth/gmail.modify', label: 'Gerenciar rascunhos' },
    delete: { scope: 'https://www.googleapis.com/auth/gmail.modify', label: 'Excluir e-mails' }
  },
  drive: {
    read_files: { scope: 'https://www.googleapis.com/auth/drive.readonly', label: 'Ler arquivos' },
    create_files: { scope: 'https://www.googleapis.com/auth/drive', label: 'Criar arquivos' },
    edit_files: { scope: 'https://www.googleapis.com/auth/drive', label: 'Editar arquivos' },
    delete_files: { scope: 'https://www.googleapis.com/auth/drive', label: 'Excluir arquivos' },
    share_files: { scope: 'https://www.googleapis.com/auth/drive', label: 'Compartilhar arquivos' },
    read_folders: { scope: 'https://www.googleapis.com/auth/drive.readonly', label: 'Ler pastas' },
    create_folders: { scope: 'https://www.googleapis.com/auth/drive', label: 'Criar pastas' },
    delete_folders: { scope: 'https://www.googleapis.com/auth/drive', label: 'Excluir pastas' }
  },
  calendar: {
    read_events: { scope: 'https://www.googleapis.com/auth/calendar.readonly', label: 'Ler eventos' },
    create_events: { scope: 'https://www.googleapis.com/auth/calendar', label: 'Criar eventos' },
    edit_events: { scope: 'https://www.googleapis.com/auth/calendar', label: 'Editar eventos' },
    delete_events: { scope: 'https://www.googleapis.com/auth/calendar', label: 'Excluir eventos' }
  },
  sheets: {
    read_sheets: { scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', label: 'Ler planilhas' },
    create_sheets: { scope: 'https://www.googleapis.com/auth/spreadsheets', label: 'Criar planilhas' },
    edit_sheets: { scope: 'https://www.googleapis.com/auth/spreadsheets', label: 'Editar planilhas' },
    delete_sheets: { scope: 'https://www.googleapis.com/auth/spreadsheets', label: 'Excluir planilhas' }
  },
  github: {
    read_repos: { scope: 'public_repo', label: 'Ler repositórios' },
    create_repos: { scope: 'repo', label: 'Criar repositórios' },
    edit_repos: { scope: 'repo', label: 'Editar repositórios' },
    delete_repos: { scope: 'delete_repo', label: 'Excluir repositórios' },
    read_files: { scope: 'repo', label: 'Ler arquivos' },
    create_files: { scope: 'repo', label: 'Criar arquivos' },
    edit_files: { scope: 'repo', label: 'Editar arquivos' },
    create_commits: { scope: 'repo', label: 'Criar commits' },
    create_branches: { scope: 'repo', label: 'Criar branches' },
    merge_branches: { scope: 'repo', label: 'Mesclar branches' },
    create_prs: { scope: 'repo', label: 'Criar pull requests' },
    manage_issues: { scope: 'repo', label: 'Gerenciar issues' },
    manage_workflows: { scope: 'workflow', label: 'Gerenciar workflows' },
    manage_releases: { scope: 'repo', label: 'Gerenciar releases' },
    admin: { scope: 'admin:repo_hook,admin:org_hook', label: 'Acesso total' }
  },
  notion: {
    read_pages: { scope: 'pages:read', label: 'Ler páginas' },
    create_pages: { scope: 'pages:write', label: 'Criar páginas' },
    edit_pages: { scope: 'pages:write', label: 'Editar páginas' },
    delete_pages: { scope: 'pages:write', label: 'Excluir páginas' },
    read_db: { scope: 'databases:query', label: 'Ler bancos de dados' },
    create_db: { scope: 'databases:write', label: 'Criar bancos de dados' },
    edit_db: { scope: 'databases:write', label: 'Editar bancos de dados' }
  }
};

export function getPermissionScopes(provider: string, selectedPermissions: string[]): string[] {
  const providerScopes = PERMISSION_SCOPES[provider];
  if (!providerScopes) return [];
  
  const scopes = new Set<string>();
  selectedPermissions.forEach(perm => {
    const scopeData = providerScopes[perm];
    if (scopeData) scopes.add(scopeData.scope);
  });
  
  return Array.from(scopes);
}

export function logPermissionAudit(telegramId: number, provider: string, permissions: string[], action: 'grant' | 'revoke') {
  const timestamp = new Date().toISOString();
  const log = {
    timestamp,
    action,
    provider,
    telegramId,
    permissions,
    ip: process.env.CLIENT_IP || 'unknown'
  };
  console.log(`📋 [AUDIT] ${JSON.stringify(log)}`);
}

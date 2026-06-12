/**
 * integrations/types.ts
 * Tipagens centrais do sistema de integrações ConectaClaw
 */

export interface OAuthTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    scope?: string;
    email?: string;
}

export interface UserConnection {
    userId: number;
    provider: IntegrationProvider;
    tokens: OAuthTokens;
    connectedAt: number;
}

export type IntegrationProvider = 'google' | 'notion' | 'trello' | 'github';

export interface IntegrationAction {
    provider: IntegrationProvider;
    action: string;
    params: Record<string, any>;
}

export interface GmailMessage {
    id: string;
    snippet: string;
    subject: string;
    from: string;
    date: string;
}

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
}

export interface CalendarEvent {
    id?: string;
    summary: string;
    description?: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
    attendees?: Array<{ email: string }>;
}

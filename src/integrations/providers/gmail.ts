/**
 * integrations/providers/gmail.ts
 * Ações do Gmail via API
 */
import axios from 'axios';
import { GmailMessage } from '../types.js';

async function gmailRequest(accessToken: string, method: 'get' | 'post', url: string, data?: any) {
    const res = await axios({ method, url, data, headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 });
    return res.data;
}

export async function listEmails(accessToken: string, maxResults = 5): Promise<GmailMessage[]> {
    const listRes = await gmailRequest(accessToken, 'get',
        `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=is:unread`);

    if (!listRes.messages?.length) return [];

    const messages: GmailMessage[] = [];
    for (const msg of listRes.messages.slice(0, maxResults)) {
        const detail = await gmailRequest(accessToken, 'get',
            `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);

        const headers = detail.payload?.headers || [];
        const get = (name: string) => headers.find((h: any) => h.name === name)?.value || '';

        messages.push({
            id: msg.id,
            snippet: detail.snippet || '',
            subject: get('Subject'),
            from: get('From'),
            date: get('Date')
        });
    }
    return messages;
}

export async function sendEmail(accessToken: string, to: string, subject: string, body: string): Promise<void> {
    const raw = btoa(unescape(encodeURIComponent(
        `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
    ))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    await gmailRequest(accessToken, 'post',
        'https://www.googleapis.com/gmail/v1/users/me/messages/send', { raw });
}

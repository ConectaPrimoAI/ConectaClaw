/**
 * integrations/providers/drive.ts
 * Ações do Google Drive via API
 */
import axios from 'axios';
import { DriveFile } from '../types.js';

export async function searchFiles(accessToken: string, query: string, maxResults = 5): Promise<DriveFile[]> {
    const res = await axios.get('https://www.googleapis.com/drive/v3/files', {
        params: {
            q: `name contains '${query}' and trashed=false`,
            pageSize: maxResults,
            fields: 'files(id,name,mimeType,webViewLink,modifiedTime)'
        },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000
    });
    return res.data.files || [];
}

export async function listRecentFiles(accessToken: string, maxResults = 5): Promise<DriveFile[]> {
    const res = await axios.get('https://www.googleapis.com/drive/v3/files', {
        params: {
            pageSize: maxResults,
            orderBy: 'modifiedTime desc',
            fields: 'files(id,name,mimeType,webViewLink,modifiedTime)',
            q: 'trashed=false'
        },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000
    });
    return res.data.files || [];
}

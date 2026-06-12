/**
 * integrations/providers/calendar.ts
 * Ações do Google Calendar via API
 */
import axios from 'axios';
import { CalendarEvent } from '../types.js';

export async function listEvents(accessToken: string, maxResults = 5): Promise<CalendarEvent[]> {
    const now = new Date().toISOString();
    const res = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        params: { maxResults, orderBy: 'startTime', singleEvents: true, timeMin: now },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000
    });
    return res.data.items || [];
}

export async function createEvent(accessToken: string, event: CalendarEvent): Promise<CalendarEvent> {
    const res = await axios.post(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        event,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 }
    );
    return res.data;
}

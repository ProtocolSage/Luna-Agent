// A placeholder for a real notification system (e.g., desktop, email, SMS)
function notifyUser(message: string) {
    console.log(`[REMINDER] ${new Date().toISOString()}: ${message}`);
}

export interface Reminder {
    message: string;
    time: string;
    fireAt: number;
    fired: boolean;
}

// Using a simple in-memory store for now.
let reminders: Reminder[] = [];

export class ReminderManager {
    addReminder(message: string, time: string): { scheduled: boolean; error?: string } {
        const ms = Date.parse(time) - Date.now();
        if (isNaN(ms) || ms < 0) {
            return { scheduled: false, error: "Invalid or past time" };
        }

        setTimeout(() => {
            const reminder = reminders.find(r => r.fireAt === Date.now() + ms);
            if(reminder) reminder.fired = true;
            notifyUser(message)
        }, ms);

        const newReminder: Reminder = {
            message,
            time,
            fireAt: Date.now() + ms,
            fired: false
        };
        reminders.push(newReminder);
        
        return { scheduled: true };
    }

    getReminders(): Reminder[] {
        return reminders.filter(r => !r.fired);
    }
}

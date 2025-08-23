export interface Reminder {
    message: string;
    time: string;
    fireAt: number;
    fired: boolean;
}
export declare class ReminderManager {
    addReminder(message: string, time: string): {
        scheduled: boolean;
        error?: string;
    };
    getReminders(): Reminder[];
}

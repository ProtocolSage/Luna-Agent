"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReminderManager = void 0;
// A placeholder for a real notification system (e.g., desktop, email, SMS)
function notifyUser(message) {
  console.log(`[REMINDER] ${new Date().toISOString()}: ${message}`);
}
// Using a simple in-memory store for now.
let reminders = [];
class ReminderManager {
  addReminder(message, time) {
    const ms = Date.parse(time) - Date.now();
    if (isNaN(ms) || ms < 0) {
      return { scheduled: false, error: "Invalid or past time" };
    }
    setTimeout(() => {
      const reminder = reminders.find((r) => r.fireAt === Date.now() + ms);
      if (reminder) reminder.fired = true;
      notifyUser(message);
    }, ms);
    const newReminder = {
      message,
      time,
      fireAt: Date.now() + ms,
      fired: false,
    };
    reminders.push(newReminder);
    return { scheduled: true };
  }
  getReminders() {
    return reminders.filter((r) => !r.fired);
  }
}
exports.ReminderManager = ReminderManager;

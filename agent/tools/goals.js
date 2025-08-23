"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoalManager = void 0;
// Using a simple in-memory store for now.
// This could be replaced with a database for persistence.
let tasks = [];
class GoalManager {
    addTask(task, due) {
        const newTask = { task, due, created: Date.now(), done: false };
        tasks.push(newTask);
        return newTask;
    }
    getTasks() {
        return tasks.filter(t => !t.done);
    }
    markTaskDone(taskName) {
        const task = tasks.find(t => t.task === taskName);
        if (task) {
            task.done = true;
            task.completedAt = Date.now();
            return true;
        }
        return false;
    }
}
exports.GoalManager = GoalManager;

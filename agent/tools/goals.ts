export interface Task {
    task: string;
    due?: string;
    created: number;
    done: boolean;
    completedAt?: number;
}

// Using a simple in-memory store for now.
// This could be replaced with a database for persistence.
let tasks: Task[] = [];

export class GoalManager {
    addTask(task: string, due?: string): Task {
        const newTask: Task = { task, due, created: Date.now(), done: false };
        tasks.push(newTask);
        return newTask;
    }

    getTasks(): Task[] {
        return tasks.filter(t => !t.done);
    }

    markTaskDone(taskName: string): boolean {
        const task = tasks.find(t => t.task === taskName);
        if (task) {
            task.done = true;
            task.completedAt = Date.now();
            return true;
        }
        return false;
    }
}

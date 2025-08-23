export interface Task {
    task: string;
    due?: string;
    created: number;
    done: boolean;
    completedAt?: number;
}
export declare class GoalManager {
    addTask(task: string, due?: string): Task;
    getTasks(): Task[];
    markTaskDone(taskName: string): boolean;
}

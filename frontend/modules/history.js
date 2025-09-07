// מודול היסטוריה גלובלי - Undo/Redo
class HistoryManager {
    constructor() {
        this.undoStack = [];
        this.redoStack = [];
    }
    push(state) {
        this.undoStack.push(JSON.stringify(state));
        if (this.undoStack.length > 10) {
            this.undoStack.shift(); // שמור רק 10 מצבים אחרונים
        }
        this.redoStack = [];
    }
    undo(currentState) {
        if (this.undoStack.length === 0) return currentState;
        this.redoStack.push(JSON.stringify(currentState));
        // תמיד מחזיר את המצב האחרון לפני הפעולה
        const prev = this.undoStack.pop();
        return prev ? JSON.parse(prev) : currentState;
    }
    redo(currentState) {
        if (this.redoStack.length === 0) return currentState;
        this.undoStack.push(JSON.stringify(currentState));
        return JSON.parse(this.redoStack.pop());
    }
    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }
}
export const projectsHistory = new HistoryManager();
export const journalHistory = new HistoryManager();
export const workersHistory = new HistoryManager();
export const productionHistory = new HistoryManager();
export const doneHistory = new HistoryManager();

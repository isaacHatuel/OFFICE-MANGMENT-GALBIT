// מודול יומן משימות
import { journalHistory } from './history.js';

let journalState = [];

export function fetchJournalTasks() {
    return fetch('/api/journal').then(r => r.json()).then(data => {
        journalState = data;
        return journalState;
    });
}

export function addJournalTask(newTask) {
    journalHistory.push([...journalState]);
    journalState = [...journalState, newTask];
    return [...journalState];
}

export function editJournalTask(index, updatedTask) {
    journalHistory.push([...journalState]);
    journalState = journalState.map((t, i) => i === index ? updatedTask : t);
    return [...journalState];
}

export function deleteJournalTask(index) {
    journalHistory.push([...journalState]);
    journalState = journalState.filter((_, i) => i !== index);
    return [...journalState];
}

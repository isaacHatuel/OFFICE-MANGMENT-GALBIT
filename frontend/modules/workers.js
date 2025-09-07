// מודול עובדים
import { workersHistory } from './history.js';

let workersState = [];

export function fetchWorkers() {
    return fetch('/api/workers').then(r => r.json()).then(data => {
        workersState = data;
        return workersState;
    });
}

export function addWorker(newWorker) {
    workersHistory.push([...workersState]);
    workersState = [...workersState, newWorker];
    return [...workersState];
}

export function editWorker(index, updatedWorker) {
    workersHistory.push([...workersState]);
    workersState = workersState.map((w, i) => i === index ? updatedWorker : w);
    return [...workersState];
}

export function deleteWorker(index) {
    workersHistory.push([...workersState]);
    workersState = workersState.filter((_, i) => i !== index);
    return [...workersState];
}

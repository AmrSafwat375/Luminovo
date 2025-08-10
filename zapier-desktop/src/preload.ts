import { contextBridge, ipcRenderer } from 'electron';

const api = {
  listWorkflows: () => ipcRenderer.invoke('engine:listWorkflows'),
  createOrUpdateWorkflow: (workflow: any) => ipcRenderer.invoke('engine:createOrUpdateWorkflow', { workflow }),
  deleteWorkflow: (id: string) => ipcRenderer.invoke('engine:deleteWorkflow', { id }),
  startWorkflow: (id: string) => ipcRenderer.invoke('engine:startWorkflow', { id }),
  stopWorkflow: (id: string) => ipcRenderer.invoke('engine:stopWorkflow', { id }),
};

contextBridge.exposeInMainWorld('engine', api);

declare global {
  interface Window {
    engine: typeof api;
  }
}

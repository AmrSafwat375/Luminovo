import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import axios from 'axios';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// --- Minimal workflow engine types ---
const TriggerSchema = z.object({
  type: z.literal('interval'),
  everySeconds: z.number().int().positive(),
});

const ActionSchema = z.object({
  type: z.literal('http'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  body: z.any().optional(),
});

const WorkflowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  trigger: TriggerSchema,
  action: ActionSchema,
  enabled: z.boolean().default(true),
});

export type Workflow = z.infer<typeof WorkflowSchema>;

// --- Persistence (JSON file) ---
const storePath = path.join(app.getPath('userData'), 'workflows.json');

type StoreShape = {
  workflows: Array<Omit<Workflow, 'id'> & { id: string }>;
};

function readStore(): StoreShape {
  try {
    const raw = fs.readFileSync(storePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.workflows)) return { workflows: [] };
    // Validate and coerce
    const workflows = data.workflows.map((w: any) => WorkflowSchema.parse(w));
    return { workflows };
  } catch {
    return { workflows: [] };
  }
}

function writeStore(store: StoreShape): void {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
}

function loadAllWorkflows(): Workflow[] {
  const { workflows } = readStore();
  return workflows;
}

function upsertWorkflow(def: Omit<Workflow, 'id'> & { id?: string }): Workflow {
  const withId: Workflow = WorkflowSchema.parse({
    ...def,
    id: def.id ?? uuidv4(),
  });
  const store = readStore();
  const idx = store.workflows.findIndex(w => w.id === withId.id);
  if (idx >= 0) store.workflows[idx] = withId; else store.workflows.push(withId);
  writeStore(store);
  return withId;
}

function deleteWorkflow(id: string): void {
  const store = readStore();
  const next = store.workflows.filter(w => w.id !== id);
  writeStore({ workflows: next });
}

// --- Workflow runtime ---
const runningIntervals = new Map<string, NodeJS.Timeout>();

function runWorkflow(workflow: Workflow): void {
  if (!workflow.enabled) return;
  const { everySeconds } = workflow.trigger;
  stopWorkflow(workflow.id);
  const timer = setInterval(async () => {
    try {
      if (workflow.action.type === 'http') {
        const response = await axios.request({
          method: workflow.action.method,
          url: workflow.action.url,
          headers: workflow.action.headers,
          data: workflow.action.body,
          validateStatus: () => true,
        });
        console.log(`[workflow:${workflow.id}] HTTP ${response.status}`);
      }
    } catch (error) {
      console.error(`[workflow:${workflow.id}] error`, error);
    }
  }, Math.max(1000, everySeconds * 1000));
  runningIntervals.set(workflow.id, timer);
}

function stopWorkflow(workflowId: string): void {
  const t = runningIntervals.get(workflowId);
  if (t) {
    clearInterval(t);
    runningIntervals.delete(workflowId);
  }
}

function startAllEnabled(): void {
  const all = loadAllWorkflows();
  for (const wf of all) {
    if (wf.enabled) runWorkflow(wf);
  }
}

// --- IPC API ---
const IpcChannels = {
  ListWorkflows: 'engine:listWorkflows',
  CreateOrUpdateWorkflow: 'engine:createOrUpdateWorkflow',
  DeleteWorkflow: 'engine:deleteWorkflow',
  StartWorkflow: 'engine:startWorkflow',
  StopWorkflow: 'engine:stopWorkflow',
} as const;

type IpcPayloads = {
  [IpcChannels.ListWorkflows]: never;
  [IpcChannels.CreateOrUpdateWorkflow]: { workflow: Omit<Workflow, 'id'> & { id?: string } };
  [IpcChannels.DeleteWorkflow]: { id: string };
  [IpcChannels.StartWorkflow]: { id: string };
  [IpcChannels.StopWorkflow]: { id: string };
};

ipcMain.handle(IpcChannels.ListWorkflows, () => {
  return loadAllWorkflows();
});

ipcMain.handle(IpcChannels.CreateOrUpdateWorkflow, (_evt, payload: IpcPayloads[typeof IpcChannels.CreateOrUpdateWorkflow]) => {
  const saved = upsertWorkflow(payload.workflow);
  if (saved.enabled) runWorkflow(saved); else stopWorkflow(saved.id);
  return saved;
});

ipcMain.handle(IpcChannels.DeleteWorkflow, (_evt, payload: IpcPayloads[typeof IpcChannels.DeleteWorkflow]) => {
  deleteWorkflow(payload.id);
  stopWorkflow(payload.id);
  return { ok: true } as const;
});

ipcMain.handle(IpcChannels.StartWorkflow, (_evt, payload: IpcPayloads[typeof IpcChannels.StartWorkflow]) => {
  const wf = loadAllWorkflows().find(w => w.id === payload.id);
  if (wf) runWorkflow(wf);
  return { ok: true } as const;
});

ipcMain.handle(IpcChannels.StopWorkflow, (_evt, payload: IpcPayloads[typeof IpcChannels.StopWorkflow]) => {
  stopWorkflow(payload.id);
  return { ok: true } as const;
});

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  mainWindow.webContents.openDevTools();
};

app.on('ready', () => {
  createWindow();
  startAllEnabled();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

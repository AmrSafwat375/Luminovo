/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.ts` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css';

const appRoot = document.createElement('div');
appRoot.id = 'app-root';
document.body.innerHTML = '';
document.body.appendChild(appRoot);

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type WorkflowForm = {
  id?: string;
  name: string;
  everySeconds: number;
  method: HttpMethod;
  url: string;
  headers: string; // JSON string
  body: string; // JSON string
  enabled: boolean;
};

const defaultForm: WorkflowForm = {
  name: 'My HTTP Ping',
  everySeconds: 60,
  method: 'GET',
  url: 'https://httpbin.org/get',
  headers: '{"User-Agent":"zapier-desktop"}',
  body: '{}',
  enabled: true,
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, children: Array<Node | string> = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'onclick') (node as any).onclick = v;
    else if (k === 'value') (node as any).value = v;
    else if (k === 'type') (node as any).type = v;
    else if (k === 'checked') (node as any).checked = v;
    else node.setAttribute(k, String(v));
  }
  for (const child of children) {
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function renderForm(form: WorkflowForm, onChange: (f: WorkflowForm) => void): HTMLElement {
  const container = el('div', { className: 'form' });

  const nameInput = el('input', { value: form.name, placeholder: 'Workflow name', oninput: (e: any) => { form.name = e.target.value; onChange(form); } });
  const everyInput = el('input', { type: 'number', value: String(form.everySeconds), oninput: (e: any) => { form.everySeconds = Number(e.target.value); onChange(form); } });
  const methodSelect = el('select', { onchange: (e: any) => { form.method = e.target.value; onChange(form); } },
    ['GET','POST','PUT','PATCH','DELETE'].map(m => el('option', { value: m, selected: form.method === m }, [m])) as any
  );
  const urlInput = el('input', { value: form.url, placeholder: 'https://example.com/endpoint', oninput: (e: any) => { form.url = e.target.value; onChange(form); } });
  const headersInput = el('textarea', { rows: 3, oninput: (e: any) => { form.headers = e.target.value; onChange(form); } }, [form.headers]);
  const bodyInput = el('textarea', { rows: 4, oninput: (e: any) => { form.body = e.target.value; onChange(form); } }, [form.body]);
  const enabledInput = el('input', { type: 'checkbox', checked: form.enabled, onchange: (e: any) => { form.enabled = e.target.checked; onChange(form); } });

  const saveBtn = el('button', { onclick: async () => {
    try {
      const headersObj = form.headers ? JSON.parse(form.headers) : undefined;
      const bodyObj = form.body ? JSON.parse(form.body) : undefined;
      const workflowPayload: any = {
        id: form.id,
        name: form.name,
        enabled: form.enabled,
        trigger: { type: 'interval', everySeconds: form.everySeconds },
        action: { type: 'http', method: form.method, url: form.url, headers: headersObj, body: bodyObj },
      };
      const saved = await window.engine.createOrUpdateWorkflow(workflowPayload);
      console.log('Saved', saved);
      await refreshList();
    } catch (e) {
      alert('Invalid JSON in headers/body or save error. See console.');
      console.error(e);
    }
  } }, ['Save workflow']);

  container.append(
    el('h2', {}, ['Create / Edit Workflow']),
    el('label', {}, ['Name: ']), nameInput, el('br'),
    el('label', {}, ['Every seconds: ']), everyInput, el('br'),
    el('label', {}, ['Method: ']), methodSelect, el('br'),
    el('label', {}, ['URL: ']), urlInput, el('br'),
    el('label', {}, ['Headers (JSON): ']), headersInput, el('br'),
    el('label', {}, ['Body (JSON): ']), bodyInput, el('br'),
    el('label', {}, ['Enabled: ']), enabledInput, el('br'),
    saveBtn
  );

  return container;
}

function renderList(items: any[]): HTMLElement {
  const container = el('div', { className: 'list' });
  container.appendChild(el('h2', {}, ['Workflows']));
  const list = el('div');
  for (const wf of items) {
    const row = el('div', { className: 'row' });
    row.append(
      el('span', { className: 'row-name' }, [wf.name]),
      el('span', { className: 'row-meta' }, [`interval ${wf.trigger.everySeconds}s → ${wf.action.method} ${wf.action.url}`]),
      el('button', { onclick: async () => { await window.engine.startWorkflow(wf.id); await refreshList(); } }, ['Start']),
      el('button', { onclick: async () => { await window.engine.stopWorkflow(wf.id); await refreshList(); } }, ['Stop']),
      el('button', { onclick: async () => { await window.engine.deleteWorkflow(wf.id); await refreshList(); } }, ['Delete']),
      el('button', { onclick: () => { setFormFromWorkflow(wf); } }, ['Edit'])
    );
    list.appendChild(row);
  }
  container.appendChild(list);
  return container;
}

let currentForm: WorkflowForm = { ...defaultForm };

function setFormFromWorkflow(wf: any) {
  currentForm = {
    id: wf.id,
    name: wf.name,
    everySeconds: wf.trigger.everySeconds,
    method: wf.action.method,
    url: wf.action.url,
    headers: JSON.stringify(wf.action.headers ?? {}),
    body: JSON.stringify(wf.action.body ?? {}),
    enabled: wf.enabled,
  };
  mount();
}

async function refreshList() {
  const items = await window.engine.listWorkflows();
  const listRoot = document.getElementById('list-root');
  if (listRoot) {
    listRoot.replaceWith(renderList(items));
    renderHeaderCount(items.length);
  }
}

function renderHeaderCount(count: number) {
  const header = document.getElementById('header-total');
  if (header) header.textContent = String(count);
}

function mount() {
  appRoot.innerHTML = '';
  const header = el('div', { className: 'header' }, [
    el('h1', {}, ['Zapier Desktop (MVP) – Workflows: ', el('span', { id: 'header-total' }, ['0'])])
  ]);
  const form = renderForm(currentForm, f => { currentForm = { ...f }; });
  const listContainer = renderList([]);
  listContainer.id = 'list-root';
  appRoot.append(header, form, listContainer);
}

mount();
refreshList();

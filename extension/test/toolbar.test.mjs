import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function fixture(sendMessage = async () => {}) {
  let click;
  const messages = [], tabs = [], badges = [], titles = [], listeners = [];
  const source = (await readFile(new URL('../src/background.ts', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, {
    exports: {}, registerAuth() {},
    getSettings: async () => ({ dashboardUrl: 'https://dashboard.example' }),
    dashboardLink: settings => settings.dashboardUrl,
    chrome: {
      runtime: { onMessage: { addListener: fn => listeners.push(fn) } },
      action: {
        onClicked: { addListener: fn => { click = fn; } },
        setBadgeText: async value => { badges.push(value.text); },
        setTitle: async value => { titles.push(value.title); },
      },
      tabs: {
        sendMessage: async (id, msg) => { messages.push({ id, type: msg.type }); return sendMessage(); },
        create: async value => { tabs.push(value.url); },
      },
    },
  });
  return { click, messages, tabs, badges, titles, listeners };
}

test('toolbar opens the sidebar even when Chrome omits the tab URL', async () => {
  const f = await fixture();
  await f.click({ id: 42 });
  assert.deepEqual(f.messages, [{ id: 42, type: 'll:toggle-panel' }]);
  assert.deepEqual(f.tabs, []);
  assert.deepEqual(f.badges, ['']);
});

test('a missing sidebar script shows refresh guidance and never opens the dashboard', async () => {
  const f = await fixture(async () => { throw Error('Receiving end does not exist'); });
  await f.click({ id: 42, url: 'https://www.youtube.com/watch?v=test' });
  assert.deepEqual(f.tabs, []);
  assert.deepEqual(f.badges, ['↻']);
  assert.match(f.titles[0], /refresh the page/);
});

test('the dashboard opens only through the explicit sidebar message', async () => {
  const f = await fixture();
  const reply = await new Promise(resolve => {
    for (const listener of f.listeners) listener({ type: 'll:open-dashboard' }, {}, resolve);
  });
  assert.equal(reply.ok, true);
  assert.deepEqual(f.tabs, ['https://dashboard.example']);
});

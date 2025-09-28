const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'todos.json');

let cache = null; // in-memory cache of all todos { [chatKey]: { items: [...] } }
let loading = null;

async function ensureDataDir() {
  await fsp.mkdir(DATA_DIR, { recursive: true }).catch(() => {});
}

async function loadAll() {
  if (cache) return cache;
  if (loading) return loading;
  loading = (async () => {
    await ensureDataDir();
    try {
      const buf = await fsp.readFile(DATA_FILE, 'utf8');
      cache = JSON.parse(buf);
      if (!cache || typeof cache !== 'object') cache = {};
    } catch (e) {
      cache = {};
    }
    return cache;
  })();
  try { return await loading; } finally { loading = null; }
}

async function saveAll() {
  await ensureDataDir();
  const tmp = DATA_FILE + '.tmp';
  const data = JSON.stringify(cache || {}, null, 2);
  await fsp.writeFile(tmp, data, 'utf8');
  await fsp.rename(tmp, DATA_FILE);
}

function getChatKey(source) {
  if (!source) return 'unknown';
  if (source.groupId) return `group:${source.groupId}`;
  if (source.roomId) return `room:${source.roomId}`;
  if (source.userId) return `user:${source.userId}`;
  return 'unknown';
}

async function addTodoForSource(source, item) {
  const key = getChatKey(source);
  await loadAll();
  if (!cache[key]) cache[key] = { items: [] };
  const toAdd = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    text: (item.text || '').trim(),
    createdAt: new Date().toISOString(),
    userId: item.userId || null,
    meta: item.meta || null,
  };
  cache[key].items.push(toAdd);
  await saveAll();
  return toAdd;
}

async function listTodosForSource(source, { limit = 20 } = {}) {
  const key = getChatKey(source);
  await loadAll();
  const items = cache[key]?.items || [];
  if (!limit || limit <= 0) return items.slice();
  return items.slice(-limit);
}

module.exports = {
  addTodoForSource,
  listTodosForSource,
  getChatKey,
};


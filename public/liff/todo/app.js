async function getLiffId() {
  const r = await fetch('/liff/config');
  const j = await r.json();
  return j.liffId || '';
}

function buildChatKey(ctx) {
  if (!ctx) return 'unknown';
  if (ctx.type === 'group' && ctx.groupId) return 'group:' + ctx.groupId;
  if (ctx.type === 'room' && ctx.roomId) return 'room:' + ctx.roomId;
  if (ctx.type === 'utou' && (ctx.userId || ctx.utouId)) return 'user:' + (ctx.userId || ctx.utouId);
  return 'user:' + (ctx?.userId || 'unknown');
}

async function init() {
  const liffId = await getLiffId();
  if (!liffId) {
    document.getElementById('ctx').textContent = 'ยังไม่ได้ตั้งค่า LIFF_TODO_ID';
    return;
  }
  await liff.init({ liffId });
  // Strict gating: show only when running inside LINE client.
  const inClient = typeof liff.isInClient === 'function' ? liff.isInClient() : false;
  if (!inClient) {
    const ctxEl = document.getElementById('ctx');
    ctxEl.textContent = 'โปรดเปิดหน้าจอนี้ผ่าน LINE (LIFF) เท่านั้น';
    const form = document.getElementById('form');
    if (form) form.style.display = 'none';
    const listEl = document.getElementById('list');
    if (listEl) listEl.innerHTML = '<li class="muted">(ปิดการใช้งานนอก LIFF)</li>';
    return;
  }
  const ctx = typeof liff.getContext === 'function' ? liff.getContext() : null;
  if (!ctx || !ctx.type) {
    const ctxEl = document.getElementById('ctx');
    ctxEl.textContent = 'ไม่พบบริบทของ LIFF กรุณาเปิดผ่านแชทอีกครั้ง';
    const form = document.getElementById('form');
    if (form) form.style.display = 'none';
    const listEl = document.getElementById('list');
    if (listEl) listEl.innerHTML = '<li class="muted">(ไม่พบบริบทของ LIFF)</li>';
    return;
  }
  const chatKey = buildChatKey(ctx);
  const ctxEl = document.getElementById('ctx');
  ctxEl.textContent = `บริบท: ${ctx.type || 'unknown'} (${chatKey})`;

  const listEl = document.getElementById('list');
  const showDoneEl = document.getElementById('showDone');

  async function render() {
    listEl.innerHTML = '<li class="muted">กำลังโหลด...</li>';
    try {
      const url = `/api/todos?chatKey=${encodeURIComponent(chatKey)}&includeDone=${showDoneEl.checked ? '1' : '0'}&limit=200`;
      const r = await fetch(url);
      const j = await r.json();
      const items = j.items || [];
      if (!items.length) {
        listEl.innerHTML = '<li class="muted">ยังไม่มีรายการ</li>';
        return;
      }
      listEl.innerHTML = '';
      for (const it of items) {
        const li = document.createElement('li');
        const text = document.createElement('div');
        text.className = 'task-text' + (String(it.status).toLowerCase() === 'done' ? ' done' : '');
        text.textContent = it.text;
        const meta = document.createElement('div');
        meta.className = 'muted';
        meta.textContent = new Date(it.createdAt || Date.now()).toLocaleString();
        const actions = document.createElement('div');
        actions.className = 'actions';
        const btnDone = document.createElement('button');
        btnDone.textContent = String(it.status).toLowerCase() === 'done' ? 'ยกเลิกเสร็จ' : 'ทำเสร็จ';
        btnDone.className = 'secondary';
        btnDone.onclick = async () => {
          await fetch(`/api/todos/${encodeURIComponent(it.id)}/done`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: String(it.status).toLowerCase() !== 'done' }) });
          await render();
        };
        const btnDel = document.createElement('button');
        btnDel.textContent = 'ลบ';
        btnDel.className = 'secondary';
        btnDel.onclick = async () => {
          if (!confirm('ลบรายการนี้?')) return;
          await fetch(`/api/todos/${encodeURIComponent(it.id)}`, { method: 'DELETE' });
          await render();
        };
        actions.append(btnDone, btnDel);
        const left = document.createElement('div');
        left.append(text, meta);
        li.append(left, actions);
        listEl.append(li);
      }
    } catch (e) {
      listEl.innerHTML = `<li class="muted">เกิดข้อผิดพลาด: ${e.message || e}</li>`;
    }
  }

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = document.getElementById('text').value.trim();
    if (!text) return;
    await fetch('/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatKey, text }) });
    document.getElementById('text').value = '';
    await render();
  });
  document.getElementById('refresh').addEventListener('click', render);
  document.getElementById('showDone').addEventListener('change', render);

  await render();
}

document.addEventListener('DOMContentLoaded', init);

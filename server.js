const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// LINE Bot configuration
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const DEFAULT_SHEETS_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '';
const DEFAULT_SHEETS_NAME = process.env.GOOGLE_SHEETS_SHEET_NAME || 'Sheet1';
const DEFAULT_SHEETS_DATE_COL = process.env.GOOGLE_SHEETS_DATE_COL || 'A';
const DEFAULT_SHEETS_TYPE_COL = process.env.GOOGLE_SHEETS_TYPE_COL || 'B';
const DEFAULT_SHEETS_AMOUNT_COL = process.env.GOOGLE_SHEETS_AMOUNT_COL || 'C';
// Default ToDo backend to Google Sheets so it works without env
const TODO_BACKEND = (process.env.TODO_BACKEND || 'sheets').toLowerCase();
let todoProvider;
if (TODO_BACKEND.startsWith('google-task')) {
    todoProvider = require('./googleTasks');
} else if (TODO_BACKEND.startsWith('sheet')) {
    todoProvider = require('./todoSheets');
} else {
    todoProvider = require('./todoStore');
}

// Verify LINE signature
function verifySignature(body, signature) {
    const hash = crypto
        .createHmac('SHA256', LINE_CHANNEL_SECRET)
        .update(body, 'utf8')
        .digest('base64');
    return hash === signature;
}

function sanitizeForLine(text) {
    try {
        let t = String(text ?? '');
        // Normalize line breaks
        t = t.replace(/\r\n?/g, '\n');
        // Trim trailing spaces on each line
        t = t.replace(/[ \t]+$/gm, '');
        // Collapse 3+ blank lines to 2
        t = t.replace(/\n{3,}/g, '\n\n');
        // Remove trailing blank lines
        t = t.replace(/\n+$/g, '');
        return t;
    } catch (_) {
        return String(text ?? '');
    }
}

function normalizeTextForCommands(text) {
    try {
        let t = String(text ?? '');
        // Remove zero-width spaces to make regex reliable
        t = t.replace(/[\u200B-\u200D\uFEFF]/g, '');
        // Trim
        t = t.trim();
        // Strip a leading @mention like "@NeezsPilot " (common in group chats)
        t = t.replace(/^\s*@[^\s]+\s+/, '');
        return t;
    } catch (_) {
        return String(text ?? '').trim();
    }
}

// Send message to LINE
async function sendLineMessage(replyToken, message) {
    try {
        const text = sanitizeForLine(message);
        const response = await axios.post('https://api.line.me/v2/bot/message/reply', {
            replyToken: replyToken,
            messages: [{
                type: 'text',
                text
            }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
            }
        });
        console.log('LINE message sent successfully');
    } catch (error) {
        console.error('Error sending LINE message:', error.response?.data || error.message);
    }
}

// Send arbitrary LINE messages (array of message objects)
async function sendLineMessages(replyToken, messages) {
    try {
        const response = await axios.post('https://api.line.me/v2/bot/message/reply', {
            replyToken,
            messages,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
            }
        });
        console.log('LINE messages sent successfully');
    } catch (error) {
        console.error('Error sending LINE messages:', error.response?.data || error.message);
    }
}

// Download message content from LINE (image, etc.)
async function getLineMessageContent(messageId) {
    const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
    const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
            'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        }
    });
    return { buffer: Buffer.from(resp.data), contentType: resp.headers['content-type'] || 'application/octet-stream' };
}

// Send image to Gemini (image understanding)
async function sendImageToGemini(imageBuffer, contentType, userHintText = '') {
    try {
        const base64 = imageBuffer.toString('base64');
        const promptPrefix = userHintText && userHintText.trim().length > 0
            ? `โปรดตอบเป็นภาษาไทย โดยพิจารณาตามคำสั่งผู้ใช้: ${userHintText}\n\n`
            : 'โปรดอธิบายรูปนี้เป็นภาษาไทยอย่างกระชับ และแยกประเด็นที่สำคัญ\n\n';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;
        const body = {
            contents: [{
                parts: [
                    { text: promptPrefix },
                    { inlineData: { mimeType: contentType || 'image/jpeg', data: base64 } }
                ]
            }],
            generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 800,
                topP: 0.8,
                topK: 32
            }
        };
        const response = await axios.post(url, body, { headers: { 'Content-Type': 'application/json' } });
        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'ขออภัย ไม่สามารถวิเคราะห์รูปนี้ได้';
    } catch (error) {
        console.error('Error calling Gemini Image API:', error.response?.data || error.message);
        return 'ขออภัย เกิดข้อผิดพลาดในการวิเคราะห์รูปภาพ';
    }
}

// Generate an image using Gemini 2.5 Flash Image Preview, return Buffer and contentType
async function generateImageWithGemini(prompt) {
    try {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent';
        const body = {
            contents: [{ parts: [{ text: prompt }]}],
        };
        const headers = {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY,
        };
        const response = await axios.post(url, body, { headers });
        const parts = response.data?.candidates?.[0]?.content?.parts || [];
        const img = parts.find(p => p.inlineData?.data && (p.inlineData?.mimeType?.startsWith?.('image/') || true));
        if (!img) throw new Error('No image data returned');
        const data = img.inlineData.data;
        const mimeType = img.inlineData.mimeType || 'image/png';
        const buffer = Buffer.from(data, 'base64');
        return { buffer, contentType: mimeType };
    } catch (error) {
        console.error('Error generating image with Gemini:', error.response?.data || error.message);
        throw new Error('ไม่สามารถสร้างรูปภาพได้ โปรดตรวจสอบสิทธิ์ของ API และโมเดล');
    }
}

// In-memory store for generated images
const generatedImages = new Map(); // id -> { buffer, contentType, expiresAt }
const IMAGE_TTL_MS = 60 * 60 * 1000; // 1 hour

function putGeneratedImage(buffer, contentType) {
    const id = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + IMAGE_TTL_MS;
    generatedImages.set(id, { buffer, contentType, expiresAt });
    return id;
}

function cleanupGeneratedImages() {
    const now = Date.now();
    for (const [id, v] of generatedImages.entries()) {
        if (v.expiresAt <= now) generatedImages.delete(id);
    }
}

// Serve generated images
app.get('/generated/:id', (req, res) => {
    cleanupGeneratedImages();
    const rec = generatedImages.get(req.params.id);
    if (!rec) return res.status(404).send('Not found');
    res.set('Content-Type', rec.contentType || 'image/png');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(rec.buffer);
});

// Helpers: Thai month parsing and number formatting
function toThaiMonth(m) {
    const th = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    return th[m-1] || `${m}`;
}
function parseMonthYear(text) {
    const t = (text || '').trim().toLowerCase();
    const th = {
        'มกราคม':1,'กุมภาพันธ์':2,'มีนาคม':3,'เมษายน':4,'พฤษภาคม':5,'มิถุนายน':6,
        'กรกฎาคม':7,'สิงหาคม':8,'กันยายน':9,'ตุลาคม':10,'พฤศจิกายน':11,'ธันวาคม':12,
        'ม.ค.':1,'ก.พ.':2,'มี.ค.':3,'เม.ย.':4,'พ.ค.':5,'มิ.ย.':6,'ก.ค.':7,'ส.ค.':8,'ก.ย.':9,'ต.ค.':10,'พ.ย.':11,'ธ.ค.':12
    };
    const en = {
        'january':1,'february':2,'march':3,'april':4,'may':5,'june':6,'july':7,'august':8,'september':9,'october':10,'november':11,'december':12,
        'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,'jul':7,'aug':8,'sep':9,'sept':9,'oct':10,'nov':11,'dec':12
    };
    // 1) yyyy-mm or yyyy/mm
    let m = t.match(/(20\d{2}|19\d{2})[-\/](\d{1,2})/);
    if (m) {
        const year = parseInt(m[1],10); const month = parseInt(m[2],10);
        if (month>=1 && month<=12) return { year, month };
    }
    // 2) mm/yyyy
    m = t.match(/(\d{1,2})[-\/]?(\s*)(20\d{2}|19\d{2})/);
    if (m && parseInt(m[1],10)>=1 && parseInt(m[1],10)<=12) {
        return { month: parseInt(m[1],10), year: parseInt(m[3],10) };
    }
    // 3) thai/en month name + year
    const parts = t.split(/\s+/);
    if (parts.length >= 2) {
        const mm = th[parts[0]] ?? en[parts[0]];
        const yy = parseInt(parts[1],10);
        if (mm && yy) return { month: mm, year: yy };
    }
    return null;
}
function formatNumber(n) {
    return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(n || 0);
}

// Search with Brave via MCP (falls back to direct HTTP on failure)
async function searchWithBrave(query) {
    // Try MCP first
    try {
        const mcp = await import('./mcp/client.mjs');
        const results = await mcp.braveMcpSearch(query, 5, { mkt: 'th-TH', safesearch: 'moderate' });
        if (Array.isArray(results) && results.length) return results;
    } catch (e) {
        console.error('MCP Brave search failed, falling back. Reason:', e?.message || e);
    }
    // Fallback to direct Brave API
    try {
        if (!BRAVE_API_KEY) return [];
        const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
            params: {
                q: query,
                count: 5,
                offset: 0,
                mkt: 'th-TH',
                safesearch: 'moderate'
            },
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': BRAVE_API_KEY
            }
        });
        const results = response.data.web?.results || [];
        return results.map(result => ({
            title: result.title,
            url: result.url,
            description: result.description
        }));
    } catch (error) {
        console.error('Error calling Brave Search API (fallback):', error.response?.data || error.message);
        return [];
    }
}

// Send message to Gemini
async function sendToGemini(userMessage) {
    try {
        // Check if user is asking for current information or search
        const searchKeywords = ['ข่าว', 'news', 'ล่าสุด', 'ปัจจุบัน', 'วันนี้', 'เมื่อไหร่', 'ที่ไหน', 'อย่างไร', 'ราคา', 'อัตรา', 'ค่าเงิน'];
        const needsSearch = searchKeywords.some(keyword => userMessage.includes(keyword));
        
        let searchResults = '';
        if (needsSearch) {
            const results = await searchWithBrave(userMessage);
            if (results.length > 0) {
                searchResults = '\n\nข้อมูลล่าสุดจาก Brave Search:\n';
                results.forEach((result, index) => {
                    searchResults += `${index + 1}. ${result.title}\n   ${result.description}\n   ${result.url}\n\n`;
                });
            }
        }

        const prompt = `คุณเป็นผู้ช่วย AI ที่เป็นมิตรและช่วยเหลือผู้ใช้ ตอบคำถามเป็นภาษาไทย${searchResults}

คำถาม: ${userMessage}`;

        const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1000,
                topP: 0.8,
                topK: 10
            }
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Error calling Gemini API:', error.response?.data || error.message);
        return 'ขออภัย เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง';
    }
}

// Webhook endpoint
app.post('/webhook', async (req, res) => {
    try {
        const signature = req.headers['x-line-signature'];
        const body = JSON.stringify(req.body);

        // Verify signature
        if (!verifySignature(body, signature)) {
            console.log('Invalid signature');
            return res.status(401).send('Unauthorized');
        }

        const events = req.body.events;
        
        for (const event of events) {
            if (event.type === 'message' && event.message.type === 'text') {
                const userMessage = event.message.text;
                const replyToken = event.replyToken;
                const sourceType = event.source?.type;
                const inGroupLike = sourceType === 'group' || sourceType === 'room';
                
                // Commands (no Gemini call)
                const textNorm = normalizeTextForCommands(userMessage);
                const isSlashCommand = /^\/(mcp|image|todo|add|list)(\s|$)/i.test(textNorm);
                const hasMentionMeta = Array.isArray(event.message?.mention?.mentionees) && event.message.mention.mentionees.length > 0;
                const startsWithAt = (userMessage || '').trim().startsWith('@');
                const isExplicitMention = hasMentionMeta || startsWithAt;
                // In groups/rooms: respond only when slash command or explicit mention
                if (inGroupLike && !(isSlashCommand || isExplicitMention)) continue;
                if (/^\/mcp(\s|$)/i.test(textNorm)) {
                    console.log('Handling /mcp command');
                    try {
                        const mcp = await import('./mcp/client.mjs');
                        const status = await mcp.getMcpStatus();
                        let msg = `MCP Status: ${status.connected ? 'connected' : 'disconnected'}`;
                        if (status.connected) {
                            const info = status.serverInfo || {};
                            const name = info.name || 'unknown';
                            const ver = info.version || 'unknown';
                            const pid = status.pid ? ` (pid ${status.pid})` : '';
                            msg += `\nServer: ${name} v${ver}${pid}`;
                            if (status.tools?.length) {
                                msg += `\nTools:`;
                                for (const t of status.tools) {
                                    msg += `\n- ${t.name}${t.title && t.title !== t.name ? ` (${t.title})` : ''}`;
                                }
                            } else {
                                msg += `\nTools: (none)`;
                            }
                        }
                        await sendLineMessage(replyToken, msg);
                    } catch (e) {
                        await sendLineMessage(replyToken, `MCP status error: ${e?.message || String(e)}`);
                    }
                    continue;
                }

                // To-do add: supports:
                // - /add to do list <text>
                // - /add to do <text>
                // - /add todo <text>
                // - /todo add <text>
                const addTodoMatch = textNorm.match(/^\/add\s+to\s*do\s+list\s+(.+)/i)
                    || textNorm.match(/^\/add\s+to\s*do\s+(.+)/i)
                    || textNorm.match(/^\/add\s+todo\s+(.+)/i)
                    || textNorm.match(/^\/todo\s+add\s+(.+)/i);
                if (addTodoMatch) {
                    console.log('Handling /add to do command');
                    const taskText = (addTodoMatch[1] || '').trim();
                    if (!taskText) {
                        await sendLineMessage(replyToken, 'โปรดพิมพ์ /add to do list ตามด้วยสิ่งที่ต้องทำ\nเช่น /add to do list ซื้อของวันจันทร์');
                        continue;
                    }
                    try {
                        const item = await todoProvider.addTodoForSource(event.source, {
                            text: taskText,
                            userId: event.source?.userId || null,
                            meta: { messageId: event.message?.id || null },
                        });
                        await sendLineMessage(replyToken, `เพิ่ม To Do แล้ว:\n- ${item.text}`);
                    } catch (e) {
                        await sendLineMessage(replyToken, `เพิ่ม To Do ไม่สำเร็จ: ${e?.message || 'ไม่ทราบสาเหตุ'}`);
                    }
                    continue;
                }

                // To-do list: /list to do [N]
                const listTodoMatch = textNorm.match(/^\/list\s+to\s*do(?:s)?(?:\s+(\d+))?/i)
                    || textNorm.match(/^\/todo\s+list(?:\s+(\d+))?/i);
                if (listTodoMatch) {
                    console.log('Handling /list to do command');
                    const n = parseInt(listTodoMatch[1] || '10', 10);
                    try {
                        const items = await todoProvider.listTodosForSource(event.source, { limit: isNaN(n) ? 10 : n });
                        if (!items.length) {
                            await sendLineMessage(replyToken, 'ยังไม่มี To Do ในห้องนี้');
                        } else {
                            let msg = 'To Do ล่าสุด:\n';
                            items.forEach((it, i) => { msg += `${i + 1}. ${it.text}\n`; });
                            await sendLineMessage(replyToken, msg.trim());
                        }
                    } catch (e) {
                        await sendLineMessage(replyToken, `ไม่สามารถแสดงรายการ To Do ได้: ${e?.message || 'ไม่ทราบสาเหตุ'}`);
                    }
                    continue;
                }

                // LIFF link for todo
                if (/^\/todo\s+liff/i.test(textNorm)) {
                    const liffId = process.env.LIFF_TODO_ID || process.env.LIFF_ID;
                    if (!liffId) {
                        await sendLineMessage(replyToken, 'ยังไม่ได้ตั้งค่า LIFF_TODO_ID');
                    } else {
                        await sendLineMessage(replyToken, `เปิดหน้าจัดการ To Do:\nhttps://liff.line.me/${liffId}`);
                    }
                    continue;
                }

                // To-do backend status
                if (/^\/todo\s+status/i.test(textNorm)) {
                    try {
                        let msg = `To Do backend: ${TODO_BACKEND}`;
                        if (TODO_BACKEND.startsWith('sheet')) {
                            // Prefer runtime config exported by todoSheets (hardcoded defaults), fallback to env
                            const cfg = (todoProvider && todoProvider.__config) || {};
                            const mode = cfg.MODE || (process.env.TODO_SHEETS_MODE || 'table');
                            const name = cfg.SHEET_NAME || (process.env.TODO_SHEETS_SHEET_NAME || 'Todos');
                            const sidFull = cfg.SPREADSHEET_ID || (process.env.TODO_SHEETS_SPREADSHEET_ID || '');
                            const sid = sidFull ? (sidFull.slice(0, 8) + '…') : '(not set)';
                            msg += `\nMode: ${mode}`;
                            msg += `\nSheet: ${name}`;
                            msg += `\nSpreadsheet: ${sid}`;
                            if ((mode || '').toLowerCase() === 'template') {
                                msg += `\nStart row: ${cfg.TEMPLATE_START_ROW || process.env.TODO_SHEETS_TEMPLATE_START_ROW || '3'}`;
                                msg += `\nRange: ${cfg.TEMPLATE_RANGE || process.env.TODO_SHEETS_TEMPLATE_RANGE || 'A:C'}`;
                            }
                        }
                        await sendLineMessage(replyToken, msg);
                    } catch (e) {
                        await sendLineMessage(replyToken, `Status error: ${e?.message || String(e)}`);
                    }
                    continue;
                }

                // Image generation command: /image <prompt>
                const imageMatch = textNorm.match(/^\/image\s+(.+)/i);
                if (imageMatch) {
                    console.log('Handling /image command');
                    const prompt = imageMatch[1].trim();
                    if (!prompt) {
                        await sendLineMessage(replyToken, 'โปรดพิมพ์ /image ตามด้วยคำอธิบายรูปภาพที่ต้องการ');
                        continue;
                    }
                    try {
                        const { buffer, contentType } = await generateImageWithGemini(prompt);
                        const id = putGeneratedImage(buffer, contentType || 'image/png');
                        const base = PUBLIC_BASE_URL;
                        if (!/^https:\/\//i.test(base)) {
                            console.warn('PUBLIC_BASE_URL is not HTTPS. LINE will reject image URLs:', base);
                            await sendLineMessage(
                                replyToken,
                                'ไม่สามารถส่งรูปได้ เนื่องจาก PUBLIC_BASE_URL ไม่ใช่ HTTPS หรือเข้าถึงไม่ได้จากภายนอก\n' +
                                'โปรดตั้งค่า PUBLIC_BASE_URL เป็นโดเมนที่เป็น HTTPS (เช่น https://<โดเมนคุณ> หรือ ngrok https) แล้วรีสตาร์ตเซิร์ฟเวอร์'
                            );
                            continue;
                        }
                        const url = `${base}/generated/${id}`;
                        await sendLineMessages(replyToken, [{
                            type: 'image',
                            originalContentUrl: url,
                            previewImageUrl: url,
                        }]);
                    } catch (e) {
                        await sendLineMessage(replyToken, e.message || 'ไม่สามารถสร้างรูปภาพได้');
                    }
                    continue;
                }

                // Sheets status command
                if (/^\/sheet\s+status/i.test(textNorm)) {
                    try {
                        const sheets = await import('./mcp/sheets-client.mjs');
                        const status = await sheets.getSheetsMcpStatus();
                        let msg = `Sheets MCP: ${status.connected ? 'connected' : 'disconnected'}`;
                        if (status.connected) {
                            const info = status.serverInfo || {};
                            msg += `\nServer: ${info.name || 'unknown'} v${info.version || 'unknown'}`;
                            if (status.tools?.length) {
                                msg += `\nTools:`;
                                for (const t of status.tools) msg += `\n- ${t.name}`;
                            }
                        }
                        await sendLineMessage(replyToken, msg);
                    } catch (e) {
                        await sendLineMessage(replyToken, `Sheets MCP status error: ${e?.message || String(e)}`);
                    }
                    continue;
                }

                // Sheets summary command: /sheet summary <month> <year>
                const sheetSummaryMatch = textNorm.match(/^\/sheet\s+summary\s+(.+)/i);
                if (sheetSummaryMatch) {
                    const whenText = sheetSummaryMatch[1].trim();
                    const { month, year } = parseMonthYear(whenText) || {};
                    if (!month || !year) {
                        await sendLineMessage(replyToken, 'โปรดระบุเดือนและปี เช่น /sheet summary ธันวาคม 2024 หรือ /sheet summary 2024-12');
                        continue;
                    }
                    const spreadsheetId = DEFAULT_SHEETS_SPREADSHEET_ID;
                    if (!spreadsheetId) {
                        await sendLineMessage(replyToken, 'ยังไม่ได้ตั้งค่า GOOGLE_SHEETS_SPREADSHEET_ID');
                        continue;
                    }
                    try {
                        const sheets = await import('./mcp/sheets-client.mjs');
                        const result = await sheets.sheetsSummaryByMonth({
                            spreadsheetId,
                            sheetName: DEFAULT_SHEETS_NAME,
                            dateCol: DEFAULT_SHEETS_DATE_COL,
                            typeCol: DEFAULT_SHEETS_TYPE_COL,
                            amountCol: DEFAULT_SHEETS_AMOUNT_COL,
                            year, month,
                        });
                        if (!result) {
                            await sendLineMessage(replyToken, 'ไม่พบผลสรุป');
                            continue;
                        }
                        const msg = `สรุปรายรับรายจ่าย ${toThaiMonth(month)} ${year}\n` +
                          `รายรับ: ${formatNumber(result.income)}\nรายจ่าย: ${formatNumber(result.expense)}\nคงเหลือ: ${formatNumber(result.net)}`;
                        await sendLineMessage(replyToken, msg);
                    } catch (e) {
                        await sendLineMessage(replyToken, `Sheets error: ${e?.message || String(e)}`);
                    }
                    continue;
                }

                // Drive list spreadsheets: /drive list [<keyword>]
                const driveListMatch = textNorm.match(/^\/drive\s+list(?:\s+(.+))?/i);
                if (driveListMatch) {
                    try {
                        const q = driveListMatch[1]?.trim();
                        const { files = [] } = await (await import('./mcp/sheets-client.mjs')).driveListSpreadsheets({
                            query: q ? `name contains '${q.replace(/'/g, "\\'")}'` : undefined,
                            pageSize: 10,
                        });
                        if (!files.length) {
                            await sendLineMessage(replyToken, 'ไม่พบไฟล์สเปรดชีตใน Google Drive ที่เข้าถึงได้');
                        } else {
                            let msg = 'รายการสเปรดชีตล่าสุด:\n';
                            files.forEach((f, i) => {
                                msg += `${i + 1}. ${f.name} (id: ${f.id})\n   ${f.webViewLink || ''}\n`;
                            });
                            await sendLineMessage(replyToken, msg);
                        }
                    } catch (e) {
                        await sendLineMessage(replyToken, `Drive list error: ${e?.message || String(e)}`);
                    }
                    continue;
                }

                // /sheet tabs <spreadsheetId>
                const sheetTabsMatch = textNorm.match(/^\/sheet\s+tabs\s+(\S+)/i);
                if (sheetTabsMatch) {
                    const spreadsheetId = sheetTabsMatch[1];
                    try {
                        const tabs = await (await import('./mcp/sheets-client.mjs')).sheetsListTabs(spreadsheetId);
                        if (!tabs.length) {
                            await sendLineMessage(replyToken, 'ไม่พบชีตในสเปรดชีตนี้');
                        } else {
                            let msg = `ชีตในสเปรดชีต ${spreadsheetId}:\n`;
                            tabs.forEach((s, i) => { msg += `${i + 1}. ${s.title}\n`; });
                            await sendLineMessage(replyToken, msg);
                        }
                    } catch (e) {
                        await sendLineMessage(replyToken, `Tabs error: ${e?.message || String(e)}`);
                    }
                    continue;
                }

                // /sheet preview <spreadsheetId> <sheetName>
                const sheetPrevMatch = textNorm.match(/^\/sheet\s+preview\s+(\S+)\s+(.+)/i);
                if (sheetPrevMatch) {
                    const spreadsheetId = sheetPrevMatch[1];
                    const sheetName = sheetPrevMatch[2];
                    try {
                        const { headers = [], rows = [] } = await (await import('./mcp/sheets-client.mjs')).sheetsPreview(spreadsheetId, sheetName, { maxCols: 10, maxRows: 5 });
                        let msg = 'พรีวิวข้อมูล:\n';
                        if (headers.length) msg += headers.join(' | ') + '\n';
                        rows.forEach(r => { msg += (r || []).join(' | ') + '\n'; });
                        await sendLineMessage(replyToken, msg.trim());
                    } catch (e) {
                        await sendLineMessage(replyToken, `Preview error: ${e?.message || String(e)}`);
                    }
                    continue;
                }

                // Send to Gemini (in group: use normalized text to remove @mention prefix)
                console.log('Handling chat message');
                const geminiInput = inGroupLike ? textNorm : userMessage;
                const geminiResponse = await sendToGemini(geminiInput);
                
                // Send response back to LINE
                await sendLineMessage(replyToken, geminiResponse);
            } else if (event.type === 'message' && event.message.type === 'image') {
                const replyToken = event.replyToken;
                const sourceType = event.source?.type;
                const inGroupLike = sourceType === 'group' || sourceType === 'room';
                if (inGroupLike) {
                    // Ignore random images in groups to avoid spam
                    continue;
                }
                try {
                    const { buffer, contentType } = await getLineMessageContent(event.message.id);
                    const geminiResponse = await sendImageToGemini(buffer, contentType, '');
                    await sendLineMessage(replyToken, geminiResponse);
                } catch (e) {
                    console.error('Image handling error:', e.response?.data || e.message);
                    await sendLineMessage(replyToken, 'ขออภัย ไม่สามารถดาวน์โหลด/วิเคราะห์รูปภาพได้');
                }
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'LINE Bot with Gemini 2.5 Flash is running' });
});

// LIFF config endpoint (provides LIFF ID to frontend)
app.get('/liff/config', (req, res) => {
    res.json({ liffId: process.env.LIFF_TODO_ID || process.env.LIFF_ID || '' });
});

// Simple ToDo API for LIFF frontend (Google Sheets backend recommended)
app.get('/api/todos', async (req, res) => {
    try {
        const chatKey = req.query.chatKey;
        const limit = Math.max(1, Math.min(parseInt(req.query.limit || '50', 10) || 50, 200));
        const includeDone = /^(1|true|yes)$/i.test(String(req.query.includeDone || 'false'));
        if (!chatKey) return res.status(400).json({ error: 'missing chatKey' });
        // Convert chatKey string to a source-like object
        const [type, id] = String(chatKey).split(':');
        const source = type === 'group' ? { type: 'group', groupId: id } : type === 'room' ? { type: 'room', roomId: id } : { type: 'user', userId: id };
        const items = await (todoProvider.listTodosForSource?.(source, { limit, includeDone }) || []);
        res.json({ items });
    } catch (e) {
        res.status(500).json({ error: e?.message || String(e) });
    }
});

app.post('/api/todos', async (req, res) => {
    try {
        const { chatKey, text, userId } = req.body || {};
        if (!chatKey || !text) return res.status(400).json({ error: 'missing chatKey or text' });
        const [type, id] = String(chatKey).split(':');
        const source = type === 'group' ? { type: 'group', groupId: id } : type === 'room' ? { type: 'room', roomId: id } : { type: 'user', userId: id };
        const item = await todoProvider.addTodoForSource(source, { text, userId });
        res.json({ item });
    } catch (e) {
        res.status(500).json({ error: e?.message || String(e) });
    }
});

app.post('/api/todos/:id/done', async (req, res) => {
    try {
        if (!todoProvider.markDoneById) return res.status(400).json({ error: 'done not supported by this backend' });
        const id = req.params.id;
        const done = req.body?.done === false ? false : true;
        const result = await todoProvider.markDoneById(id, done);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e?.message || String(e) });
    }
});

app.delete('/api/todos/:id', async (req, res) => {
    try {
        if (!todoProvider.deleteById) return res.status(400).json({ error: 'delete not supported by this backend' });
        const id = req.params.id;
        const result = await todoProvider.deleteById(id);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e?.message || String(e) });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
});

module.exports = app;

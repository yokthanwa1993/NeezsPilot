const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// LINE Bot configuration
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

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
                
                console.log('Received message:', userMessage);
                const sourceType = event.source?.type;
                const inGroupLike = sourceType === 'group' || sourceType === 'room';
                
                // Commands (no Gemini call)
                const textNorm = normalizeTextForCommands(userMessage);
                
                // In groups/rooms: only respond to explicit commands (/mcp, /image). Ignore everything else.
                if (inGroupLike && !/^\/(mcp|image)(\s|$)/i.test(textNorm)) {
                    continue;
                }
                if (/^\/mcp(\s|$)/i.test(textNorm)) {
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

                // Image generation command: /image <prompt>
                const imageMatch = textNorm.match(/^\/image\s+(.+)/i);
                if (imageMatch) {
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
                
                // Send to Gemini (only in 1:1 chats or when not filtered by group gating)
                const geminiResponse = await sendToGemini(userMessage);
                
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

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
});

module.exports = app;

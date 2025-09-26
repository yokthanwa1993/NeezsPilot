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

// Verify LINE signature
function verifySignature(body, signature) {
    const hash = crypto
        .createHmac('SHA256', LINE_CHANNEL_SECRET)
        .update(body, 'utf8')
        .digest('base64');
    return hash === signature;
}

// Send message to LINE
async function sendLineMessage(replyToken, message) {
    try {
        const response = await axios.post('https://api.line.me/v2/bot/message/reply', {
            replyToken: replyToken,
            messages: [{
                type: 'text',
                text: message
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
                
                // MCP status command (no Gemini call)
                const textNorm = (userMessage || '').trim().toLowerCase();
                if (textNorm === '/mcp' || textNorm.startsWith('/mcp ')) {
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
                
                // Send to Gemini
                const geminiResponse = await sendToGemini(userMessage);
                
                // Send response back to LINE
                await sendLineMessage(replyToken, geminiResponse);
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

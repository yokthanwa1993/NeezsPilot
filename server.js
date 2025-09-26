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

// Send message to Gemini
async function sendToGemini(userMessage) {
    try {
        const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
            contents: [{
                parts: [{
                    text: `คุณเป็นผู้ช่วย AI ที่เป็นมิตรและช่วยเหลือผู้ใช้ ตอบคำถามเป็นภาษาไทย\n\nคำถาม: ${userMessage}`
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

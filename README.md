# LINE Bot with Gemini 2.5 Flash Integration

## Environment Variables

สร้างไฟล์ `.env` และเพิ่มค่าต่อไปนี้:

```
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret
GEMINI_API_KEY=your_gemini_api_key
PORT=3000
```

## การติดตั้ง

```bash
npm install
```

## การรัน

```bash
npm start
```

สำหรับ development:
```bash
npm run dev
```

## การตั้งค่า LINE Bot

1. สร้าง LINE Official Account
2. เปิดใช้งาน Messaging API
3. ตั้งค่า Webhook URL: `https://your-domain.com/webhook`
4. เพิ่ม Channel Access Token และ Channel Secret ในไฟล์ `.env`

## การตั้งค่า Gemini API

1. ไปที่ Google AI Studio: https://aistudio.google.com/
2. สร้าง API Key
3. เพิ่ม API Key ในไฟล์ `.env`

## การทดสอบ

1. รันเซิร์ฟเวอร์: `npm start`
2. ใช้ ngrok หรือ tunnel service เพื่อเปิด webhook URL
3. ตั้งค่า webhook URL ใน LINE Developer Console
4. ทดสอบส่งข้อความใน LINE

## ฟีเจอร์

- รับข้อความจาก LINE
- ส่งข้อความไปยัง Gemini 2.5 Flash
- ตอบกลับข้อความที่ประมวลผลแล้ว
- รองรับการตรวจสอบลายเซ็นดิจิทัล
- มี health check endpoint

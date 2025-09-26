# LINE Bot with Gemini 2.5 Flash + Brave Search (via MCP) + Image

## Environment Variables

สร้างไฟล์ `.env` และเพิ่มค่าต่อไปนี้:

```
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret
GEMINI_API_KEY=your_gemini_api_key
BRAVE_API_KEY=your_brave_search_api_key
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

## การตั้งค่า Brave Search API

1. ไปที่ Brave Search API: https://brave.com/search/api/
2. สร้างบัญชีและขอ API Key
3. เพิ่ม API Key ในไฟล์ `.env`

## การตั้งค่า Gemini API

1. ไปที่ Google AI Studio: https://aistudio.google.com/
2. สร้าง API Key
3. เพิ่ม API Key ในไฟล์ `.env`

## การทดสอบ

1. รันเซิร์ฟเวอร์: `npm start`
2. ใช้ ngrok หรือ tunnel service เพื่อเปิด webhook URL
3. ตั้งค่า webhook URL ใน LINE Developer Console
4. ทดสอบส่งข้อความใน LINE และลองส่งรูปภาพเพื่อให้บอทวิเคราะห์

## ฟีเจอร์

- รับข้อความจาก LINE
- ส่งข้อความไปยัง Gemini 2.5 Flash
- เชื่อมต่อกับ Brave Search API สำหรับข้อมูลล่าสุด (ผ่าน MCP)
- วิเคราะห์รูปภาพด้วย Gemini 2.5 Flash Image: ส่งรูปในแชทเพื่อให้บอทอธิบายหรือสรุปเนื้อหาในภาพ
- ตอบกลับข้อความที่ประมวลผลแล้ว
- รองรับการตรวจสอบลายเซ็นดิจิทัล
- มี health check endpoint

## การใช้งาน Brave Search

ระบบจะใช้ Brave Search อัตโนมัติเมื่อผู้ใช้ถามคำถามที่มีคำสำคัญ:
- ข่าว, news, ล่าสุด, ปัจจุบัน
- วันนี้, เมื่อไหร่, ที่ไหน, อย่างไร
- ราคา, อัตรา, ค่าเงิน

ตัวอย่างคำถามที่ใช้ Search:
- "ข่าวล่าสุดวันนี้"
- "ราคาทองคำวันนี้"
- "อัตราแลกเปลี่ยน USD/THB"

## MCP Integration (Brave Search)

- โปรเจกต์นี้เพิ่ม MCP server สำหรับ Brave Search ที่ `mcp/brave-server.mjs`
- ตัว LINE bot เรียก Brave ผ่าน MCP client ที่ `mcp/client.mjs`
- จำเป็นต้องตั้งค่า `BRAVE_API_KEY` ใน environment เพื่อให้ MCP server เข้าถึง Brave API ได้
- หาก MCP ใช้งานไม่สำเร็จ ระบบจะ fallback ไปเรียก Brave API โดยตรงเพื่อความเสถียร

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
5. ทดลองสั่งสร้างรูปภาพด้วยคำสั่ง: `/image <คำบรรยาย>` เช่น `/image สร้างรูปหมาพันธุ์ชิวาว่า`

## ฟีเจอร์

- รับข้อความจาก LINE
- ส่งข้อความไปยัง Gemini 2.5 Flash
- เชื่อมต่อกับ Brave Search API สำหรับข้อมูลล่าสุด (ผ่าน MCP)
- วิเคราะห์รูปภาพด้วย Gemini 2.5 Flash Image: ส่งรูปในแชทเพื่อให้บอทอธิบายหรือสรุปเนื้อหาในภาพ
- สร้างรูปภาพจากข้อความด้วยคำสั่ง `/image ...` และตอบกลับเป็นรูปทันที
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

## MCP Integration (Google Sheets)

- เพิ่ม MCP server สำหรับ Google Sheets ที่ `mcp/google-sheets-server.mjs`
- เพิ่ม client ที่ `mcp/sheets-client.mjs`
- ตั้งค่า Environment Variables:
  - `GOOGLE_CLIENT_EMAIL` (Service Account)
  - `GOOGLE_PRIVATE_KEY` (ระวัง newline ใช้ค่าแท้ๆ หรือใส่ `\n` แล้วโค้ดจะแปลงให้)
  - `GOOGLE_SHEETS_SPREADSHEET_ID` (ค่าเริ่มต้นสำหรับคำสั่ง /sheet)
  - ตัวเลือก: `GOOGLE_SHEETS_SHEET_NAME` (ดีฟอลต์ `Sheet1`), `GOOGLE_SHEETS_DATE_COL` (ดีฟอลต์ A), `GOOGLE_SHEETS_TYPE_COL` (ดีฟอลต์ B), `GOOGLE_SHEETS_AMOUNT_COL` (ดีฟอลต์ C)
- การใช้ใน LINE:
  - `/sheet status` ดูสถานะการเชื่อมต่อ MCP ของ Google Sheets
  - `/sheet summary ธันวาคม 2024` หรือ `/sheet summary 2024-12` เพื่อสรุปรายรับ/รายจ่ายของเดือนนั้น
  - `/drive list [keyword]` แสดงไฟล์สเปรดชีตใน Google Drive (ล่าสุด 10 รายการ)
  - `/sheet tabs <spreadsheetId>` แสดงชื่อชีตในสเปรดชีต
  - `/sheet preview <spreadsheetId> <sheetName>` พรีวิวแถวบนสุดของชีต

## หมายเหตุเรื่องการส่งรูปภาพกลับไปที่ LINE
- การตอบกลับรูปภาพจำเป็นต้องให้ URL ของไฟล์เป็น HTTPS ที่เข้าถึงได้จากอินเทอร์เน็ต
- ตั้งค่า `PUBLIC_BASE_URL` ให้ชี้ไปยังโดเมน/URL ของเซิร์ฟเวอร์ (เช่นโดเมน production หรือ ngrok ที่เป็น https)
- ระบบมี endpoint ให้โหลดรูปที่สร้าง: `/generated/:id`

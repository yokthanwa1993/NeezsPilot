# LINE Bot with Gemini 2.5 Flash + Brave Search (via MCP) + Image

## Environment Variables

สร้างไฟล์ `.env` และเพิ่มค่าต่อไปนี้:

```
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret
GEMINI_API_KEY=your_gemini_api_key
BRAVE_API_KEY=your_brave_search_api_key
PORT=3000
TODO_BACKEND=file

# ใช้ Google Tasks (ทางเลือก)
# ตั้งค่าเพื่อเก็บ To Do ไปที่ Google Tasks แทนไฟล์
# โหมด OAuth (แนะนำสำหรับบัญชีส่วนตัว):
#TODO_BACKEND=google-tasks
#GOOGLE_TASKS_AUTH=oauth2
#GOOGLE_TASKS_CLIENT_ID=your_oauth_client_id
#GOOGLE_TASKS_CLIENT_SECRET=your_oauth_client_secret
#GOOGLE_TASKS_REFRESH_TOKEN=your_oauth_refresh_token
# (ตัวเลือก) บังคับใช้รายการเดียวทุกห้อง: ถ้าไม่ตั้ง บอทจะสร้าง list แยกตามห้อง
#GOOGLE_TASKS_LIST_ID=tasks_list_id

# โหมด Service Account (ต้องเป็น Google Workspace + เปิด Domain-wide Delegation)
#TODO_BACKEND=google-tasks
#GOOGLE_TASKS_AUTH=service-account
# ใช้อย่างใดอย่างหนึ่ง:
# 1) ไฟล์คีย์:
#GOOGLE_TASKS_SERVICE_ACCOUNT_KEY_FILE=service-account-key.json
# 2) JSON ทั้งก้อน:
#GOOGLE_TASKS_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
# หรือระบุค่าแยก:
#GOOGLE_TASKS_CLIENT_EMAIL=...
#GOOGLE_TASKS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
# และอีเมลผู้ใช้ที่จะ impersonate ภายในโดเมน:
#GOOGLE_TASKS_IMPERSONATE=user@yourdomain.com
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

## To Do ด้วย Google Sheets + LIFF (แนะนำ)

- ตั้งค่าใช้งาน:
  - `TODO_BACKEND=sheets`
  - `TODO_SHEETS_SPREADSHEET_ID=<สเปรดชีตไอดี>` (เช่น จาก URL ของ Google Sheets)
  - ตัวเลือก: `TODO_SHEETS_SHEET_NAME=Todos` (ดีฟอลต์ `Todos`)
  - Service Account: ตั้งค่าอย่างใดอย่างหนึ่ง และแชร์สเปรดชีตให้เมลของ Service Account เป็น Editor
    - คู่ค่า env: `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` (ถ้าเป็น single line ให้ใส่ `\n` แทน newline)
    - หรือไฟล์: `TODO_SHEETS_SERVICE_ACCOUNT_KEY_FILE=service-account-key.json`
    - หรือ JSON ทั้งก้อน: `TODO_SHEETS_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'`
  - LIFF: สร้าง LIFF app และตั้งค่า
    - Endpoint URL: `https://<โดเมนของคุณ>/liff/todo/`
    - Size: Full / Tall ตามต้องการ
    - เพิ่มใน `.env`: `LIFF_TODO_ID=<liffId>`

- โครงสร้างชีต (แถวที่ 1 คือ header):
  - A: `id`
  - B: `chatKey` (เช่น `group:<groupId>`, `room:<roomId>`, `user:<userId>`) 
  - C: `status` (`open`|`done`)
  - D: `text`
  - E: `createdAt`
  - F: `createdBy`
  - G: `doneAt`
  - H: `deleted` (1 หรือเว้นว่าง)
  - ระบบจะสร้าง header ให้ถ้ายังไม่มี
  - รองรับชื่อชีตที่มีช่องว่าง/อักขระพิเศษ (เช่น `To do`, `To-do list`) โดยระบบจะใส่เครื่องหมาย ' อัตโนมัติ

- การใช้งานจาก LINE:
  - สั่งเปิด LIFF: `/todo liff` (ต้องตั้งค่า `LIFF_TODO_ID` ก่อน)
  - เพิ่มรายการผ่านแชท: `/add to do <ข้อความ>`
  - ดูรายการผ่านแชท: `/list to do [N]`
  - หมายเหตุ: ในกลุ่ม/ห้อง บอทตอบเฉพาะข้อความที่ขึ้นต้นด้วย `/` หรือถูก @mention

## To Do แบบง่าย (ในไฟล์)

- เพิ่มรายการ: พิมพ์ `/add to do <ข้อความ>` เช่น `/add to do ซื้อของวันจันทร์`
- ดูรายการล่าสุด: พิมพ์ `/list to do` หรือ `/list to do 20` เพื่อดู N รายการล่าสุด
- ระบบเก็บข้อมูลเป็นไฟล์ในโปรเจกต์ที่ `data/todos.json` แยกตามห้องแชท (group/room/user)
- หมายเหตุ: ยังไม่มีคำสั่งลบ/ทำเสร็จ และข้อมูลอยู่ในไฟล์ภายในเซิร์ฟเวอร์เท่านั้น (เหมาะสำหรับใช้งานเบื้องต้น)

## To Do ผ่าน Google Tasks (ตัวเลือก)

- เปลี่ยน `TODO_BACKEND=google-tasks`
- เลือกโหมด auth:
  - OAuth: ตั้งค่า `GOOGLE_TASKS_CLIENT_ID`, `GOOGLE_TASKS_CLIENT_SECRET`, `GOOGLE_TASKS_REFRESH_TOKEN`
  - Service Account (Workspace เท่านั้น): ตั้งค่า `GOOGLE_TASKS_AUTH=service-account` และคีย์ + `GOOGLE_TASKS_IMPERSONATE`
- ถ้าไม่ตั้ง `GOOGLE_TASKS_LIST_ID` บอทจะสร้าง Task List ต่อห้องอัตโนมัติ ชื่อ `NeezsPilot: <ชนิด>:<ไอดี>`
- ใช้คำสั่งเดิม: `/add to do ...`, `/list to do [N]`
- หมายเหตุสำคัญ:
  - บัญชีส่วนตัว (gmail.com): ใช้ Service Account ไม่ได้ ให้ใช้ OAuth เท่านั้น
  - Service Account ใช้ได้เมื่อเป็น Google Workspace และเปิด Domain-wide Delegation พร้อมอนุญาต scope `https://www.googleapis.com/auth/tasks`, และต้องตั้ง `GOOGLE_TASKS_IMPERSONATE` เป็นอีเมลผู้ใช้ในโดเมน

### วิธีได้ Refresh Token อย่างย่อ (ครั้งเดียว)
- สร้าง OAuth 2.0 Client (Desktop) ใน Google Cloud Console เปิดใช้ API: Google Tasks API
- ใช้เครื่องมือเช่น `googleapis` script หรือ `oauth2l` เพื่อขอ consent และรับ refresh token ด้วย scope `https://www.googleapis.com/auth/tasks`
- ใส่ค่า refresh token ที่ได้ลงใน `.env`

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

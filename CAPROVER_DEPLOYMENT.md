# CapRover Deployment Guide

## การ Deploy บน CapRover

### 1. เตรียม CapRover Server
- ติดตั้ง CapRover บนเซิร์ฟเวอร์ของคุณ
- เข้าสู่ CapRover Dashboard

### 2. สร้าง App ใหม่
1. ไปที่ "Apps" ใน CapRover Dashboard
2. คลิก "Create New App"
3. ตั้งชื่อ app: `neezs-pilot-line-bot`
4. คลิก "Create New App"

### 3. ตั้งค่า Environment Variables
ใน CapRover Dashboard:
1. ไปที่ App Settings > Environment Variables
2. เพิ่มตัวแปรต่อไปนี้:
   ```
   LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
   LINE_CHANNEL_SECRET=your_line_channel_secret
   GEMINI_API_KEY=your_gemini_api_key
   PORT=3000
   ```

### 4. Deploy โค้ด
#### วิธีที่ 1: Deploy จาก GitHub
1. ไปที่ "Deployment" tab
2. เลือก "Deploy from GitHub"
3. เชื่อมต่อ GitHub repository
4. เลือก branch `main`
5. คลิก "Deploy"

#### วิธีที่ 2: Deploy จาก Local
```bash
# ติดตั้ง CapRover CLI
npm install -g caprover

# Login to CapRover
caprover login

# Deploy
caprover deploy
```

### 5. ตั้งค่า Domain
1. ไปที่ "HTTP Settings"
2. เปิดใช้งาน "HTTPS"
3. ตั้งค่า custom domain (ถ้าต้องการ)

### 6. ตั้งค่า LINE Webhook
1. ไปที่ LINE Developer Console
2. ตั้งค่า Webhook URL: `https://your-app-name.your-domain.com/webhook`
3. เปิดใช้งาน webhook

### 7. ทดสอบ
1. ส่งข้อความใน LINE
2. ตรวจสอบ logs ใน CapRover Dashboard
3. ตรวจสอบ health endpoint: `https://your-app-name.your-domain.com/health`

## การ Monitor และ Debug

### ดู Logs
- ไปที่ CapRover Dashboard > App > Logs
- หรือใช้ CLI: `caprover logs`

### Health Check
- Endpoint: `/health`
- ควรตอบกลับ: `{"status":"OK","message":"LINE Bot with Gemini 2.5 Flash is running"}`

### Environment Variables
ตรวจสอบว่า environment variables ถูกตั้งค่าถูกต้อง:
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `GEMINI_API_KEY`

## Troubleshooting

### ปัญหาที่พบบ่อย:
1. **Webhook ไม่ทำงาน**: ตรวจสอบ LINE webhook URL และ HTTPS
2. **API Error**: ตรวจสอบ API keys ใน environment variables
3. **Port Error**: ตรวจสอบว่า PORT=3000 ใน environment variables

### การ Restart App
- ไปที่ CapRover Dashboard > App > Actions > Restart

# ระบบคัดกรองใบสมัครงาน (Recruitment AI System)

ระบบรับสมัครงานอัตโนมัติ ที่ดึงอีเมลใบสมัครจาก Gmail, วิเคราะห์ Resume ด้วย AI (Claude / Gemini),
และจัดการผู้สมัครผ่าน Dashboard แบบ Real-time

---

## ✨ ความสามารถหลัก

- **ดึงอีเมลอัตโนมัติ** — เชื่อมต่อ Gmail ผ่าน IMAP และดึงใบสมัครตามกำหนดเวลา
- **จำแนกอีเมลด้วย AI** — แยกแยะ "ใบสมัครงาน" ออกจาก "อีเมลทั่วไป" โดยอัตโนมัติ
- **สกัดข้อมูล Resume** — รองรับไฟล์ PDF, DOCX, JPEG, PNG และข้อความธรรมดา
- **ให้คะแนนผู้สมัคร** — เปรียบเทียบ Resume กับ Criteria ที่กำหนดและให้คะแนน Match Score
- **Scheduler หลายโปรไฟล์** — ตั้งเวลาดึงอีเมลแบบ Cron ได้หลายช่วงเวลาพร้อมกัน
- **Manual Fetch** — ดึงอีเมลย้อนหลังได้ตามช่วงวันที่ที่ต้องการ
- **Dashboard** — ดูรายชื่อผู้สมัคร, คะแนน, และ Resume Preview ในหน้าเดียว
- **รองรับ 2 ภาษา** — ภาษาไทย และ ภาษาอังกฤษ (i18n)

---

## 🛠️ เทคโนโลยีที่ใช้

| ส่วน | เทคโนโลยี |
|------|-----------|
| Backend | Node.js, Express.js |
| Frontend | React, Vite, Tailwind CSS |
| ฐานข้อมูล | PostgreSQL |
| AI Provider | Anthropic Claude หรือ Google Gemini (เลือกได้) |
| IMAP | ImapFlow (Gmail) |
| Scheduler | node-cron |
| Auth | JWT (jsonwebtoken) |

---

## 📦 การติดตั้ง (Installation)

### ข้อกำหนดเบื้องต้น

- Node.js 18 ขึ้นไป
- PostgreSQL 14 ขึ้นไป (หรือใช้ Docker)
- บัญชี Gmail ที่เปิดใช้งาน App Password แล้ว

### 1. Clone โปรเจกต์

```bash
git clone https://github.com/<your-username>/recruitment-system.git
cd recruitment-system
```

### 2. ตั้งค่า Environment Variables

```bash
cp backend/.env.example backend/.env
```

แก้ไขไฟล์ `backend/.env` ตามค่าของคุณ (ดูรายละเอียดในหัวข้อถัดไป)

### 3. เริ่ม PostgreSQL

```bash
# ใช้ Docker (แนะนำ)
docker-compose up -d

# หรือใช้ PostgreSQL ที่ติดตั้งบนเครื่องโดยตรง
# สร้าง database ชื่อ recruitment ด้วย user ที่กำหนดใน .env
```

### 4. ติดตั้งและรัน Backend

```bash
cd backend
npm install
npm run dev   # development mode (nodemon)
# หรือ
npm start     # production mode
```

Backend จะรันที่ `http://localhost:4000`

### 5. ติดตั้งและรัน Frontend

```bash
cd ../frontend
npm install
npm run dev
```

Frontend จะรันที่ `http://localhost:5173`

---

## 🔐 Environment Variables

สร้างไฟล์ `backend/.env` โดย copy จาก `backend/.env.example` แล้วกรอกค่าดังนี้

```env
# ─── Server ───────────────────────────────────────────
NODE_ENV=development          # development | production
PORT=4000

# ─── Database (PostgreSQL) ────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_USER=recruit               # ชื่อ user ของ PostgreSQL
DB_PASS=your_strong_password  # รหัสผ่านของ PostgreSQL
DB_NAME=recruitment           # ชื่อ database

# ─── IMAP (Gmail) ─────────────────────────────────────
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=your_email@gmail.com
IMAP_PASS=xxxx xxxx xxxx xxxx # Gmail App Password (ไม่ใช่รหัสผ่าน Gmail จริง)
IMAP_MAILBOX=INBOX
IMAP_POLL_INTERVAL_MS=60000   # ดึงอีเมลทุก 60 วินาที

# ─── CORS ────────────────────────────────────────────
ALLOWED_ORIGIN=http://localhost:5173  # URL ของ Frontend

# ─── AI Provider ─────────────────────────────────────
AI_PROVIDER=gemini            # claude | gemini

# ─── Anthropic Claude ────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-6

# ─── Google Gemini ────────────────────────────────────
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-1.5-flash

# ─── Authentication ──────────────────────────────────
JWT_SECRET=replace_with_64_random_chars   # สร้างด้วย: openssl rand -hex 32
JWT_EXPIRES_IN=24h
```

> **วิธีสร้าง Gmail App Password:**
> Gmail → บัญชีของฉัน → ความปลอดภัย → การยืนยันแบบ 2 ขั้นตอน → App Passwords

---

## 🗂️ โครงสร้างโปรเจกต์ (Project Structure)

```
recruitment-system/
│
├── backend/                        # Node.js API Server
│   ├── server.js                   # จุดเริ่มต้น — เริ่ม Express และ Scheduler
│   ├── .env                        # ⚠️ ห้าม commit — ข้อมูลลับทั้งหมดอยู่ที่นี่
│   ├── .env.example                # Template ตัวอย่างสำหรับ .env (commit ได้)
│   └── src/
│       ├── app.js                  # Express app, middleware (helmet, cors, rate-limit)
│       ├── config/
│       │   ├── env.js              # ตรวจสอบ environment variables ด้วย Joi
│       │   ├── db.js               # PostgreSQL connection pool
│       │   └── imap.js             # การตั้งค่า IMAP
│       │
│       ├── routes/                 # 📡 API Routes ทั้งหมด
│       │   ├── index.js            # รวม routes และกำหนด auth middleware
│       │   ├── auth.js             # POST /api/auth/login, GET /api/auth/me
│       │   ├── fetch.js            # POST /api/fetch/manual (Manual Fetch)
│       │   ├── scheduler.js        # CRUD /api/scheduler (Automation Scheduler)
│       │   ├── applicants.js       # GET/PATCH /api/applicants
│       │   ├── emailLogs.js        # GET /api/emails
│       │   ├── criteria.js         # CRUD /api/criteria (เกณฑ์การคัดกรอง)
│       │   └── settings.js         # GET/PATCH /api/settings
│       │
│       ├── controllers/            # 🎮 Business Logic ของแต่ละ Route
│       │   ├── authController.js
│       │   ├── fetchController.js  # ควบคุมการ Manual Fetch
│       │   ├── schedulerController.js
│       │   └── applicantController.js
│       │
│       ├── services/               # 🧠 Core Logic
│       │   ├── emailService.js     # IMAP connection, pollUnreadEmails()
│       │   ├── pipelineService.js  # Pipeline: parse → triage → AI → save
│       │   ├── aiService.js        # เรียก Claude / Gemini API
│       │   ├── scoringService.js   # คำนวณ match score
│       │   ├── storageService.js   # SQL queries ทั้งหมด (Database Layer)
│       │   └── cryptoService.js    # เข้ารหัสข้อมูลสำคัญ
│       │
│       ├── jobs/                   # ⏰ Automation Scheduler
│       │   └── emailPoller.js      # node-cron jobs, runProfileCycle()
│       │
│       └── middleware/
│           ├── auth.js             # JWT verification middleware
│           └── errorHandler.js     # Global error handler
│
├── frontend/                       # React + Vite SPA
│   └── src/
│       ├── App.jsx                 # Router หลัก
│       ├── pages/                  # 📄 หน้าต่างๆ ของแอป
│       │   ├── Dashboard.jsx       # หน้าหลัก
│       │   ├── Applicants.jsx      # รายชื่อผู้สมัครทั้งหมด
│       │   ├── ApplicantDetail.jsx # รายละเอียดผู้สมัครแต่ละคน
│       │   ├── Criteria.jsx        # จัดการเกณฑ์การคัดกรอง
│       │   └── Settings.jsx        # ตั้งค่าระบบ
│       │
│       ├── components/             # 🧩 UI Components ที่ใช้ซ้ำ
│       │   ├── SchedulerModal.jsx  # ตั้งค่า Automation Scheduler
│       │   ├── ManualFetchBar.jsx  # ควบคุม Manual Fetch
│       │   ├── ApplicantTable.jsx  # ตารางแสดงผู้สมัคร
│       │   └── Layout.jsx          # Layout หลักของแอป
│       │
│       ├── api/                    # 🔌 HTTP client functions
│       │   ├── client.js           # Axios instance + interceptors
│       │   └── scheduler.js        # API calls สำหรับ Scheduler
│       │
│       └── locales/                # 🌐 ไฟล์แปลภาษา
│           ├── en.json             # English
│           └── th.json             # ภาษาไทย
│
├── docker-compose.yml              # รัน PostgreSQL ด้วย Docker
└── .gitignore                      # ไฟล์/โฟลเดอร์ที่ไม่ต้องการ push ขึ้น Git
```

---

## 🚀 การ Deploy บน VPS (Ubuntu)

ดู [Deployment Guide](docs/deployment.md) หรือดูขั้นตอนสรุปด้านล่าง:

1. ติดตั้ง Node.js 22, PostgreSQL, Nginx บน Ubuntu
2. Clone โปรเจกต์และสร้าง `.env` สำหรับ production
3. รันด้วย `pm2 start server.js --name recruitment-api`
4. ตั้งค่า Nginx เป็น reverse proxy
5. เปิด HTTPS ด้วย `certbot --nginx`

---

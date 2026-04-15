# NetVault Backend — Domain & Hosting Management SaaS

## Tech Stack
- **Node.js** + **Express.js**
- **MongoDB** + **Mongoose**
- **JWT** Authentication
- **Socket.io** — Real-time alerts
- **node-cron** — Scheduled expiry & uptime checks
- **Nodemailer** — Email notifications
- **PDFKit** — Invoice PDF generation
- **AES-256** — Credential encryption

---

## Quick Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secret, mail credentials
```

### 3. Seed Database (Plans + Super Admin + Demo users)
```bash
npm run seed
```

### 4. Start Development Server
```bash
npm run dev
```

### 5. Start Production Server
```bash
npm start
```

Server runs on `http://localhost:5000`

---

## Default Credentials (after seed)

| Role        | Email                      | Password       |
|-------------|----------------------------|----------------|
| Super Admin | superadmin@netvault.app    | SuperAdmin@123 |
| Demo Admin  | admin@demo.com             | Admin@123      |
| Demo Staff  | staff@demo.com             | Staff@123      |

---

## API Overview

| Base URL        | Description            |
|-----------------|------------------------|
| POST /api/auth/register  | Register new agency |
| POST /api/auth/login     | Login              |
| GET  /api/domains        | All domains        |
| GET  /api/hosting        | All hosting plans  |
| GET  /api/clients        | All clients        |
| GET  /api/billing/invoices | All invoices     |
| GET  /api/reports/renewals | Renewal report   |
| GET  /api/notifications  | All alerts         |
| GET  /api/uptime/status  | Live uptime status |
| GET  /api/super-admin/tenants | All tenants (SA) |

All protected routes require: `Authorization: Bearer <token>`

---

## Folder Structure

```
netvault-backend/
├── server.js              # Entry point
├── config/db.js           # MongoDB connection
├── models/                # 10 Mongoose models
│   ├── User.model.js
│   ├── Tenant.model.js
│   ├── Domain.model.js
│   ├── Hosting.model.js
│   └── index.js           # Client, Invoice, Credential, Notification, UptimeLog, Plan
├── controllers/           # Business logic
├── routes/                # Express routes
├── middleware/            # Auth, Role, Error, Validate
├── services/              # Mailer, PDF, Encrypt
├── jobs/                  # Cron jobs (expiry, uptime)
└── utils/                 # Logger, Token, Seeder, ApiResponse
```

---

## Cron Jobs

| Job              | Schedule        | Purpose                              |
|------------------|-----------------|--------------------------------------|
| Expiry Checker   | Daily 8:00 AM   | Domain/Hosting/SSL expiry alerts     |
| Overdue Invoices | Daily 9:00 AM   | Mark pending invoices as overdue     |
| Uptime Monitor   | Every 5 minutes | Ping servers, alert on down          |

---

## Deploy to Railway

1. Push code to GitHub
2. Create new Railway project → Connect repo
3. Add all `.env` variables in Railway dashboard
4. Railway auto-deploys on push

---

## Connect Frontend

Set in frontend `.env`:
```
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

For production:
```
VITE_API_URL=https://your-railway-url.up.railway.app/api
VITE_SOCKET_URL=https://your-railway-url.up.railway.app
```

# Smart Healthcare Project Management System (MERN)

A comprehensive Smart Healthcare Project Management and Monitoring System built using MongoDB, Express, React, and Node.js.

## 🚀 Features

- **Project Management**: Track healthcare projects, milestones, tasks, and deliverables.
- **Resource & Staff Allocation**: Assign and monitor medical staff, doctors, and specialists.
- **Authentication & Role-Based Access Control**: Secure login and roles for Administrators, Project Managers, and Staff.
- **Analytics & Dashboard**: Real-time project status, completion rates, and metrics.
- **Automated Workflow & Monitoring**: Track healthcare compliance, budgets, and deadlines.

## 🛠️ Tech Stack

- **Frontend**: React (Vite), Modern UI, Responsive Design
- **Backend**: Node.js, Express.js, RESTful API
- **Database**: MongoDB (Mongoose ODM)

## 📁 Project Structure

```
spm-healthcare/
├── client/          # Frontend React Application
├── server/          # Backend Express & MongoDB API
├── run.bat          # Script to run both client and server
└── README.md
```

## ⚙️ Setup & Installation

### 1. Backend Setup
```bash
cd server
npm install
# Setup your .env file based on .env.example
npm start
```

### 2. Frontend Setup
```bash
cd client
npm install
npm run dev
```

### 3. Quick Start (Windows)
Double-click `run.bat` or run:
```bash
.\run.bat
```
Client runs at `http://localhost:5173` and Server runs at `http://localhost:5000`.

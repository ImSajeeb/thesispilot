<div align="center">

# ThesisPilot
### University Thesis Management & Supervision Platform

A role-based web application designed to organize thesis proposals, supervisor preferences, allocation, reviews, and academic administration in one place.

[![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express.js-Web_Framework-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-Database-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![EJS](https://img.shields.io/badge/EJS-Templating-8A6742)](https://ejs.co/)
[![Deployment](https://img.shields.io/badge/Deployment-Render-46E3B7?logo=render&logoColor=111111)](https://render.com/)

**Live Demo:** [thesispilot.onrender.com](https://thesispilot.onrender.com)  
**Source Code:** [GitHub Repository](https://github.com/ImSajeeb/thesispilot)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Objectives](#objectives)
- [Key Features](#key-features)
- [User Roles](#user-roles)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Deployment](#deployment)
- [Security Notes](#security-notes)
- [Testing Checklist](#testing-checklist)
- [Future Improvements](#future-improvements)
- [Project Information](#project-information)

## Overview

**ThesisPilot** is a web-based thesis management platform intended to simplify coordination between students, supervisors, department chairmen, and administrators. It brings key thesis-related workflows into a single application, helping users manage proposals, supervisor preferences, allocation activities, reviews, and related records.

The application follows a role-based approach: each user role has its own dashboard and authorized actions.

## Problem Statement

Thesis coordination can involve multiple forms, email conversations, spreadsheets, document submissions, and manual allocation steps. When information is spread across different places, it can be harder to track submissions, coordinate supervisor assignments, and maintain consistent records.

ThesisPilot aims to centralize these workflows in a structured web application with database-backed records and role-specific access.

## Objectives

- Provide a centralized platform for thesis-related activities.
- Support role-based authentication and access control.
- Organize student registration and proposal submission.
- Collect and manage student supervisor preferences.
- Support supervisor capacity management and allocation workflows.
- Enable thesis review, feedback, and evaluation workflows.
- Store application records in a relational database.
- Provide controlled access to submitted documents.

## Key Features

- **Role-based dashboards** for Admin, Chairman, Student, and Supervisor.
- **Authentication and registration** with email verification support.
- **Password reset** using an OTP-based flow.
- **Student thesis workflow** for proposal and document submission.
- **Supervisor preference management** for student choices.
- **Supervisor management** including availability and capacity.
- **Allocation workflow** with preview and confirmation steps.
- **Review and feedback** for assigned thesis submissions.
- **Administrative management** for departments, academic sessions, and user records.
- **Document storage integration** using Supabase Storage when configured.
- **Database-backed records** using MySQL.

> Feature availability depends on the current deployment configuration. Verify each workflow on the live website before using it for an assessment or production process.

## User Roles

| Role | Responsibilities |
|---|---|
| **Admin** | Manages department/session setup and relevant user records. |
| **Chairman** | Manages thesis workflow, student approvals, supervisors, capacities, and allocation activities. |
| **Student** | Registers, submits thesis documents, selects supervisor preferences, and follows the thesis workflow. |
| **Supervisor** | Reviews assigned submissions and provides feedback or evaluation. |

Permissions are enforced through the application’s role-specific routes and middleware.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | EJS, HTML, CSS, JavaScript |
| Backend | Node.js, Express.js |
| Database | MySQL |
| Database driver | `mysql2` |
| Authentication/session | `express-session`, password hashing with `bcryptjs` |
| Email | Gmail API OAuth integration |
| File storage | Supabase Storage |
| Hosting | Render |
| Managed database hosting | Aiven MySQL |

## System Architecture

```text
┌──────────────────────────────┐
│        User's Browser        │
│       EJS / HTML / CSS       │
└──────────────┬───────────────┘
               │ HTTP / HTTPS
               ▼
┌──────────────────────────────┐
│       Node.js + Express      │
│ Routes · Controllers · Auth  │
└───────┬──────────────┬───────┘
        │              │
        ▼              ▼
┌────────────────┐  ┌────────────────┐
│   MySQL /      │  │ Supabase       │
│   Aiven        │  │ Storage        │
│ App records    │  │ Private files  │
└────────────────┘  └────────────────┘

        Email delivery
               │
               ▼
        Gmail API OAuth
```

The deployed configuration may differ depending on environment variables and enabled integrations.

## Getting Started

### Prerequisites

Install the following before running the project locally:

- [Node.js](https://nodejs.org/) (use a version supported by the project dependencies)
- npm (included with Node.js)
- Access to a configured MySQL database
- Credentials for any integrations you want to enable, such as Gmail API or Supabase Storage

### 1. Clone the repository

```bash
git clone https://github.com/ImSajeeb/thesispilot.git
cd thesispilot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local `.env` file in the project root. Use the variable names in the next section and supply your own credentials.

**Never commit your `.env` file or paste secrets into source code.**

### 4. Prepare the database

Configure the MySQL database and ensure the schema required by the application has been created. Use an appropriate database backup or schema script supplied with your project.

> This README does not assume that a fresh database can be created automatically. Existing database tables and records should not be reset or dropped during deployment.

### 5. Start the application

```bash
npm start
```

Open the local address shown in the terminal. In a typical local configuration, this is:

```text
http://localhost:3000
```

The actual port may be controlled by the `PORT` environment variable.

## Environment Configuration

Configure these variables in `.env` locally or in your hosting provider's environment settings.

```dotenv
PORT=3000
NODE_ENV=development
SESSION_SECRET=replace-with-a-long-random-secret

DB_HOST=your-mysql-host
DB_PORT=3306
DB_USER=your-mysql-user
DB_PASS=your-mysql-password
DB_NAME=your-database
DB_SSL=false
# For a managed MySQL service using CA validation:
# DB_SSL=true
# DB_SSL_CA=/absolute/path/to/ca.pem

GMAIL_CLIENT_ID=your-google-oauth-client-id
GMAIL_CLIENT_SECRET=your-google-oauth-client-secret
GMAIL_REFRESH_TOKEN=your-google-oauth-refresh-token
GMAIL_USER=your-sender-email

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-supabase-secret
SUPABASE_BUCKET=thesis-documents
```

### Environment variable notes

- Use the exact variable names expected by the application's configuration files.
- For managed MySQL, configure SSL according to the database provider's instructions.
- If `DB_SSL_CA` is configured, ensure the CA file exists at that path in the deployment environment.
- Add all required variables to Render's Environment settings.
- Never use the example values above as real credentials.

## Deployment

The application is intended to be deployable as a Node.js web service.

A typical deployment workflow is:

1. Push the project source to GitHub.
2. Create or open the corresponding web service in Render.
3. Connect the GitHub repository and select the deployment branch.
4. Set the required environment variables in Render.
5. Configure the MySQL SSL certificate and network access for the hosted database.
6. Deploy and inspect the service logs.
7. Test the application using the public URL.

### Post-deployment verification

- [ ] The live homepage loads.
- [ ] Login works with valid test accounts.
- [ ] Each role sees only its authorized pages and actions.
- [ ] Registration and email verification work if enabled.
- [ ] OTP password reset completes from start to finish.
- [ ] Proposal submissions are saved in the database.
- [ ] Records remain after refreshing and signing in again.
- [ ] Allocation and review workflows work with test data.
- [ ] Private documents can only be accessed through the intended authorized flow.
- [ ] Render logs do not show unresolved database connection errors.

A successful deployment message alone does not prove that every workflow is working.

## Security Notes

- Do not commit `.env`, database passwords, OAuth client secrets, refresh tokens, Supabase secret keys, or session secrets.
- Use strong, unique values for `SESSION_SECRET` and other credentials.
- Rotate any credential that has been exposed in a screenshot, chat, repository, or log.
- Use test accounts and non-sensitive documents for demonstrations.
- Keep thesis documents private and restrict access to authorized users.
- Do not expose database credentials in client-side JavaScript or public documentation.

## Testing Checklist

Before presenting or submitting the application, test the following with non-sensitive test accounts:

| Area | What to verify |
|---|---|
| Authentication | Login, logout, and role-specific access |
| Registration | Form validation and approval flow |
| Email | Verification and OTP delivery |
| Password reset | OTP verification, new password update, and login with the new password |
| Student workflow | Proposal submission and supervisor preferences |
| Allocation | Preview, confirmation, and saved allocation result |
| Supervisor workflow | Assigned thesis review and feedback |
| Documents | Authorized upload and access |
| Database | Create/update records and verify persistence |
| Deployment | Public URL, logs, environment variables, and database connectivity |

Record the actual pass/fail result of each test; do not mark untested features as passed.

## Future Improvements

- Persistent session storage and stronger session lifecycle management.
- Automated tests for authentication, permissions, and thesis workflows.
- Audit logs for allocation and administrative actions.
- Better reporting and progress analytics.
- More detailed error monitoring and operational alerts.
- Improved accessibility and responsive UI testing.

## Project Information

- **Project:** ThesisPilot
- **Category:** Web Application Development Lab Project
- **Repository:** [github.com/ImSajeeb/thesispilot](https://github.com/ImSajeeb/thesispilot)
- **Live website:** [thesispilot.onrender.com](https://thesispilot.onrender.com)

### Academic presentation

Prepared as a Web Application Development Lab project. Update the repository with the correct student details and any course-specific information required by the instructor.

---

<div align="center">

**ThesisPilot — Bringing thesis workflows into one platform.**

</div>

# 🎓 Online Exam Slot Booking System

A complete web application for managing exam slot bookings, built with **Node.js**, **Express**, **MySQL**, and vanilla **HTML/CSS/JavaScript**.

---

## 📁 Project Structure

```
exam-slot-booking/
├── server.js              # Main Express server
├── db.js                  # MySQL database connection
├── schema.sql             # Database schema + seed data
├── .env                   # Environment variables
├── package.json           # Node.js dependencies
├── routes/
│   ├── auth.js            # Registration, Login, OTP routes
│   ├── slots.js           # Slot booking, reschedule, cancel routes
│   └── admin.js           # Admin dashboard routes
└── public/
    ├── index.html         # Login page
    ├── register.html      # Registration page
    ├── dashboard.html     # Student dashboard
    ├── book-slot.html     # View & book slots
    ├── hall-ticket.html   # Hall ticket display
    ├── admin.html         # Admin dashboard
    ├── css/
    │   └── style.css      # All styles
    └── js/
        ├── auth.js        # Login page logic
        ├── register.js    # Registration page logic
        ├── dashboard.js   # Dashboard logic
        ├── slots.js       # Slot booking logic
        ├── hallticket.js  # Hall ticket logic
        └── admin.js       # Admin dashboard logic
```

---

## 🚀 Setup Instructions

### Prerequisites

- **Node.js** (v14 or higher) - [Download](https://nodejs.org/)
- **MySQL** (v8 or higher) - [Download](https://dev.mysql.com/downloads/)

### Step 1: Setup Database

1. Open MySQL command line or MySQL Workbench
2. Run the schema file:

```sql
source C:/path/to/exam-slot-booking/schema.sql;
```

Or copy and paste the contents of `schema.sql` into your MySQL client.

### Step 2: Configure Environment

1. Open the `.env` file
2. Update the MySQL password:

```
DB_PASSWORD=your_mysql_password
```

### Step 3: Install Dependencies

```bash
cd exam-slot-booking
npm install
```

### Step 4: Start the Server

```bash
npm start
```

The server will start at: **http://localhost:3000**

---

## 🔐 Default Accounts

| Role    | Email            | Password  |
|---------|------------------|-----------|
| Admin   | admin@exam.com   | admin123  |

Students can register through the registration page.

---

## 📋 Features

| Feature                | Description                                    |
|------------------------|------------------------------------------------|
| ✅ Registration + OTP  | Register with email, verify via OTP            |
| ✅ Login + OTP         | Login with password, then verify via OTP       |
| ✅ Login Logs          | Every login is logged with timestamp and IP    |
| ✅ View Slots          | Browse available exam slots with capacity info |
| ✅ Book Slot           | Book a slot (duplicate booking prevented)      |
| ✅ Reschedule Slot     | Change booking to a different slot             |
| ✅ Cancel Slot         | Cancel an existing booking                     |
| ✅ Hall Ticket         | View and print hall ticket                     |
| ✅ Admin Dashboard     | View users, bookings, logs, manage slots       |

---

## 🛠️ API Endpoints

### Authentication
| Method | Endpoint              | Description                  |
|--------|-----------------------|------------------------------|
| POST   | /api/auth/register    | Register a new student       |
| POST   | /api/auth/login       | Login (step 1: password)     |
| POST   | /api/auth/verify-otp  | Verify OTP (step 2)          |
| GET    | /api/auth/me          | Get current user session     |
| POST   | /api/auth/logout      | Logout                       |

### Slots & Bookings
| Method | Endpoint                      | Description              |
|--------|-------------------------------|--------------------------|
| GET    | /api/slots                    | Get available slots      |
| POST   | /api/slots/book               | Book a slot              |
| GET    | /api/slots/my-bookings        | Get user's bookings      |
| PUT    | /api/slots/reschedule         | Reschedule a booking     |
| DELETE | /api/slots/cancel/:bookingId  | Cancel a booking         |
| GET    | /api/slots/hall-ticket/:id    | Get hall ticket details  |

### Admin
| Method | Endpoint              | Description              |
|--------|-----------------------|--------------------------|
| GET    | /api/admin/stats      | Dashboard statistics     |
| GET    | /api/admin/users      | View all users           |
| GET    | /api/admin/bookings   | View all bookings        |
| GET    | /api/admin/slots      | View all slots           |
| POST   | /api/admin/slots      | Create new slot          |
| DELETE | /api/admin/slots/:id  | Delete a slot            |
| GET    | /api/admin/logs       | View login logs          |

---

## ⚠️ Note on OTP

For testing purposes, the OTP is returned in the API response and displayed on screen.
In a production environment, you would:
1. Send the OTP via email using a service like Nodemailer + Gmail/SMTP
2. Or send via SMS using Twilio or similar

---

## 📄 License

This project is for educational purposes.

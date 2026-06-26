# Student360Pro

Student360Pro is a Flask-based school management platform designed to support students, teachers, parents, and administrators. It provides role-based dashboards, quiz history tracking, doubt submission and resolution, complaint management, and a responsive frontend interface.

## Features

- **Role-based Authentication** for Admin, Teacher, Student, and Parent users
- **Enhanced Security**:
  - Strong password hashing with PBKDF2-SHA256
  - Account lockout after 5 failed login attempts
  - Rate limiting per IP address + username
  - Password strength validation (8+ chars, mixed case, numbers, special chars)
  - Secure session management with automatic timeout
  - Comprehensive security headers (HSTS, CSP, X-Frame-Options, etc.)
  - Login attempt logging and monitoring
  - Password change functionality
- Student quiz attempt storage and history retrieval
- Student doubt submission and teacher doubt resolution workflow
- Teacher dashboard for student and doubt management
- Parent portal for viewing linked student details and complaints
- REST API architecture with separate blueprints for each user role
- Static frontend served from `Frontend/` with shared theme variables and UI styles

## Security

This application includes comprehensive security features to protect user accounts and data. See [SECURITY.md](SECURITY.md) for detailed information about:
- Password hashing and strength requirements
- Login security and rate limiting
- Account lockout mechanisms
- Session security
- Input validation
- CSRF protection
- Security headers
- Deployment best practices

## Architecture

- `Backend/` contains the Flask application, database models, blueprints, and API routes
- `Frontend/` contains the static client UI, including HTML, CSS, and JavaScript
- `Backend/app.py` initializes Flask, registers blueprints, configures login and CSRF, and serves frontend assets
- `Backend/models.py` defines database entities such as `Student`, `Teacher`, `Parent`, `Admin`, `Class`, `Doubt`, `Complaint`, and `QuizAttempt`
- `Backend/security.py` provides security utilities for password validation, rate limiting, and security headers

## Requirements

- Python 3.11+ (project uses Flask 3 and SQLAlchemy 3)
- `pip` for installing dependencies
- SQLite by default or PostgreSQL when `DATABASE_URL` is configured

## Setup

1. Create and activate a Python virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies:

```powershell
pip install -r Backend/requirements.txt
```

3. Create a `.env` file in `Backend/` using the template:

```powershell
copy Backend\.env.example Backend\.env
```

4. Update `.env` with your configuration:

```env
# Generate a strong secret key with: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=your-randomly-generated-secret-key-here
DATABASE_URL=sqlite:///database.db
CORS_ORIGIN=http://localhost:8000
SESSION_COOKIE_SECURE=False
```

⚠️ **Important**: 
- Use a strong, unique `SECRET_KEY` (at least 32 random characters)
- Set `SESSION_COOKIE_SECURE=True` in production with HTTPS
- Never commit `.env` to version control

5. Initialize or seed the database if needed. Update `Backend/seed.py` or run any custom database setup scripts.

## Running the application

From the project root, activate your virtual environment and run:

```powershell
cd Backend
python app.py
```

Then open the static frontend or navigate to the served app URL (default: http://localhost:5000).

## API Endpoints

### Authentication
- `POST /api/login` - Login with username, password, and role
- `POST /api/logout` - Logout current user
- `GET /api/user` - Get current user info

### Security
- `POST /api/change-password` - Change password (requires login)
- `POST /api/validate-password` - Validate password strength (real-time feedback)

## Notes

- The backend API is exposed under `/api/` and is intended to be consumed by the frontend
- The frontend is served from `Frontend/`, while the Flask app handles authentication and API routing
- Ensure `SECRET_KEY` is set in `.env` before starting the server
- For security details and deployment guidelines, see [SECURITY.md](SECURITY.md)
- Failed login attempts are logged and can be monitored for suspicious activity

from flask import request, jsonify
from flask_login import login_user, logout_user, current_user, login_required
from models import db, Teacher, Student, Parent, Admin
from . import auth_bp
from utils import get_student_details
from security import (
    PasswordValidator, InputValidator, log_login_attempt,
    get_client_ip, login_rate_limiter
)

@auth_bp.route('/login', methods=['POST'])
def login_api():
    """
    Handles login for all roles with enhanced security.
    Features:
    - Password strength validation
    - Rate limiting and account lockout
    - Login attempt logging
    - Input validation
    """
    try:
        data = request.get_json()
        
        # Validate input structure
        if not data:
            return jsonify({"success": False, "message": "Invalid request format."}), 400
        
        if 'username' not in data or 'password' not in data or 'role' not in data:
            return jsonify({"success": False, "message": "Missing username, password, or role."}), 400
        
        username = str(data.get('username', '')).strip()
        password = data.get('password', '')
        role = str(data.get('role', '')).strip().lower()
        
        # Validate input format
        is_valid_username, error = InputValidator.validate_username(username)
        if not is_valid_username:
            return jsonify({"success": False, "message": error}), 400
        
        # Validate role
        valid_roles = ['teacher', 'student', 'parent', 'admin']
        if role not in valid_roles:
            return jsonify({"success": False, "message": "Invalid role specified"}), 400
        
        # Get client IP for rate limiting
        client_ip = get_client_ip()
        rate_limit_key = f"{username}_{client_ip}"
        
        # Check rate limiting
        if login_rate_limiter.is_locked(rate_limit_key):
            remaining_time = login_rate_limiter.get_lockout_time_remaining(rate_limit_key)
            log_login_attempt(username, role, False, client_ip, "Rate limited")
            return jsonify({
                "success": False,
                "message": f"Too many failed attempts. Please try again in {int(remaining_time / 60)} minutes."
            }), 429
        
        # Determine user model
        user_model = None
        if role == 'teacher':
            user_model = Teacher
        elif role == 'student':
            user_model = Student
        elif role == 'parent':
            user_model = Parent
        elif role == 'admin':
            user_model = Admin
        
        # Fetch user from database
        user = db.session.scalar(db.select(user_model).where(user_model.username == username))
        
        # Check if user exists and password is correct
        if not user:
            login_rate_limiter.record_attempt(rate_limit_key, success=False)
            log_login_attempt(username, role, False, client_ip, "User not found")
            return jsonify({"success": False, "message": "Invalid username or password"}), 401
        
        # Check if user account is active
        if hasattr(user, 'is_active') and not user.is_active:
            login_rate_limiter.record_attempt(rate_limit_key, success=False)
            log_login_attempt(username, role, False, client_ip, "Account disabled")
            return jsonify({"success": False, "message": "Account is disabled. Contact administrator."}), 403
        
        # Check if account is locked
        if user.is_locked():
            remaining_time = (user.locked_until - db.func.now()).total_seconds() if user.locked_until else 0
            log_login_attempt(username, role, False, client_ip, "Account locked")
            return jsonify({
                "success": False,
                "message": "Account temporarily locked due to too many failed login attempts."
            }), 429
        
        # Verify password
        if not user.check_password(password):
            user.increment_login_attempts()
            db.session.commit()
            login_rate_limiter.record_attempt(rate_limit_key, success=False)
            remaining_attempts = login_rate_limiter.get_remaining_attempts(rate_limit_key)
            log_login_attempt(username, role, False, client_ip, f"Invalid password - {remaining_attempts} attempts remaining")
            return jsonify({
                "success": False,
                "message": "Invalid username or password"
            }), 401
        
        # Password is correct - reset login attempts and update last login
        user.reset_login_attempts()
        db.session.commit()
        
        # Log successful login
        login_rate_limiter.record_attempt(rate_limit_key, success=True)
        log_login_attempt(username, role, True, client_ip)
        
        # Establish session using Flask-Login
        login_user(user)
        
        # Build response data
        user_data = user.to_dict()
        user_data['role'] = role
        
        if role == 'student':
            user_data = get_student_details(user)
        
        return jsonify({"success": True, "user": user_data}), 200
    
    except Exception as e:
        # Log unexpected errors
        import logging
        logging.error(f"Login error: {str(e)}")
        return jsonify({"success": False, "message": "An error occurred during login."}), 500


@auth_bp.route('/logout', methods=['POST'])
@login_required
def logout_api():
    """Logout the current user and destroy the session."""
    username = current_user.username if hasattr(current_user, 'username') else 'Unknown'
    logout_user()
    log_login_attempt(username, "unknown", False, get_client_ip(), "Logged out")
    return jsonify({"success": True, "message": "Logged out successfully."})


@auth_bp.route('/user', methods=['GET'])
@login_required
def get_current_user():
    """Returns the currently logged-in user's data."""
    if not current_user.is_authenticated:
        return jsonify({"success": False, "message": "Not logged in"}), 401
    
    role = None
    if isinstance(current_user, Teacher):
        role = 'teacher'
    elif isinstance(current_user, Student):
        role = 'student'
    elif isinstance(current_user, Parent):
        role = 'parent'
    elif isinstance(current_user, Admin):
        role = 'admin'
    
    user_data = current_user.to_dict()
    user_data['role'] = role
    
    if role == 'student':
        user_data = get_student_details(current_user)
    
    return jsonify({"success": True, "user": user_data})


@auth_bp.route('/change-password', methods=['POST'])
@login_required
def change_password():
    """
    Allow authenticated users to change their password.
    Requires current password and validates new password strength.
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"success": False, "message": "Invalid request format."}), 400
        
        current_password = data.get('current_password', '')
        new_password = data.get('new_password', '')
        confirm_password = data.get('confirm_password', '')
        
        # Verify current password
        if not current_user.check_password(current_password):
            log_login_attempt(current_user.username, "unknown", False, get_client_ip(), "Failed password change - wrong current password")
            return jsonify({"success": False, "message": "Current password is incorrect."}), 401
        
        # Check if new password matches confirmation
        if new_password != confirm_password:
            return jsonify({"success": False, "message": "New passwords do not match."}), 400
        
        # Check if new password is different from current
        if current_user.check_password(new_password):
            return jsonify({"success": False, "message": "New password must be different from current password."}), 400
        
        # Validate new password strength
        is_valid, errors = PasswordValidator.validate(new_password)
        if not is_valid:
            return jsonify({"success": False, "message": "Password requirements not met.", "errors": errors}), 400
        
        # Update password
        current_user.set_password(new_password)
        db.session.commit()
        
        log_login_attempt(current_user.username, "unknown", True, get_client_ip(), "Password changed successfully")
        return jsonify({"success": True, "message": "Password changed successfully."})
    
    except Exception as e:
        import logging
        logging.error(f"Password change error: {str(e)}")
        return jsonify({"success": False, "message": "An error occurred while changing password."}), 500


@auth_bp.route('/validate-password', methods=['POST'])
def validate_password_strength():
    """
    Endpoint to validate password strength in real-time (for frontend).
    Returns validation status and error messages.
    """
    try:
        data = request.get_json()
        
        if not data or 'password' not in data:
            return jsonify({"success": False, "message": "No password provided."}), 400
        
        password = data.get('password', '')
        is_valid, errors = PasswordValidator.validate(password)
        
        return jsonify({
            "success": is_valid,
            "valid": is_valid,
            "errors": errors,
            "message": "Password is valid" if is_valid else "Password does not meet requirements"
        })
    
    except Exception as e:
        import logging
        logging.error(f"Password validation error: {str(e)}")
        return jsonify({"success": False, "message": "An error occurred during validation."}), 500


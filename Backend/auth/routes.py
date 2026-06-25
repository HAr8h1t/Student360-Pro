from flask import request, jsonify
from flask_login import login_user, logout_user, current_user, login_required
from models import db, Teacher, Student, Parent
from . import auth_bp
from utils import get_student_details

@auth_bp.route('/login', methods=['POST'])
def login_api():
    """Handles login for all roles using Flask-Login for session management."""
    data = request.get_json()
    if not data or 'username' not in data or 'password' not in data or 'role' not in data:
        return jsonify({"success": False, "message": "Missing username, password, or role."}), 400

    username = data.get('username')
    password = data.get('password')
    role = data.get('role')

    user_model = None
    if role == 'teacher':
        user_model = Teacher
    elif role == 'student':
        user_model = Student
    elif role == 'parent':
        user_model = Parent
    else:
        return jsonify({"success": False, "message": "Invalid role specified"}), 400

    user = db.session.scalar(db.select(user_model).where(user_model.username == username))

    if user and user.check_password(password):
        login_user(user) # Use Flask-Login to manage the session
        user_data = user.to_dict()
        user_data['role'] = role # Add role to the returned user data
        if role == 'student':
            user_data = get_student_details(user)
        return jsonify({"success": True, "user": user_data})
    
    return jsonify({"success": False, "message": "Invalid username or password"}), 401

@auth_bp.route('/logout', methods=['POST'])
@login_required
def logout_api():
    logout_user()
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
    
    user_data = current_user.to_dict()
    user_data['role'] = role
    
    if role == 'student':
        user_data = get_student_details(current_user)

    return jsonify({"success": True, "user": user_data})

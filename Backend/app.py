import os
import logging
from flask import Flask, jsonify, request, redirect, url_for, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import requests
from flask_admin import Admin as AdminManager, AdminIndexView, expose
from flask_admin.contrib.sqla import ModelView
from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user, login_required
from wtforms.fields import TextAreaField, PasswordField
from markupsafe import Markup
import json
from flask_wtf.csrf import CSRFProtect, generate_csrf

# Import the database object and models from models.py
from models import db, Teacher, Student, Parent, Admin, Class, Doubt, Complaint, QuizAttempt

# Import blueprints
from auth import auth_bp
from parent import parent_bp
from student import student_bp
from teacher import teacher_bp

# Load environment variables from .env file
load_dotenv()

# --- App Initialization ---
# The static_folder points to the frontend directory to serve the main website.
# The template_folder is set to '.' to find login.html in the backend directory.
app = Flask(
    __name__,
    static_folder=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Frontend')),
    template_folder=os.path.abspath(os.path.dirname(__file__))
)

# --- Logging Configuration ---
if __name__ != '__main__':
    gunicorn_logger = logging.getLogger('gunicorn.error')
    app.logger.handlers = gunicorn_logger.handlers
    app.logger.setLevel(gunicorn_logger.level)

# --- App Configuration ---
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY')
if not app.config['SECRET_KEY']:
    raise ValueError("No SECRET_KEY set for Flask application")
database_url = os.environ.get('DATABASE_URL')
if database_url:
    # Render's DATABASE_URL is for postgres, but SQLAlchemy needs postgresql
    database_url = database_url.replace("postgres://", "postgresql://", 1)
    # Use the DATABASE_URL from the environment if it exists, otherwise fall back to SQLite
    database_url = os.environ.get('DATABASE_URL')
    if database_url:
        # Render's DATABASE_URL is for postgres, but SQLAlchemy needs postgresql
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url or 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['FLASK_ADMIN_SWATCH'] = 'cerulean'

# --- Extensions Initialization ---
db.init_app(app)
# Configure CORS to be more restrictive
cors_origin = os.environ.get('CORS_ORIGIN', 'http://localhost:8000')
CORS(app, resources={r"/api/*": {"origins": cors_origin}})
csrf = CSRFProtect(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'admin.login'

@login_manager.unauthorized_handler
def unauthorized_callback():
    if request.path.startswith('/api/'):
        return jsonify({"success": False, "message": "Authentication required."}), 401
    return redirect(url_for('admin.login'))

# --- Register Blueprints ---
app.register_blueprint(auth_bp, url_prefix='/api')
app.register_blueprint(parent_bp, url_prefix='/api')
app.register_blueprint(student_bp, url_prefix='/api')
app.register_blueprint(teacher_bp, url_prefix='/api')


@app.errorhandler(404)
def not_found_error(error):
    return jsonify({"success": False, "message": "Resource not found."}), 404

@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return jsonify({"success": False, "message": "An internal server error occurred."}), 500

@login_manager.user_loader
def load_user(user_id):
    # This function now needs to check which type of user this is.
    # A simple way is to try loading from each user table.
    try:
        # Admin has an integer ID.
        user = db.session.get(Admin, int(user_id))
        if user:
            return user
    except ValueError:
        # If it's not an integer, it can't be an Admin.
        pass
    
    # For other models, the ID is a string.
    user = db.session.get(Teacher, user_id)
    if user:
        return user
    user = db.session.get(Student, user_id)
    if user:
        return user
    user = db.session.get(Parent, user_id)
    if user:
        return user
    return None

# --- Admin Views ---
class SecureModelView(ModelView):
    """A secure ModelView that requires authentication."""
    def is_accessible(self):
        return current_user.is_authenticated

    def inaccessible_callback(self, name, **kwargs):
        # Redirect to login page if user is not authenticated
        return redirect(url_for('admin.login'))

class UserManagementView(SecureModelView):
    """A base view for managing models with user credentials."""
    
    # Exclude the password hash from the list view for security
    column_exclude_list = ('password_hash',)
    
    # Exclude the hash field from create/edit forms
    form_excluded_columns = ('password_hash',)

    # Add a temporary 'password' field to the create/edit forms
    form_extra_fields = {
        'password': PasswordField('New Password', description='Enter a new password to update, or leave blank to keep current.')
    }

    def on_model_change(self, form, model, is_created):
        """Handle password hashing when a model is created or updated."""
        if form.password.data:
            model.set_password(form.password.data)

class JSONField(TextAreaField):
    """A custom field to handle JSON data in a TextArea."""
    def _value(self):
        if self.data:
            return json.dumps(self.data, indent=4)
        return ""

    def process_formdata(self, valuelist):
        if valuelist:
            try:
                self.data = json.loads(valuelist[0])
            except json.JSONDecodeError:
                self.data = None
                raise ValueError('Invalid JSON')

class StudentModelView(UserManagementView):
    """A custom ModelView for the Student model to handle JSON and passwords."""
    form_overrides = {
        'marks': JSONField,
        'historical_marks': JSONField
    }
    
    # Increase the height of the text areas for better visibility
    form_widget_args = {
        'marks': {
            'rows': 10,
            'style': 'font-family: monospace;'
        },
        'historical_marks': {
            'rows': 10,
            'style': 'font-family: monospace;'
        }
    }
    # Show the parents in the list view
    column_list = ('id', 'name', 'username', 'class_obj', 'attendance', 'parents')
    # Make the class and parents editable
    form_columns = ('id', 'name', 'username', 'class_obj', 'attendance', 'parents', 'marks', 'historical_marks', 'password')

class TeacherModelView(UserManagementView):
    """A custom ModelView for the Teacher model to manage classes."""
    column_list = ('id', 'name', 'username', 'classes')
    form_columns = ('id', 'name', 'username', 'classes', 'password')

class ParentModelView(UserManagementView):
    """A custom ModelView for the Parent model to show children."""
    column_list = ('id', 'name', 'username', 'children')
    form_columns = ('id', 'name', 'username', 'children', 'password')

class ClassModelView(SecureModelView):
    """A custom ModelView for the Class model."""
    column_list = ('name', 'teachers', 'students')
    form_columns = ('name', 'teachers', 'students')

class QuizAttemptModelView(SecureModelView):
    """A custom ModelView for the QuizAttempt model."""
    can_create = False
    can_edit = False
    column_list = ('student', 'subject', 'score', 'total_questions', 'accuracy', 'attempted_at')
    form_overrides = {'details': JSONField}
    form_widget_args = {'details': {'rows': 20, 'style': 'font-family: monospace;'}}


class SecureAdminIndexView(AdminIndexView):
    """A secure AdminIndexView that requires authentication."""
    @expose('/')
    def index(self):
        if not current_user.is_authenticated:
            return redirect(url_for('.login'))
        return super(SecureAdminIndexView, self).index()

    @expose('/login', methods=['GET', 'POST'])
    def login(self):
        if current_user.is_authenticated:
            return redirect(url_for('.index'))
        if request.method == 'POST':
            username = request.form['username']
            password = request.form['password']
            user = db.session.scalar(db.select(Admin).where(Admin.username == username))
            if user and user.check_password(password):
                login_user(user)
                return redirect(url_for('.index'))
        return self.render('login.html')

    @expose('/logout')
    def logout(self):
        logout_user()
        return redirect(url_for('.login'))

# Initialize Flask-Admin
# The url='/admin' sets the base URL for the admin interface.
admin = AdminManager(
    app,
    name='Student360 Admin',
    template_mode='bootstrap3',
    index_view=SecureAdminIndexView(url='/admin')
)

# Add secure model views with password management
admin.add_view(TeacherModelView(Teacher, db.session, endpoint='admin_teacher'))
admin.add_view(StudentModelView(Student, db.session, endpoint='admin_student'))
admin.add_view(ParentModelView(Parent, db.session, endpoint='admin_parent'))
admin.add_view(UserManagementView(Admin, db.session, endpoint='admin_users'))
admin.add_view(ClassModelView(Class, db.session))
admin.add_view(SecureModelView(Complaint, db.session))
admin.add_view(QuizAttemptModelView(QuizAttempt, db.session))


# --- API Endpoints ---
# All API endpoints are prefixed with /api to distinguish them from frontend routes.
@app.route('/api/csrf-token')
def get_csrf_token():
    return jsonify({'csrf_token': generate_csrf()})

@app.route('/api/gemini-proxy', methods=['POST'])
@login_required
def gemini_proxy():
    """A secure proxy for the Gemini API that requires authentication."""
    gemini_api_key = os.environ.get('GEMINI_API_KEY')
    if not gemini_api_key:
        return jsonify({"error": "API key not configured on the server."}), 500

    data = request.get_json()
    prompt = data.get('prompt')
    if not prompt:
        return jsonify({"error": "No prompt provided."}), 400

    # The API key is now handled on the server-side and not passed in the URL
    api_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    headers = {'x-goog-api-key': gemini_api_key, 'Content-Type': 'application/json'}
    payload = {"contents": [{"parts": [{"text": prompt}]}]}

    try:
        response = requests.post(api_url, headers=headers, json=payload)
        response.raise_for_status()
        return jsonify(response.json())
    except requests.exceptions.RequestException as e:
        app.logger.error(f"Error calling Gemini API: {e}")
        error_details = "An unknown error occurred."
        try:
            error_details = e.response.json()
        except (ValueError, AttributeError):
            pass
        return jsonify({"error": "Failed to communicate with the AI service.", "details": error_details}), 502

# --- Catch-all route for Frontend ---
# This route serves the frontend's index.html for any path not handled by the API or Admin panel.
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

# --- Main Execution ---
if __name__ == '__main__':
    with app.app_context():
        # This ensures the database is created if it doesn't exist
        db.create_all()
    # Use environment variables for debug and port, with sensible defaults for development
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    port = int(os.environ.get('PORT', 8000))
    app.logger.info(f"Starting Flask server. Debug: {debug_mode}, Port: {port}")
    app.run(debug=debug_mode, port=port)

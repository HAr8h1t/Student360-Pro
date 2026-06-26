from flask import request, jsonify
from flask_login import current_user, login_required
from models import db, Parent, Student, Complaint
from . import parent_bp
from utils import get_student_details

@parent_bp.route('/parent/children', methods=['GET'])
@login_required
def get_parent_children():
    """Provides data for all children linked to the currently logged-in parent."""
    if not isinstance(current_user, Parent):
        return jsonify({"message": "Unauthorized"}), 403
        
    children_data = [get_student_details(child) for child in current_user.children]
    all_students = db.session.scalars(db.select(Student)).all()
    topper = max(all_students, key=lambda s: float(get_student_details(s).get('overallAverage', 0)))
    
    return jsonify({ "children": children_data, "topper": get_student_details(topper) })

@parent_bp.route('/parent/complaints', methods=['GET'])
@login_required
def get_parent_complaints():
    if not isinstance(current_user, Parent):
        return jsonify({"success": False, "message": "Unauthorized"}), 403
        
    complaints = db.session.query(Complaint).filter(Complaint.parent_id == current_user.id).order_by(Complaint.created_at.desc()).all()
    return jsonify({"success": True, "complaints": [c.to_dict() for c in complaints]})

from flask import request, jsonify
from flask_login import current_user, login_required

from models import db, Teacher, Student, Doubt, Complaint
from . import teacher_bp
from utils import get_student_details

@teacher_bp.route('/teacher/dashboard', methods=['GET'])
@login_required
def get_teacher_dashboard():
    """Provides all data needed for the teacher dashboard."""
    if not isinstance(current_user, Teacher):
        return jsonify({"message": "Unauthorized"}), 403
    
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    
    students_pagination = Student.query.paginate(page=page, per_page=per_page, error_out=False)
    students = students_pagination.items
    
    students_data = [get_student_details(s) for s in students]
    
    return jsonify({
        'students': students_data,
        'has_next': students_pagination.has_next,
        'has_prev': students_pagination.has_prev,
        'page': students_pagination.page,
        'total_pages': students_pagination.pages
    })

@teacher_bp.route('/teacher/doubts', methods=['GET'])
@login_required
def get_teacher_doubts():
    if not isinstance(current_user, Teacher):
        return jsonify({"success": False, "message": "Unauthorized"}), 403
    
    # Fetch unresolved doubts for this teacher or doubts with no assigned teacher
    doubts = db.session.query(Doubt).filter(
        (Doubt.teacher_id == current_user.id) | (Doubt.teacher_id == None),
        Doubt.is_resolved == False
    ).all()
    
    return jsonify({"success": True, "doubts": [d.to_dict() for d in doubts]})

@teacher_bp.route('/doubts/resolve/<int:doubt_id>', methods=['POST'])
@login_required
def resolve_doubt(doubt_id):
    if not isinstance(current_user, Teacher):
        return jsonify({"success": False, "message": "Unauthorized"}), 403

    doubt = db.session.get(Doubt, doubt_id)
    if not doubt:
        return jsonify({"success": False, "message": "Doubt not found."}), 404
    
    # IDOR Check: Ensure the teacher is assigned to the doubt or it's unassigned
    if doubt.teacher_id is not None and doubt.teacher_id != current_user.id:
        return jsonify({"success": False, "message": "You are not authorized to resolve this doubt."}), 403

    doubt.is_resolved = True
    db.session.commit()
    
    return jsonify({"success": True, "message": "Doubt marked as resolved."})

@teacher_bp.route('/doubts/answer/<int:doubt_id>', methods=['POST'])
@login_required
def answer_doubt(doubt_id):
    if not isinstance(current_user, Teacher):
        return jsonify({"success": False, "message": "Unauthorized"}), 403

    doubt = db.session.get(Doubt, doubt_id)
    if not doubt:
        return jsonify({"success": False, "message": "Doubt not found."}), 404
        
    # IDOR Check: Ensure the teacher is assigned to the doubt or it's unassigned
    if doubt.teacher_id is not None and doubt.teacher_id != current_user.id:
        return jsonify({"success": False, "message": "You are not authorized to answer this doubt."}), 403

    data = request.get_json()
    answer_text = data.get('answer_text')
    
    if not answer_text:
        return jsonify({"success": False, "message": "Answer text is required."}), 400
        
    doubt.answer_text = answer_text
    doubt.is_resolved = True
    db.session.commit()
    
    return jsonify({"success": True, "message": "Doubt answered successfully."})

@teacher_bp.route('/teacher/complaint', methods=['POST'])
@login_required
def create_complaint():
    if not isinstance(current_user, Teacher):
        return jsonify({"success": False, "message": "Unauthorized"}), 403

    data = request.get_json()
    student_id = data.get('student_id')
    remark = data.get('remark')

    if not all([student_id, remark]):
        return jsonify({"success": False, "message": "Missing required fields."}), 400

    student = db.session.get(Student, student_id)
    if not student or not student.parents:
        return jsonify({"success": False, "message": "Student or linked parent not found."}), 404
        
    # IDOR Check: Ensure the teacher is associated with the student's class
    if current_user not in student.class_obj.teachers:
        return jsonify({"success": False, "message": "You are not authorized to create a complaint for this student."}), 403

    # For simplicity, we send the complaint to the first linked parent.
    # A real-world app might handle multiple parents differently.
    parent_id = student.parents[0].id
    
    # Generate the performance report content
    report_content = get_student_details(student)

    new_complaint = Complaint(
        teacher_id=current_user.id,
        student_id=student_id,
        parent_id=parent_id,
        report_content=report_content,
        teacher_remark=remark
    )
    db.session.add(new_complaint)
    db.session.commit()

    return jsonify({"success": True, "message": "Complaint sent to parent successfully."})

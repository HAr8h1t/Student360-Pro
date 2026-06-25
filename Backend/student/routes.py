from flask import request, jsonify
from flask_login import current_user, login_required
from models import db, Student, Doubt, QuizAttempt, Teacher
from . import student_bp

@student_bp.route('/student/ask-doubt', methods=['POST'])
@login_required
def ask_doubt():
    if not isinstance(current_user, Student):
        return jsonify({"success": False, "message": "Unauthorized"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"success": False, "message": "Invalid JSON or Content-Type header missing."}), 400
    question_text = data.get('question_text')
    teacher_id = data.get('teacher_id')

    if not question_text:
        return jsonify({"success": False, "message": "Missing question text."}), 400

    # Ensure the teacher exists if a specific one is assigned
    if teacher_id and not db.session.get(Teacher, teacher_id):
        return jsonify({"success": False, "message": "Teacher not found."}), 404
        
    new_doubt = Doubt(
        student_id=current_user.id,
        question_text=question_text,
        teacher_id=teacher_id
    )
    db.session.add(new_doubt)
    db.session.commit()

    return jsonify({"success": True, "message": "Your doubt has been submitted successfully!"})

@student_bp.route('/student/doubts/<int:student_id>', methods=['GET'])
@login_required
def get_student_doubts(student_id):
    if not isinstance(current_user, Student) or current_user.id != student_id:
        return jsonify({"success": False, "message": "Unauthorized"}), 403
    student = db.session.get(Student, student_id)
    if not student:
        return jsonify({"success": False, "message": "Student not found."}), 404
        
    doubts = db.session.query(Doubt).filter(Doubt.student_id == student_id).all()
    return jsonify({"success": True, "doubts": [d.to_dict() for d in doubts]})

@student_bp.route('/student/teachers', methods=['GET'])
@login_required
def get_student_teachers():
    if not isinstance(current_user, Student):
        return jsonify({"success": False, "message": "Unauthorized"}), 403

    if not current_user.class_obj:
        return jsonify({"success": False, "message": "Student or class not found."}), 404
        
    teachers = current_user.class_obj.teachers
    return jsonify({"success": True, "teachers": [t.to_dict() for t in teachers]})

@student_bp.route('/student/quiz/attempt', methods=['POST'])
@login_required
def save_quiz_attempt():
    if not isinstance(current_user, Student):
        return jsonify({"success": False, "message": "Unauthorized"}), 403

    data = request.get_json()
    
    # Basic validation
    required_fields = ['subject', 'score', 'total_questions', 'accuracy', 'time_taken_seconds', 'details']
    if not all(field in data for field in required_fields):
        return jsonify({"success": False, "message": "Missing required fields for quiz attempt."}), 400

    new_attempt = QuizAttempt(
        student_id=current_user.id,
        subject=data['subject'],
        score=data['score'],
        total_questions=data['total_questions'],
        accuracy=data['accuracy'],
        time_taken_seconds=data['time_taken_seconds'],
        details=data['details']
    )
    db.session.add(new_attempt)
    db.session.commit()

    return jsonify({"success": True, "message": "Quiz attempt saved successfully."}), 201

@student_bp.route('/student/quiz/history', methods=['GET'])
@login_required
def get_quiz_history():
    if not isinstance(current_user, Student):
        return jsonify({"success": False, "message": "Unauthorized"}), 403

    attempts = current_user.quiz_attempts.order_by(QuizAttempt.attempted_at.desc()).all()
    return jsonify({"success": True, "history": [attempt.to_dict() for attempt in attempts]})

from models import db, Student

def get_student_details(student):
    """A helper to get full student details, including calculated fields."""
    student_dict = student.to_dict()
    marks = student_dict.get('marks', {})
    
    if marks:
        overall_avg = sum(marks.values()) / len(marks) if marks else 0
        student_dict['overallAverage'] = f"{overall_avg:.1f}"
        lowest_subject = min(marks, key=marks.get)
        highest_subject = max(marks, key=marks.get)
        student_dict['lowestSubject'] = {"subject": lowest_subject, "score": marks[lowest_subject]}
        student_dict['highestSubject'] = {"subject": highest_subject, "score": marks[highest_subject]}
    else:
        student_dict['overallAverage'] = "0.0"
        student_dict['lowestSubject'] = {"subject": "N/A", "score": 0}
        student_dict['highestSubject'] = {"subject": "N/A", "score": 0}
        
    # Get the number of quizzes taken
    student_dict['quizzesTaken'] = student.quiz_attempts.count()

    return student_dict

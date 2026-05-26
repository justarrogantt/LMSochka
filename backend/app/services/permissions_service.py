"""Матрица прав по ролям в классе. Используется и для guard-ов, и для отдачи фронту."""

from app.database.models import ClassRole

# Истина для бэка — здесь же фронт берёт флаги для отрисовки кнопок.
# Если добавляешь новое право, обнови всех три роли явно (no defaults).
_MATRIX: dict[ClassRole, dict[str, bool]] = {
    ClassRole.STUDENT: {
        "can_create_assignment": False,
        "can_create_announcement": False,
        "can_grade_submissions": False,
        "can_delete_class": False,
        "can_manage_members": False,
        "can_submit_solution": True,
        "can_view_gradebook": False,
        "can_view_own_grades": True,
        "can_edit_class": False,
    },
    ClassRole.TEACHER: {
        "can_create_assignment": True,
        "can_create_announcement": True,
        "can_grade_submissions": True,
        "can_delete_class": False,
        "can_manage_members": False,
        "can_submit_solution": False,
        "can_view_gradebook": True,
        "can_view_own_grades": True,
        "can_edit_class": True,
    },
    # CREATOR == OWNER в терминах ТЗ: всё, что может teacher, плюс удалить класс
    ClassRole.CREATOR: {
        "can_create_assignment": True,
        "can_create_announcement": True,
        "can_grade_submissions": True,
        "can_delete_class": True,
        "can_manage_members": True,
        "can_submit_solution": False,
        "can_view_gradebook": True,
        "can_view_own_grades": True,
        "can_edit_class": True,
    },
}


def build_permissions(role: ClassRole) -> dict[str, bool]:
    return _MATRIX[role]

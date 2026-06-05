from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.database.models import GradingMode, SubmissionStatus

# ── Запрос на создание группового задания (блок group в CreateAssignmentRequest) ──


class GroupDraft(BaseModel):
    title: str | None = Field(default=None, max_length=100)
    member_ids: list[int] = Field(default_factory=list)


class GroupDistributionManual(BaseModel):
    mode: Literal["manual"]
    groups: list[GroupDraft]


class GroupDistributionAuto(BaseModel):
    mode: Literal["auto"]
    group_count: int = Field(ge=1, le=100)


class AssignmentGroupCreate(BaseModel):
    grading_mode: GradingMode
    # общий лимит участников на одну команду (None — без ограничения)
    max_team_size: int | None = Field(default=None, ge=1, le=1000)
    distribution: GroupDistributionManual | GroupDistributionAuto


# ── Запросы управления группами после создания ──


class CreateGroupRequest(BaseModel):
    title: str | None = Field(default=None, max_length=100)


class RenameGroupRequest(BaseModel):
    title: str = Field(min_length=1, max_length=100)


class AddGroupMemberRequest(BaseModel):
    user_id: int


class AutoDistributeRequest(BaseModel):
    group_count: int = Field(ge=1, le=100)


# ── DTO групп ──


class GroupMemberDTO(BaseModel):
    user_id: int
    email: EmailStr
    first_name: str | None
    last_name: str | None
    is_active: bool = True


class AssignmentGroupDTO(BaseModel):
    id: int
    title: str
    members: list[GroupMemberDTO]
    # статус командного решения — нужен преподавателю и для блокировок на фронте
    submission_status: SubmissionStatus | None = None


class AssignmentGroupsDTO(BaseModel):
    grading_mode: GradingMode
    # общий лимит участников на команду (None — без ограничения)
    max_team_size: int | None = None
    groups: list[AssignmentGroupDTO]
    # активные студенты класса без группы — для редактора (добавить поиском)
    unassigned_students: list[GroupMemberDTO]


# ── Перераспределение оценки внутри команды (individual) ──


class MemberGradeDTO(BaseModel):
    user_id: int
    value: float


class SubmissionMemberGradesDTO(BaseModel):
    team_value: float          # командная оценка
    max_grade: float
    members: list[GroupMemberDTO]
    grades: list[MemberGradeDTO]  # текущее распределение (может быть пустым)


class MemberGradesRequest(BaseModel):
    grades: list[MemberGradeDTO]

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.education_service import (
    get_topics_with_progress,
    get_topic_facts,
    submit_quiz_answer,
    get_knowledge_score,
)
from app.models.user import User
from app.schemas import (
    TopicSummary, FactDetail, QuizAnswerRequest, QuizAnswerResponse,
    UserKnowledgeScore,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/education", tags=["education"])


@router.get("/topics", response_model=list[TopicSummary])
async def list_topics(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_topics_with_progress(db, user.id)


@router.get("/topics/{topic_id}/facts", response_model=list[FactDetail])
async def list_topic_facts(
    topic_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await get_topic_facts(db, user.id, topic_id)
    except Exception as e:
        logger.exception(f"Error loading facts for topic {topic_id}")
        raise


@router.post("/quiz/answer", response_model=QuizAnswerResponse)
async def answer_quiz(
    req: QuizAnswerRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await submit_quiz_answer(db, user.id, req.question_id, req.selected_option)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/score", response_model=UserKnowledgeScore)
async def user_score(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_knowledge_score(db, user.id)

from uuid import UUID
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.education import EducationTopic, EducationFact, QuizQuestion, QuizAttempt
from app.schemas import (
    TopicSummary, FactDetail, QuizQuestionResponse, QuizAnswerResponse,
    UserKnowledgeScore,
)

CORRECT_POINTS = 10
RETRY_COOLDOWN_DAYS = 3


async def get_topics_with_progress(
    db: AsyncSession, user_id: UUID
) -> list[TopicSummary]:
    """List all active topics with per-user completion stats."""
    # Get active topics
    result = await db.execute(
        select(EducationTopic)
        .where(EducationTopic.is_active == True)
        .order_by(EducationTopic.display_order)
    )
    topics = list(result.scalars().all())

    summaries = []
    for topic in topics:
        # Count active facts in this topic
        fact_count_result = await db.execute(
            select(func.count(EducationFact.id))
            .where(EducationFact.topic_id == topic.id, EducationFact.is_active == True)
        )
        fact_count = fact_count_result.scalar() or 0

        # Count facts the user has mastered (correct answer exists)
        completed_result = await db.execute(
            select(func.count(func.distinct(QuizQuestion.fact_id)))
            .join(QuizAttempt, QuizAttempt.question_id == QuizQuestion.id)
            .join(EducationFact, EducationFact.id == QuizQuestion.fact_id)
            .where(
                QuizAttempt.user_id == user_id,
                QuizAttempt.is_correct == True,
                EducationFact.topic_id == topic.id,
                EducationFact.is_active == True,
            )
        )
        completed_count = completed_result.scalar() or 0

        progress_pct = (completed_count / fact_count * 100) if fact_count > 0 else 0

        summaries.append(TopicSummary(
            id=topic.id,
            name=topic.name,
            description=topic.description,
            icon=topic.icon,
            fact_count=fact_count,
            completed_count=completed_count,
            progress_pct=round(progress_pct, 1),
        ))

    return summaries


async def get_topic_facts(
    db: AsyncSession, user_id: UUID, topic_id: str
) -> list[FactDetail]:
    """Get facts for a topic with mastered/locked status per user."""
    # Get active facts for this topic
    result = await db.execute(
        select(EducationFact)
        .where(EducationFact.topic_id == topic_id, EducationFact.is_active == True)
        .order_by(EducationFact.display_order)
    )
    facts = list(result.scalars().all())

    details = []
    for fact in facts:
        # Get the quiz question for this fact
        q_result = await db.execute(
            select(QuizQuestion).where(QuizQuestion.fact_id == fact.id)
        )
        question = q_result.scalar_one_or_none()

        is_mastered = False
        is_locked = False
        retry_available_at = None

        if question:
            # Check user's attempts for this question
            attempts_result = await db.execute(
                select(QuizAttempt)
                .where(
                    QuizAttempt.user_id == user_id,
                    QuizAttempt.question_id == question.id,
                )
                .order_by(QuizAttempt.attempted_at.desc())
            )
            attempts = list(attempts_result.scalars().all())

            if attempts:
                # Check if any attempt was correct
                if any(a.is_correct for a in attempts):
                    is_mastered = True
                else:
                    # Check if the latest wrong attempt has a cooldown
                    latest = attempts[0]
                    if latest.retry_available_at:
                        now = datetime.now(timezone.utc)
                        if now < latest.retry_available_at:
                            is_locked = True
                            retry_available_at = latest.retry_available_at

        question_response = None
        if question:
            question_response = QuizQuestionResponse(
                id=question.id,
                question_text=question.question_text,
                option_a=question.option_a,
                option_b=question.option_b,
                option_c=question.option_c,
                option_d=question.option_d,
            )

        details.append(FactDetail(
            id=fact.id,
            title=fact.title,
            explanation=fact.explanation,
            question=question_response,
            is_mastered=is_mastered,
            is_locked=is_locked,
            retry_available_at=retry_available_at,
        ))

    return details


async def submit_quiz_answer(
    db: AsyncSession, user_id: UUID, question_id: str, selected_option: str
) -> QuizAnswerResponse:
    """Submit a quiz answer. Validates cooldowns, records attempt, computes score."""
    # Get the question
    question = await db.get(QuizQuestion, question_id)
    if not question:
        raise ValueError("Question not found")

    # Get the associated fact for the explanation
    fact = await db.get(EducationFact, question.fact_id)

    # Check if already mastered
    mastered_result = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.user_id == user_id,
            QuizAttempt.question_id == question_id,
            QuizAttempt.is_correct == True,
        ).limit(1)
    )
    if mastered_result.scalar_one_or_none():
        raise ValueError("You already mastered this question")

    # Check cooldown from most recent wrong attempt
    latest_result = await db.execute(
        select(QuizAttempt)
        .where(
            QuizAttempt.user_id == user_id,
            QuizAttempt.question_id == question_id,
            QuizAttempt.is_correct == False,
        )
        .order_by(QuizAttempt.attempted_at.desc())
        .limit(1)
    )
    latest_wrong = latest_result.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if latest_wrong and latest_wrong.retry_available_at:
        if now < latest_wrong.retry_available_at:
            raise ValueError(
                f"Question is locked. Retry available at {latest_wrong.retry_available_at.isoformat()}"
            )

    # Evaluate answer
    is_correct = selected_option == question.correct_option
    points_earned = CORRECT_POINTS if is_correct else 0
    retry_available_at = None if is_correct else now + timedelta(days=RETRY_COOLDOWN_DAYS)

    # Record attempt
    attempt = QuizAttempt(
        user_id=user_id,
        question_id=question_id,
        selected_option=selected_option,
        is_correct=is_correct,
        points_earned=points_earned,
        retry_available_at=retry_available_at,
    )
    db.add(attempt)
    await db.commit()

    # Compute total knowledge score
    score = await _compute_knowledge_score(db, user_id)

    return QuizAnswerResponse(
        is_correct=is_correct,
        correct_option=question.correct_option,
        explanation=fact.explanation if fact else "",
        points_earned=points_earned,
        retry_available_at=retry_available_at,
        knowledge_score=score,
    )


async def get_knowledge_score(
    db: AsyncSession, user_id: UUID
) -> UserKnowledgeScore:
    """Aggregate knowledge score from quiz attempts."""
    total_score = await _compute_knowledge_score(db, user_id)

    # Count total questions answered (distinct questions)
    answered_result = await db.execute(
        select(func.count(func.distinct(QuizAttempt.question_id)))
        .where(QuizAttempt.user_id == user_id)
    )
    questions_answered = answered_result.scalar() or 0

    # Count correct (mastered) questions
    correct_result = await db.execute(
        select(func.count(func.distinct(QuizAttempt.question_id)))
        .where(QuizAttempt.user_id == user_id, QuizAttempt.is_correct == True)
    )
    questions_correct = correct_result.scalar() or 0

    # Count mastered topics (all active facts in topic are mastered)
    topics_result = await db.execute(
        select(EducationTopic).where(EducationTopic.is_active == True)
    )
    topics = list(topics_result.scalars().all())

    topics_mastered = 0
    for topic in topics:
        fact_count_result = await db.execute(
            select(func.count(EducationFact.id))
            .where(EducationFact.topic_id == topic.id, EducationFact.is_active == True)
        )
        fact_count = fact_count_result.scalar() or 0
        if fact_count == 0:
            continue

        mastered_result = await db.execute(
            select(func.count(func.distinct(QuizQuestion.fact_id)))
            .join(QuizAttempt, QuizAttempt.question_id == QuizQuestion.id)
            .join(EducationFact, EducationFact.id == QuizQuestion.fact_id)
            .where(
                QuizAttempt.user_id == user_id,
                QuizAttempt.is_correct == True,
                EducationFact.topic_id == topic.id,
                EducationFact.is_active == True,
            )
        )
        mastered_count = mastered_result.scalar() or 0
        if mastered_count >= fact_count:
            topics_mastered += 1

    return UserKnowledgeScore(
        total_score=total_score,
        questions_answered=questions_answered,
        questions_correct=questions_correct,
        topics_mastered=topics_mastered,
    )


async def _compute_knowledge_score(db: AsyncSession, user_id: UUID) -> int:
    """Sum of points from all correct attempts (one per question)."""
    result = await db.execute(
        select(func.sum(QuizAttempt.points_earned))
        .where(QuizAttempt.user_id == user_id, QuizAttempt.is_correct == True)
    )
    return result.scalar() or 0

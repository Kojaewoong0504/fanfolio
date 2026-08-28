from __future__ import annotations

import secrets
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Header, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db.session import begin_contention_safe_transaction
from app.dependencies import CurrentAdmin, DbSession, FanUser
from app.errors import AppError
from app.models import (
    Card,
    CardCombination,
    CardCombinationMaterial,
    CardCombinationRecipe,
    CardOwnershipLedger,
    CardPack,
    CardPackCard,
    UserCard,
)
from app.schemas import CardCombinationRecipeCreate, CardCombinationRequest
from app.services import (
    grant_user_card,
    notify_user_once,
    record_audit,
    record_engagement_event,
)
from app.tasks import enqueue_engagement_event

router = APIRouter(prefix="/api", tags=["card-combinations"])


def _odds(recipe: CardCombinationRecipe, cards: dict[str, Card]) -> list[dict]:
    return [
        {
            "cardId": card_id,
            "name": cards[card_id].name,
            "rarity": cards[card_id].rarity,
            "imageUrl": cards[card_id].image_url,
            "probability": probability,
        }
        for card_id, probability in recipe.probability_snapshot.items()
        if card_id in cards
    ]


async def _recipe_context(
    session: DbSession, recipe_id: str, *, lock: bool = False
) -> tuple[CardCombinationRecipe, CardPack, list[CardPackCard], dict[str, Card]]:
    recipe = await session.get(CardCombinationRecipe, recipe_id)
    if recipe is None or recipe.status != "published":
        raise AppError(404, "CARD_COMBINATION_RECIPE_NOT_FOUND", "조합 정책을 찾을 수 없습니다.")
    if recipe.scope_type != "card_pack":
        raise AppError(422, "CARD_COMBINATION_SCOPE_UNSUPPORTED", "지원하지 않는 조합 범위입니다.")
    pack = await session.get(CardPack, recipe.scope_id)
    if pack is None or pack.status != "published":
        raise AppError(
            409, "CARD_COMBINATION_PACK_UNAVAILABLE", "공개된 카드팩에서만 조합할 수 있습니다."
        )
    links = list(
        await session.scalars(
            select(CardPackCard).where(CardPackCard.pack_id == pack.id, CardPackCard.enabled)
        )
    )
    card_ids = [link.card_id for link in links]
    cards = {
        card.id: card for card in await session.scalars(select(Card).where(Card.id.in_(card_ids)))
    }
    if lock:
        recipe = await session.get(CardCombinationRecipe, recipe.id, with_for_update=True)
    return recipe, pack, links, cards


@router.post("/admin/card-combination-recipes", status_code=status.HTTP_201_CREATED)
async def create_combination_recipe(
    payload: CardCombinationRecipeCreate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    if not context.is_root:
        context.require_action("cards:write")
    context.require_write()
    pack = await session.get(CardPack, payload.scope_id)
    if pack is None:
        raise AppError(404, "CARD_PACK_NOT_FOUND", "카드팩을 찾을 수 없습니다.")
    context.require_artist(pack.artist_id)
    links = list(
        await session.scalars(
            select(CardPackCard).where(CardPackCard.pack_id == pack.id, CardPackCard.enabled)
        )
    )
    eligible_ids = set()
    cards = {
        card.id: card
        for card in await session.scalars(
            select(Card).where(Card.id.in_([link.card_id for link in links]))
        )
    }
    for card in cards.values():
        if (
            card.status == "published"
            and card.issue_limit is None
            and card.rarity in payload.output_rarity_pool
        ):
            eligible_ids.add(card.id)
    if set(payload.probability_snapshot) - eligible_ids:
        raise AppError(
            422,
            "CARD_COMBINATION_RESULT_NOT_ELIGIBLE",
            "조합 결과에는 공개된 무제한 카드만 포함할 수 있습니다.",
        )
    total = sum(payload.probability_snapshot.values())
    if abs(total - 100) > 0.001 or any(
        value <= 0 for value in payload.probability_snapshot.values()
    ):
        raise AppError(422, "INVALID_COMBINATION_ODDS", "조합 확률의 합계는 100%여야 합니다.")
    existing = await session.scalar(
        select(CardCombinationRecipe).where(
            CardCombinationRecipe.scope_type == payload.scope_type,
            CardCombinationRecipe.scope_id == payload.scope_id,
        )
    )
    if existing:
        raise AppError(409, "CARD_COMBINATION_RECIPE_EXISTS", "카드팩에 이미 조합 정책이 있습니다.")
    recipe = CardCombinationRecipe(
        id=f"recipe_{uuid4().hex[:12]}",
        scope_type=payload.scope_type,
        scope_id=payload.scope_id,
        input_quantity=payload.input_quantity,
        output_rarity_pool=payload.output_rarity_pool,
        probability_snapshot=payload.probability_snapshot,
        probability_version=f"{pack.version}:combination-1",
        status="published",
    )
    session.add(recipe)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="card_combination_recipe.created",
        entity_type="card_combination_recipe",
        entity_id=recipe.id,
        organization_id=context.membership.organization_id,
        artist_id=pack.artist_id,
        details={"scopeId": pack.id, "inputQuantity": recipe.input_quantity},
    )
    await session.commit()
    return {
        "ok": True,
        "data": {
            "id": recipe.id,
            "scopeType": recipe.scope_type,
            "scopeId": recipe.scope_id,
            "inputQuantity": recipe.input_quantity,
            "outputRarityPool": recipe.output_rarity_pool,
            "probabilityVersion": recipe.probability_version,
            "publicOdds": _odds(recipe, cards),
        },
    }


@router.get("/catalog/card-packs/{pack_id}/combination")
async def get_pack_combination(pack_id: str, session: DbSession) -> dict:
    recipe = await session.scalar(
        select(CardCombinationRecipe).where(
            CardCombinationRecipe.scope_type == "card_pack",
            CardCombinationRecipe.scope_id == pack_id,
            CardCombinationRecipe.status == "published",
        )
    )
    if recipe is None:
        raise AppError(
            404, "CARD_COMBINATION_RECIPE_NOT_FOUND", "이 카드팩에는 조합 정책이 없습니다."
        )
    recipe, pack, _, cards = await _recipe_context(session, recipe.id)
    return {
        "ok": True,
        "data": {
            "id": recipe.id,
            "packId": pack.id,
            "packName": pack.name,
            "inputQuantity": recipe.input_quantity,
            "outputRarityPool": recipe.output_rarity_pool,
            "probabilityVersion": recipe.probability_version,
            "publicOdds": _odds(recipe, cards),
        },
    }


@router.post("/me/card-combinations/preview")
async def preview_card_combination(
    payload: CardCombinationRequest, user: FanUser, session: DbSession
) -> dict:
    recipe, pack, links, cards = await _recipe_context(session, payload.recipe_id)
    if len(payload.material_user_card_ids) != recipe.input_quantity:
        raise AppError(422, "CARD_COMBINATION_QUANTITY_INVALID", "조합 재료 수량이 맞지 않습니다.")
    materials = list(
        await session.scalars(
            select(UserCard).where(
                UserCard.id.in_(payload.material_user_card_ids), UserCard.user_id == user.id
            )
        )
    )
    pack_card_ids = {link.card_id for link in links}
    if len(materials) != len(set(payload.material_user_card_ids)) or any(
        item.card_id not in pack_card_ids for item in materials
    ):
        raise AppError(
            422, "CARD_COMBINATION_SCOPE_MISMATCH", "같은 카드팩의 카드만 조합할 수 있습니다."
        )
    reserved = set(
        await session.scalars(
            select(CardCombinationMaterial.user_card_id).where(
                CardCombinationMaterial.user_card_id.in_(payload.material_user_card_ids)
            )
        )
    )
    if reserved:
        raise AppError(
            409, "CARD_COMBINATION_MATERIAL_UNAVAILABLE", "이미 사용한 카드가 포함되어 있습니다."
        )
    return {
        "ok": True,
        "data": {
            "recipeId": recipe.id,
            "packId": pack.id,
            "requiredQuantity": recipe.input_quantity,
            "consumableUserCardIds": payload.material_user_card_ids,
            "outputRarityPool": recipe.output_rarity_pool,
            "probabilityVersion": recipe.probability_version,
            "publicOdds": _odds(recipe, cards),
        },
    }


@router.post("/me/card-combinations", status_code=status.HTTP_201_CREATED)
async def combine_cards(
    payload: CardCombinationRequest,
    user: FanUser,
    session: DbSession,
    response: Response,
    background_tasks: BackgroundTasks,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    await begin_contention_safe_transaction(session)
    if idempotency_key:
        existing = await session.scalar(
            select(CardCombination).where(
                CardCombination.user_id == user.id,
                CardCombination.idempotency_key == idempotency_key,
            )
        )
        if existing:
            response.status_code = status.HTTP_200_OK
            card = await session.get(Card, existing.result_card_id)
            return {"ok": True, "data": _combination_data(existing, card)}
    recipe, pack, links, cards = await _recipe_context(session, payload.recipe_id, lock=True)
    if len(payload.material_user_card_ids) != recipe.input_quantity:
        raise AppError(422, "CARD_COMBINATION_QUANTITY_INVALID", "조합 재료 수량이 맞지 않습니다.")
    if len(set(payload.material_user_card_ids)) != len(payload.material_user_card_ids):
        raise AppError(
            422,
            "CARD_COMBINATION_DUPLICATE_MATERIAL",
            "같은 카드를 재료로 중복 선택할 수 없습니다.",
        )
    materials = list(
        await session.scalars(
            select(UserCard)
            .where(UserCard.id.in_(payload.material_user_card_ids), UserCard.user_id == user.id)
            .with_for_update()
        )
    )
    pack_card_ids = {link.card_id for link in links}
    if len(materials) != len(payload.material_user_card_ids) or any(
        item.card_id not in pack_card_ids for item in materials
    ):
        raise AppError(
            422, "CARD_COMBINATION_SCOPE_MISMATCH", "같은 카드팩의 카드만 조합할 수 있습니다."
        )
    reserved = set(
        await session.scalars(
            select(CardCombinationMaterial.user_card_id).where(
                CardCombinationMaterial.user_card_id.in_(payload.material_user_card_ids)
            )
        )
    )
    if reserved:
        raise AppError(
            409, "CARD_COMBINATION_MATERIAL_UNAVAILABLE", "이미 사용한 카드가 포함되어 있습니다."
        )
    result_card_id = _weighted_choice(recipe.probability_snapshot)
    combination = CardCombination(
        id=f"combination_{uuid4().hex[:12]}",
        user_id=user.id,
        recipe_id=recipe.id,
        result_card_id=result_card_id,
        material_user_card_ids=payload.material_user_card_ids,
        probability_version=recipe.probability_version,
        idempotency_key=idempotency_key,
        status="completed",
    )
    session.add(combination)
    await session.flush()
    for material in materials:
        session.add(
            CardCombinationMaterial(
                id=f"combination_material_{uuid4().hex[:12]}",
                combination_id=combination.id,
                user_card_id=material.id,
                card_id=material.card_id,
            )
        )
        session.add(
            CardOwnershipLedger(
                id=f"ledger_{uuid4().hex[:12]}",
                user_card_id=material.id,
                user_id=user.id,
                card_id=material.card_id,
                action="consume",
                source_type="card_combination",
                source_id=f"{combination.id}:{material.id}",
                metadata_json={"recipeId": recipe.id},
            )
        )
    result = await grant_user_card(
        session,
        user_id=user.id,
        card_id=result_card_id,
        source_type="card_combination",
        source_id=combination.id,
        acquisition_source="combination",
        metadata={
            "recipeId": recipe.id,
            "packId": pack.id,
            "probabilityVersion": recipe.probability_version,
        },
    )
    combination.result_user_card_id = result.id
    engagement_event = await record_engagement_event(
        session,
        user_id=user.id,
        kind="card_combined",
        source_type="card_combination",
        source_id=combination.id,
        payload={
            "combinationId": combination.id,
            "recipeId": recipe.id,
            "packId": pack.id,
            "cardId": result_card_id,
            "artistId": pack.artist_id,
        },
    )
    await notify_user_once(
        session,
        user_id=user.id,
        kind="card_combined",
        title="카드 조합이 완료됐어요",
        body=f"{cards[result_card_id].name} 카드를 새로 획득했습니다.",
        entity_type="user_card",
        entity_id=result.id,
        event_key=f"combination:{combination.id}",
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if (
            idempotency_key
            and "card_combinations.user_id, card_combinations.idempotency_key" in str(exc).lower()
        ):
            existing = await session.scalar(
                select(CardCombination).where(
                    CardCombination.user_id == user.id,
                    CardCombination.idempotency_key == idempotency_key,
                )
            )
            if existing:
                card = await session.get(Card, existing.result_card_id)
                response.status_code = status.HTTP_200_OK
                return {"ok": True, "data": _combination_data(existing, card)}
        if "card_combination_material" in str(exc).lower():
            raise AppError(
                409,
                "CARD_COMBINATION_MATERIAL_UNAVAILABLE",
                "이미 사용한 카드가 포함되어 있습니다.",
            ) from exc
        raise
    enqueue_engagement_event(engagement_event.id, background_tasks)
    return {"ok": True, "data": _combination_data(combination, cards[result_card_id])}


def _weighted_choice(probabilities: dict[str, float]) -> str:
    target = secrets.SystemRandom().uniform(0, sum(probabilities.values()))
    cursor = 0.0
    for card_id, probability in probabilities.items():
        cursor += probability
        if target <= cursor:
            return card_id
    return next(reversed(probabilities))


def _combination_data(combination: CardCombination, card: Card | None) -> dict:
    return {
        "combinationId": combination.id,
        "recipeId": combination.recipe_id,
        "cardId": combination.result_card_id,
        "userCardId": combination.result_user_card_id,
        "consumedUserCardIds": combination.material_user_card_ids,
        "probabilityVersion": combination.probability_version,
        "status": combination.status,
        "card": {
            "id": card.id,
            "name": card.name,
            "rarity": card.rarity,
            "imageUrl": card.image_url,
        }
        if card
        else None,
    }

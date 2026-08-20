from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success
from tests.contract.test_card_release_workflow import create_partner_client, submit_studio_card


def test_card_release_roles_are_scoped_and_publish_is_not_an_artist_action(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    partner_a = create_partner_client(
        app,
        user_id="partner_scope_a",
        organization_id="org_scope_a",
        assigned_artist_ids=["artist_nova3"],
    )
    partner_b = create_partner_client(
        app,
        user_id="partner_scope_b",
        organization_id="org_scope_b",
        assigned_artist_ids=[],
    )

    submitted = submit_studio_card(actors["artist"], rarity="R")

    assert_error(
        actors["artist"].post(
            f"/api/admin/cards/{submitted['id']}/publish",
        ),
        403,
        "FORBIDDEN",
    )
    assert_error(
        partner_b.get(f"/api/admin/cards/{submitted['id']}"),
        404,
        "RESOURCE_NOT_FOUND",
    )

    approved = assert_success(
        partner_a.post(
            f"/api/admin/cards/{submitted['id']}/review/partner",
            json={"decision": "approved"},
        )
    )
    assert approved["releaseStatus"] == "approved"

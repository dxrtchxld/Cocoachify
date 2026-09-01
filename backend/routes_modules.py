"""Per-coach module flags — lets each new platform module be enabled/disabled."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import get_current_user
from modules import MODULES, get_flags, require_coach, set_flags, workspace_coach_id

router = APIRouter(prefix="/modules", tags=["modules"])


class FlagsBody(BaseModel):
    flags: dict[str, bool] = Field(default_factory=dict)


@router.get("")
async def list_modules(user: dict = Depends(get_current_user)):
    """Catalog + current state. Clients see their coach's workspace flags (read-only)."""
    try:
        coach_id = workspace_coach_id(user)
    except Exception:  # not connected to a coach yet
        return {"editable": False, "modules": [
            {"key": k, "label": v[0], "description": v[1], "enabled": False}
            for k, v in MODULES.items()
        ]}
    flags = await get_flags(coach_id)
    return {
        "editable": user.get("role") == "coach",
        "modules": [
            {"key": k, "label": v[0], "description": v[1], "enabled": flags.get(k, False)}
            for k, v in MODULES.items()
        ],
    }


@router.put("")
async def update_modules(body: FlagsBody, user: dict = Depends(get_current_user)):
    require_coach(user)
    flags = await set_flags(user["user_id"], body.flags)
    return {
        "editable": True,
        "modules": [
            {"key": k, "label": v[0], "description": v[1], "enabled": flags.get(k, False)}
            for k, v in MODULES.items()
        ],
    }

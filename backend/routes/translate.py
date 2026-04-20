from fastapi import APIRouter

router = APIRouter()


@router.post("/")
async def translate():
    return {"status": "not implemented"}

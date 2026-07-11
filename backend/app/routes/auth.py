from fastapi import APIRouter, HTTPException, Body
import httpx
import os
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class AuthCodeRequest(BaseModel):
    code: str

@router.post("/github")
async def github_login(request: AuthCodeRequest):
    client_id = os.getenv("GITHUB_CLIENT_ID")
    client_secret = os.getenv("GITHUB_CLIENT_SECRET")
    
    if not client_id or not client_secret:
        raise HTTPException(status_code=500, detail="OAuth credentials missing in backend.")

    # request github for access token using the provided code
    token_url = "https://github.com/login/oauth/access_token"
    headers = {"Accept": "application/json"}
    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": request.code
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(token_url, json=payload, headers=headers)
        data = response.json()

        if "error" in data:
            print(f"OAUTH ERROR: {data}")
            raise HTTPException(status_code=400, detail="Invalid or expired GitHub code.")

        access_token = data.get("access_token")

        # use the token for fetvhing user profile
        user_response = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        user_data = user_response.json()

        # send back the user profile and token generated
        return {
            "status": "success",
            "token": access_token,
            "user": {
                "username": user_data.get("login"),
                "avatar_url": user_data.get("avatar_url"),
                "name": user_data.get("name")
            }
        }
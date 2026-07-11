import httpx
from fastapi import APIRouter, HTTPException, Request
from services.chat_service import ChatService
from schemas import ChatRequest 
from pydantic import BaseModel

router = APIRouter(prefix="/api/chat", tags=["Chat"])

class RenameRequest(BaseModel):
    name: str

# username cache to avoid repeated API calls for the same token
_user_cache = {}

async def get_github_username(token: str):
    if token in _user_cache:
        return _user_cache[token]
    
    async with httpx.AsyncClient() as client:
        response = await client.get("https://api.github.com/user", headers={"Authorization": f"Bearer {token}"})
        if response.status_code == 200:
            username = response.json().get("login")
            _user_cache[token] = username
            return username
    return None

@router.post("")
async def handle_chat(payload: ChatRequest, request: Request):
    try:
        auth_header = request.headers.get("Authorization")
        token = auth_header.split(" ")[1] if auth_header and auth_header.startswith("Bearer ") else None
            
        if not token:
            raise HTTPException(status_code=401, detail="Unauthorized: No GitHub token provided.")

        username = await get_github_username(token)

        return await ChatService.process_chat(payload, token, username)
        
    except Exception as e:
        print(f"\n error: {repr(e)}\n")
        return {"status": "error", "reply": f" server error: {str(e)}"}
    

@router.delete("/purge-all")
async def purge_all_sessions(request: Request):
    try:
        auth_header = request.headers.get("Authorization")
        token = auth_header.split(" ")[1] if auth_header and auth_header.startswith("Bearer ") else None
        
        if not token:
            raise HTTPException(status_code=401, detail="Unauthorized: No GitHub token provided.")

        username = await get_github_username(token)
        if not username:
             raise HTTPException(status_code=401, detail="Invalid or expired token.")

        return await ChatService.purge_all_sessions(username)
        
    except Exception as e:
        print(f" error in purge: {str(e)}")
        raise HTTPException(status_code=500, detail="failed to delete all the threads of the user")

@router.get("/threads/all")
async def get_all_threads(request: Request):    
    try:
        auth_header = request.headers.get("Authorization")
        token = auth_header.split(" ")[1] if auth_header and auth_header.startswith("Bearer ") else None
        
        if not token:
            return {"status": "success", "threads": []}

        username = await get_github_username(token)
        if not username:
             return {"status": "success", "threads": []}
        
        return await ChatService.get_all_threads(username, token)
        
    except Exception as e:
        print(f" error in fetching threads: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch threads.")

@router.put("/threads/{thread_id}/rename")
async def rename_thread(thread_id: str, request: RenameRequest):
    try:
        return await ChatService.rename_thread(thread_id, request.name)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to rename a thread.")

@router.delete("/{thread_id}")
async def delete_single_thread(thread_id: str):
    try:
        return await ChatService.delete_thread(thread_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete a thread.")
    
@router.get("/{thread_id}/history")
async def get_thread_history(thread_id: str, request: Request):
    try:
        auth_header = request.headers.get("Authorization")
        token = auth_header.split(" ")[1] if auth_header and auth_header.startswith("Bearer ") else None
        
        if not token:
            raise HTTPException(status_code=401, detail="Unauthorized")

        history_response = await ChatService.fetch_history(thread_id, token)
        
        return {
            "status": "success", 
            "chatLog": history_response.messages,
            "is_paused": history_response.is_paused,
            "pendingApproval": history_response.pending_tool
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"\n error in fetching history: {repr(e)}\n")
        return {"status": "error", "chatLog": []}
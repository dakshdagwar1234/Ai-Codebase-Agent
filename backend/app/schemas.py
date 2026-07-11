from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

# incoming data from react
class ChatRequest(BaseModel):
    repository_url: str
    message: str
    thread_id: str 

# outgoing data from fastapi
class MessageResponse(BaseModel):
    sender: str              # 'user', 'agent', or 'system'
    text: Optional[str] = None
    detail: Optional[str] = None
    isInterrupt: bool = False

class ChatHistoryResponse(BaseModel):
    messages: List[MessageResponse]
    is_paused: bool
    pending_tool: Optional[Dict[str, Any]] = None

class ChatActionResponse(BaseModel):
    status: str              # 'success' or 'requires_approval'
    reply: Optional[str] = None
    message: Optional[str] = None
    tool_details: Optional[Dict[str, Any]] = None
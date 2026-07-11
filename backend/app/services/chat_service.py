import json
from sqlalchemy import text
from database import engine
from langchain_core.messages import HumanMessage, ToolMessage, AIMessage
from graph import get_agent_graph
from schemas import ChatRequest, ChatActionResponse, ChatHistoryResponse, MessageResponse

class ChatService:
    @staticmethod
    async def fetch_history(thread_id: str, token: str) -> ChatHistoryResponse:
        agent_graph = await get_agent_graph(token)

        config = {"configurable": {"thread_id": thread_id, "github_token": token}}
        
        state = await agent_graph.aget_state(config)
        
        if not state.values or "messages" not in state.values:
            return ChatHistoryResponse(messages=[], is_paused=False, pending_tool=None)
            
        formatted_messages = []
        for msg in state.values["messages"]:
            msg_type = msg.__class__.__name__
            
            if msg_type == "ToolMessage":
                continue  
            if msg_type == "AIMessage" and not msg.content:
                continue  
                
            sender = "user" if msg_type == "HumanMessage" else "agent"
            raw_text = msg.content
            
            # changed lists to pydantic
            if isinstance(raw_text, list):
                text_content = "\n".join([item.get("text", "") for item in raw_text if isinstance(item, dict) and "text" in item])
            elif not isinstance(raw_text, str):
                text_content = str(raw_text)
            else:
                text_content = raw_text
            
            # cleaned double escaped strings
            if "\\n" in text_content or '\\"' in text_content:
                text_content = text_content.replace('\\n', '\n').replace('\\"', '"')
                
            try:
                cleaned_reply = text_content.strip()
                if (cleaned_reply.startswith("[") and cleaned_reply.endswith("]")) or (cleaned_reply.startswith("{") and cleaned_reply.endswith("}")):
                    parsed_json = json.loads(cleaned_reply)
                    text_content = f"```json\n{json.dumps(parsed_json, indent=2)}\n```"
            except Exception:
                pass
            
            if sender == "user" and "User Command:" in text_content:
                text_content = text_content.split("User Command: ")[-1].strip()
                
            if text_content.strip():
                formatted_messages.append(MessageResponse(sender=sender, text=text_content))
            
        is_paused = bool(state.next)
        pending_tool = None
        
        if is_paused:
            for msg in reversed(state.values["messages"]):
                tool_calls = getattr(msg, "tool_calls", [])
                if not tool_calls and hasattr(msg, "additional_kwargs"):
                    tool_calls = msg.additional_kwargs.get("tool_calls", [])
                if tool_calls:
                    pending_tool = tool_calls[0]
                    break

        return ChatHistoryResponse(
            messages=formatted_messages, 
            is_paused=is_paused, 
            pending_tool=pending_tool
        )

    @staticmethod
    async def process_chat(request: ChatRequest, token: str, username: str)-> ChatActionResponse:
        async with engine.begin() as conn:
            await conn.execute(text("""
                    INSERT INTO chat_threads (id, name, owner_token, target_repo_url, username) 
                    VALUES (:id, :id, :token, :repo, :username)
                    ON CONFLICT(id) DO UPDATE SET 
                        username = :username,
                        target_repo_url = :repo;
                """), {
                    "id": request.thread_id, 
                    "token": token, 
                    "repo": request.repository_url,
                    "username": username
                })

        agent_graph = await get_agent_graph(token)
        config = {"configurable": {"thread_id": request.thread_id, "github_token": token}}
        
        try:
            current_state = await agent_graph.aget_state(config)
            
            APPROVAL_SIGNAL = "User confirmed action. Execute tool."
            REJECTION_SIGNAL = "User rejected action. Abort tool."
            
            if current_state.next:
                if request.message == APPROVAL_SIGNAL:
                    final_state = await agent_graph.ainvoke(None, config=config)
                    
                elif request.message == REJECTION_SIGNAL:
                    # clicked abort
                    for msg in reversed(current_state.values["messages"]):
                        tool_calls = getattr(msg, "tool_calls", [])
                        if not tool_calls and hasattr(msg, "additional_kwargs"):
                            tool_calls = msg.additional_kwargs.get("tool_calls", [])
                        
                        if tool_calls:
                            tool_call_id = tool_calls[0]["id"]
                            tool_name = tool_calls[0]["name"]
                            abort_message = ToolMessage(
                                tool_call_id=tool_call_id,
                                name=tool_name,
                                content="Action aborted by user. Do not execute. Ask the user how to proceed."
                            )
                            await agent_graph.aupdate_state(config, {"messages": [abort_message]}, as_node="execute_tools")
                            break
                    final_state = await agent_graph.ainvoke(None, config=config)
                    
                else:
                    for msg in reversed(current_state.values["messages"]):
                        tool_calls = getattr(msg, "tool_calls", [])
                        if not tool_calls and hasattr(msg, "additional_kwargs"):
                            tool_calls = msg.additional_kwargs.get("tool_calls", [])
                        
                        if tool_calls:
                            tool_call_id = tool_calls[0]["id"]
                            tool_name = tool_calls[0]["name"]
                            abort_message = ToolMessage(
                                tool_call_id=tool_call_id,
                                name=tool_name,
                                content="Action implicitly aborted because user issued a new command."
                            )
                            await agent_graph.aupdate_state(config, {"messages": [abort_message]}, as_node="execute_tools")
                            break
                    
                    user_prompt = f"Target Repository: {request.repository_url}\nUser Command: {request.message}"
                    human_msg = HumanMessage(content=user_prompt)
                    final_state = await agent_graph.ainvoke({"messages": [human_msg]}, config=config)
            else:
                user_prompt = f"Target Repository: {request.repository_url}\nUser Command: {request.message}"
                human_msg = HumanMessage(content=user_prompt)
                final_state = await agent_graph.ainvoke({"messages": [human_msg]}, config=config)
            
            post_state = await agent_graph.aget_state(config)
            
            if post_state.next:
                for msg in reversed(post_state.values["messages"]):
                    tool_calls = getattr(msg, "tool_calls", [])
                    if not tool_calls and hasattr(msg, "additional_kwargs"):
                        tool_calls = msg.additional_kwargs.get("tool_calls", [])
                    
                    if tool_calls:
                        return ChatActionResponse(
                            status="requires_approval",
                            message="Agent is attempting a system modification. Review required.",
                            tool_details=tool_calls[0]
                        )
                
                return ChatActionResponse(
                    status="requires_approval",
                    message="Agent is attempting a system modification. Review required.",
                    tool_details={"name": "Unknown", "args": {}}
                )
            
            ai_reply = post_state.values["messages"][-1].content
            
            # fixed json outputs
            if isinstance(ai_reply, list):
                ai_reply = "\n".join([item.get("text", "") for item in ai_reply if isinstance(item, dict) and "text" in item])
            elif not isinstance(ai_reply, str):
                ai_reply = str(ai_reply)
                
            if "\\n" in ai_reply or '\\"' in ai_reply:
                ai_reply = ai_reply.replace('\\n', '\n').replace('\\"', '"')
                
            try:
                cleaned_reply = ai_reply.strip()
                if (cleaned_reply.startswith("[") and cleaned_reply.endswith("]")) or (cleaned_reply.startswith("{") and cleaned_reply.endswith("}")):
                    parsed_json = json.loads(cleaned_reply)
                    ai_reply = f"```json\n{json.dumps(parsed_json, indent=2)}\n```"
            except Exception:
                pass
                
            return ChatActionResponse(status="success", reply=ai_reply)

        except Exception as e:
            error_text = f" System Pipeline Interrupted: {str(e)}"
            
            # force save for showing user 
            await agent_graph.aupdate_state(
                config,
                {"messages": [AIMessage(content=error_text)]}
            )
            
            return ChatActionResponse(status="error", reply=error_text)

    @staticmethod
    async def purge_all_sessions(username: str): 
        async with engine.begin() as conn:
            
            # find all the thread ids that belong to the user
            result = await conn.execute(
                text("SELECT id FROM chat_threads WHERE username = :username"), 
                {"username": username}
            )
            user_thread_ids = [row[0] for row in result.fetchall()]

            if not user_thread_ids:
                return {"status": "success", "message": "No threads found to delete."}

            for tid in user_thread_ids:
                # clear orm data
                await conn.execute(
                    text("DELETE FROM chat_messages WHERE thread_id = :tid"), 
                    {"tid": tid}
                )
                
                # clear langgraph tables
                langgraph_tables = ["checkpoints", "writes", "checkpoint_blobs", "checkpoint_writes", "checkpoint_data"]
                for table in langgraph_tables:
                    try:
                        await conn.execute(
                            text(f"DELETE FROM {table} WHERE thread_id = :tid"), 
                            {"tid": tid}
                        )
                    except Exception:
                        pass
                
                # now delete the thread
                await conn.execute(
                    text("DELETE FROM chat_threads WHERE id = :tid"), 
                    {"tid": tid}
                )
                    
        print(f" threads for user '{username}' have been delted")
        return {"status": "success", "message": "Your chat history has been completely erased."}

    @staticmethod
    async def delete_thread(thread_id: str):
        async with engine.begin() as conn:
            # clear messaged for this thread
            await conn.execute(
                text("DELETE FROM chat_messages WHERE thread_id = :tid"), 
                {"tid": thread_id}
            )
            await conn.execute(
                text("DELETE FROM chat_threads WHERE id = :tid"), 
                {"tid": thread_id}
            )
            
            # clearn langgraph tables
            langgraph_tables = ["checkpoints", "writes", "checkpoint_blobs", "checkpoint_writes", "checkpoint_data"]
            for table in langgraph_tables:
                try:
                    await conn.execute(
                        text(f"DELETE FROM {table} WHERE thread_id = :tid"), 
                        {"tid": thread_id}
                    )
                except Exception:
                    pass
                    
        print(f"Thread '{thread_id}' has been deleted")
        return {"status": "success", "message": f"Thread {thread_id} erased."}
    
    @staticmethod
    async def get_all_threads(username: str, token: str):

        async with engine.begin() as conn:
            
            result = await conn.execute(text("""
                SELECT id, name,target_repo_url FROM chat_threads 
                WHERE username = :username OR owner_token = :token
                ORDER BY id DESC; 
            """), {"username": username, "token": token})
            
            threads = [{"id": row[0], "name": row[1] or row[0], "repo_url": row[2]} for row in result.fetchall()]
            
        return {"status": "success", "threads": threads}
    
    @staticmethod
    async def rename_thread(thread_id: str, new_name: str):
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO chat_threads (id, name, target_repo_url) 
                VALUES (:id, :name, '')
                ON CONFLICT(id) DO UPDATE SET name = :name;
            """), {"id": thread_id, "name": new_name})
            
        return {"status": "success", "message": "Thread renamed successfully."}
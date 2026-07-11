import os
import json
from typing import Annotated, TypedDict
from dotenv import load_dotenv
from database import get_checkpointer

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, ToolMessage, AIMessage, HumanMessage
from langchain_mcp_adapters.client import MultiServerMCPClient

from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(dotenv_path=os.path.join(BASE_DIR, "..", "..", ".env"))

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]

# dictionary that stores the agent graphs and mcp server for each user token
_tenant_graphs = {}

async def get_agent_graph(token: str):
    global _tenant_graphs

    if token in _tenant_graphs:
        return _tenant_graphs[token]

    print("\n creating mcp server for user")

    mcp_client = MultiServerMCPClient(
        {
            "github": {
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-github"],
                "transport": "stdio",
                "env": {
                    "GITHUB_PERSONAL_ACCESS_TOKEN": token, 
                    "PATH": os.getenv("PATH", "")
                }
            }
        }
    )

    print("Fetching mcp tools")
    mcp_tools = await mcp_client.get_tools()

    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
    llm_with_tools = llm.bind_tools(mcp_tools)
    # node 1 
    async def reasoning_node(state: AgentState):
        system_prompt = SystemMessage(
            content=(
                "You are a AI Codebase Architect with full access to real-time GitHub tools.\n\n"
                "INSTRUCTIONS FOR TOOL USAGE:\n"
                "1. The GitHub tools DO NOT accept full repository URLs.\n"
                "2. When given a 'Target Repository' URL (e.g., 'https://github.com/owner/repo'), you MUST "
                "extract the 'owner' string and the 'repo' string from that URL.\n"
                "3. Use those isolated strings as the 'owner' and 'repo' parameters when calling any tool.\n"
                "4. If a specific file path isn't requested but you need to inspect the project layout, "
                "start by using tools to list or search files at the root level.\n"
                "5. When creating, updating, or pushing files, you MUST always provide the 'branch' parameter. Default to 'main' unless requested otherwise. You must also provide a concise 'message' for the commit."
            )
        )
        
        # resolves gemini's tendency to return empty strings for tool calls by checking the message content before sending to the LLM
        safe_messages = []
        for msg in state["messages"]:
            content = msg.content
            
            if isinstance(msg, ToolMessage) and isinstance(content, list):
                extracted_text = "\n".join([item.get("text", "") for item in content if isinstance(item, dict) and "text" in item])
                content = extracted_text if extracted_text.strip() else "Tool executed successfully."
                
            if not content or content == "" or content == []:
                if isinstance(msg, ToolMessage):
                    content = "Tool executed successfully (no output)."
                elif isinstance(msg, AIMessage) and getattr(msg, "tool_calls", None):
                    # gemini expects tools calls's content to be a empty string
                    content = ""
                else:
                    content = " " 
            
            if content != msg.content:
                safe_msg = msg.model_copy(update={"content": content})
                safe_messages.append(safe_msg)
            else:
                safe_messages.append(msg)

        ai_response = await llm_with_tools.ainvoke([system_prompt] + safe_messages)
        return {"messages": [ai_response]}

    # node 2
    async def reviewer_node(state: AgentState):
        last_message = state["messages"][-1]
        
        if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
            return {"messages": []}

        proposed_actions = []
        for call in last_message.tool_calls:
            proposed_actions.append({
                "tool": call["name"],
                "arguments": call["args"]
            })

        reviewer_prompt = HumanMessage(
            content=f"""
            You are a strict Staff Engineer reviewing code changes or actions proposed by a junior engineer.
            
            Proposed Actions:
            {json.dumps(proposed_actions, indent=2)}
            
            CRITERIA FOR EVALUATION:
            1. Code Efficiency: Check for runtime or compile time errors.
            2. Code Robustness: Look out for obvious edge-case handling bugs or syntax violations.
            
            OUTPUT RULES:
            - If the arguments and target actions are completely clean and efficient, reply EXACTLY with the single word: APPROVED
            - If there is a flaw, structural bug, or design pattern optimization required, reply with 'REJECTED:' followed by a clear technical critique detailing what needs to be refactored.
            """
        )

        review_response = await llm.ainvoke([reviewer_prompt])
        review_content = str(review_response.content).strip()

        if "APPROVED" in review_content:
            print("approved by reviewer")
            return {"messages": []}
        else:
            print(f"reviewer rejected the code: {review_content} ---")
            
            rejection_messages = []
            for tool_call in last_message.tool_calls:
                rejection_messages.append(
                    ToolMessage(
                        tool_call_id=tool_call["id"],
                        name=tool_call["name"],
                        content=f"SUBMISSION REJECTED BY REVIEWER: {review_content}. Refactor the implementation details."
                    )
                )
            return {"messages": rejection_messages}

    # routing logic
    def should_continue(state: AgentState):
        last_message = state["messages"][-1]
        
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            print("\n mcp tool call requested")
            for tool_call in last_message.tool_calls:
                print(f"Target Tool: {tool_call['name']}")

            return "reviewer"
            
        return END

    def evaluate_review_verdict(state: AgentState):
        last_message = state["messages"][-1]

        if isinstance(last_message, ToolMessage) and "SUBMISSION REJECTED" in last_message.content:
            return "reason"
        
        return "execute_tools"

    # build graph
    builder = StateGraph(AgentState)
    
    # add nodes
    builder.add_node("reason", reasoning_node)
    builder.add_node("reviewer", reviewer_node)
    builder.add_node("execute_tools", ToolNode(mcp_tools))

    # edges
    builder.add_edge(START, "reason")
    
    # conditonal edge for routing to reviewer or ending the graph if no tool calls are present
    builder.add_conditional_edges(
        "reason", 
        should_continue, 
        {"reviewer": "reviewer", END: END}
    )
    
    # conditional edge to decide whether to execute tools or return to reasoning node based on reviewer's result
    builder.add_conditional_edges(
        "reviewer", 
        evaluate_review_verdict, 
        {"reason": "reason", "execute_tools": "execute_tools"}
    )
    
    # final edge to return to reasoning node after tool execution
    builder.add_edge("execute_tools", "reason")

    checkpointer = await get_checkpointer()
    
    # compile graph with memory
    graph_instance = builder.compile(
        checkpointer=checkpointer,
        interrupt_before=["execute_tools"] 
    )

    print("\n graph compiled successfully")

    # flowchart
    # print(graph_instance.get_graph().draw_ascii())
    
    # save graph as mapping to token for future requests
    _tenant_graphs[token] = graph_instance
    
    return _tenant_graphs[token]
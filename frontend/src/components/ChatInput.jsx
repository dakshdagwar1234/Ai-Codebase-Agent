import React, { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import axios from "axios";
import {
  setLoading,
  setPendingApproval,
  addMessage,
} from "../store/agentSlice";

const ChatInput = () => {
  const [message, setMessage] = useState("");
  const dispatch = useDispatch();
  const { repoUrl, threadId, loading, pendingApproval, token } = useSelector(
    (state) => state.agent,
  );

  const isMissingRepo = !repoUrl || !repoUrl.trim();

  let currentPlaceholder =
    "Instruct agent...\n(Press Enter to send, Shift + Enter for new line)";
  if (isMissingRepo) {
    currentPlaceholder =
      " Please enter a Target Repository URL in the sidebar first.";
  } else if (pendingApproval) {
    currentPlaceholder = "Action pending. Awaiting review decision...";
  }

  const sendRequest = async () => {
    // Extra safety: abort if missing repo or empty message
    if (!message.trim() || isMissingRepo) return;

    const userText = message;

    dispatch(addMessage({ sender: "user", text: userText }));
    setMessage("");
    dispatch(setLoading(true));

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/chat`,
        {
          repository_url: repoUrl,
          message: userText,
          thread_id: threadId,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = response.data;

      if (data.status === "requires_approval") {
        dispatch(setPendingApproval(data.tool_details));
        dispatch(
          addMessage({
            sender: "system",
            isInterrupt: true,
            detail: data.message,
          }),
        );
      } else if (data.status === "error") {
        dispatch(setPendingApproval(null));
        dispatch(addMessage({ sender: "system", text: data.reply }));
      } else {
        dispatch(setPendingApproval(null));
        dispatch(addMessage({ sender: "agent", text: data.reply }));
      }
    } catch (error) {
      console.error("Chat request failed:", error);
      dispatch(
        addMessage({
          sender: "system",
          text: "Error executing agent.",
        }),
      );
    } finally {
      dispatch(setLoading(false));
    }
  };

  return (
    <div className="p-4 sm:p-6 bg-slate-950 border-t border-slate-800">
      <div className="max-w-3xl mx-auto flex gap-3 relative">
        <textarea
          rows={2}
          placeholder={currentPlaceholder}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
         
          disabled={!!pendingApproval || loading || isMissingRepo}
          className={`flex-1 bg-slate-900/50 backdrop-blur-md border border-slate-700/50 rounded-xl pl-4 pr-24 py-3.5 text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all shadow-inner resize-none scrollbar-hide ${
            isMissingRepo
              ? "opacity-50 cursor-not-allowed text-slate-500"
              : "text-slate-200 disabled:opacity-50"
          }`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (
                message.trim() &&
                !loading &&
                !pendingApproval &&
                !isMissingRepo
              ) {
                sendRequest();
              }
            }
          }}
        />
        <button
          onClick={sendRequest}
          disabled={
            !!pendingApproval || loading || !message.trim() || isMissingRepo
          }
          className="absolute right-2 top-2 bottom-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 transition-all font-semibold px-5 rounded-lg text-sm shadow-md flex items-center justify-center"
        >
          Send
        </button>
      </div>
      <p className="text-center text-xs text-slate-600 mt-3 font-mono">
        AI Codebase Architect can make mistakes. Verify critical code changes.
      </p>
    </div>
  );
};

export default ChatInput;

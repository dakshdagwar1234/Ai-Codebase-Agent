import React, { useState, useRef, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import ReactMarkdown from "react-markdown";
import axios from "axios";
import {
  setLoading,
  setPendingApproval,
  addMessage,
  setChatLog,
} from "../store/agentSlice";

const ChatFeed = () => {
  const dispatch = useDispatch();
  const { chatLog, loading, pendingApproval, repoUrl, threadId, token } =
    useSelector((state) => state.agent);

  const [isFetchingHistory, setIsFetchingHistory] = useState(false);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatLog, loading, pendingApproval]);

  useEffect(() => {
    if (!threadId || !token) return;

    const fetchThreadHistory = async () => {
      setIsFetchingHistory(true);
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/chat/${threadId}/history`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        dispatch(setChatLog(response.data.chatLog || []));
      } catch (error) {
        console.error("Failed to fetch chat history:", error);
        dispatch(setChatLog([]));
      } finally {
        setIsFetchingHistory(false);
      }
    };

    fetchThreadHistory();
  }, [threadId, token, dispatch]);

  const handleApprove = async () => {
    dispatch(setPendingApproval(null));
    dispatch(
      addMessage({
        sender: "user",
        text: "Permission granted. Execute action.",
      }),
    );
    dispatch(setLoading(true));

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/chat`,
        {
          repository_url: repoUrl,
          message: "User confirmed action. Execute tool.",
          thread_id: threadId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

    
      if (response.data.status === "error") {
        dispatch(addMessage({ sender: "system", text: response.data.reply }));
      } else {
        dispatch(addMessage({ sender: "agent", text: response.data.reply }));
      }
    } catch (error) {
      dispatch(
        addMessage({
          sender: "system",
          text: "Error executing approved action.",
        }),
      );
    } finally {
      dispatch(setLoading(false));
    }
  };

  const handleReject = async () => {
    dispatch(setPendingApproval(null));
    dispatch(
      addMessage({
        sender: "system",
        text: "Action rejected by human user.",
      }),
    );
    dispatch(setLoading(true));

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/chat`,
        {
          repository_url: repoUrl,
          message: "User rejected action. Abort tool.",
          thread_id: threadId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data.status === "error") {
        dispatch(addMessage({ sender: "system", text: response.data.reply }));
      } else {
        dispatch(addMessage({ sender: "agent", text: response.data.reply }));
      }
    } catch (error) {
      dispatch(
        addMessage({
          sender: "system",
          text: "Error communicating abort signal.",
        }),
      );
    } finally {
      dispatch(setLoading(false));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        {isFetchingHistory && chatLog.length === 0 && (
          <div className="flex justify-center text-slate-500 text-xs font-mono mt-10">
            Fetching Messages
          </div>
        )}

        {!isFetchingHistory && chatLog.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-2 font-mono">
            <p>&gt; Enter Commands to Agent </p>
          </div>
        )}

        {chatLog.map((chat, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${
              chat.sender === "user" ? "items-end" : "items-start"
            }`}
          >
            {/* 🚨 ADDED font-bold HERE 🚨 */}
            <span
              className={`text-xs font-mono font-bold mb-1 px-1 ${
                chat.sender === "user"
                  ? "text-indigo-400"
                  : chat.sender === "agent"
                    ? "text-emerald-400"
                    : "text-amber-400"
              }`}
            >
              {chat.sender === "user"
                ? "User"
                : chat.sender === "agent"
                  ? "AGENT"
                  : "GUARD"}
            </span>

            <div
              className={`max-w-[100%] sm:max-w-[85%] px-5 py-3.5 shadow-sm ${
                chat.sender === "user"
                  ? "bg-indigo-600 text-white rounded-2xl rounded-tr-sm"
                  : chat.isInterrupt
                    ? "bg-amber-500/10 border border-amber-500/20 text-amber-200 font-mono text-xs rounded-2xl rounded-tl-sm"
                    : "bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 text-slate-200 rounded-2xl rounded-tl-sm"
              }`}
            >
              {chat.text ? (
                <div className="prose prose-invert max-w-none text-sm break-words leading-relaxed">
                  <ReactMarkdown>
                    {typeof chat.text === "string"
                      ? chat.text
                      : JSON.stringify(chat.text, null, 2)}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="m-0">{chat.detail}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex flex-col items-start mt-2">
            {/* 🚨 ALREADY HAS font-bold 🚨 */}
            <span className="text-xs font-bold mb-1 px-1 text-emerald-400">
              AGENT
            </span>
            <div className="flex gap-1.5 px-5 py-4 bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl rounded-tl-sm w-fit shadow-sm">
              <span
                className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              ></span>
              <span
                className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              ></span>
              <span
                className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              ></span>
            </div>
          </div>
        )}

        {pendingApproval && (
          <div className="bg-slate-900/80 backdrop-blur-md border border-emerald-500/30 p-5 rounded-2xl shadow-[0_0_15px_rgba(16,185,129,0.1)] animate-in fade-in slide-in-from-bottom-2 duration-300 mt-2">
            <div className="flex items-center gap-2.5 text-emerald-400 mb-3">
              <span className="text-lg">⚠️</span>
              <h4 className="text-sm font-bold uppercase tracking-wider">
                Critical Tool Execution Requested
              </h4>
            </div>

            <div className="text-xs text-slate-400 mb-4 flex flex-col gap-1 font-mono">
              <p>
                <strong>Target Action:</strong>{" "}
                <span className="text-emerald-300">{pendingApproval.name}</span>
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 overflow-x-auto text-xs font-mono text-slate-300 mb-4 shadow-inner">
              {pendingApproval.args?.content ||
              pendingApproval.args?.contents ? (
                <>
                  <div className="text-slate-500 mb-2 border-b border-slate-800 pb-2">
                    Code Payload to Execute:
                  </div>
                  <pre className="whitespace-pre-wrap">
                    <code>
                      {pendingApproval.args.content ||
                        pendingApproval.args.contents}
                    </code>
                  </pre>
                </>
              ) : (
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(pendingApproval.args, null, 2)}
                </pre>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleApprove}
                className="bg-emerald-600 hover:bg-emerald-500 transition-colors text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-md"
              >
                Sign & Deploy Commit
              </button>
              <button
                onClick={handleReject}
                className="bg-slate-800 hover:bg-slate-700 transition-colors text-slate-300 text-xs font-semibold px-4 py-2.5 rounded-lg border border-slate-700"
              >
                Abort Action
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatFeed;

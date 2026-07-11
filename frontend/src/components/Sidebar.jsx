import React, { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import axios from "axios";
import {
  setRepoUrl,
  setThreadId,
  clearStore,
  setLoading,
  setThreadList,
} from "../store/agentSlice";

const Sidebar = () => {
  const dispatch = useDispatch();
  const { repoUrl, threadId, loading, threadList, token, chatLog } =
    useSelector((state) => state.agent);

  const [isDeleting, setIsDeleting] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  const [editingThreadId, setEditingThreadId] = useState(null);
  const [editNameValue, setEditNameValue] = useState("");
  const inputRef = useRef(null);
  const isChatActive = chatLog && chatLog.length > 0;

  useEffect(() => {
    if (editingThreadId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingThreadId]);

  useEffect(() => {
    if (threadList.length > 0 && threadId) {
      const activeThread = threadList.find((t) => t.id === threadId);
      if (activeThread && activeThread.repo_url) {
        dispatch(setRepoUrl(activeThread.repo_url));
      }
    }
  }, [threadId, threadList, dispatch]);

  const fetchThreads = async () => {
    if (!token) return;

    try {
      const response = await axios.get(
        "http://localhost:8000/api/chat/threads/all",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      dispatch(setThreadList(response.data.threads));
    } catch (error) {
      console.error("Failed to load threads:", error);
    }
  };

  useEffect(() => {
    fetchThreads();
  }, [token]);

  const handleNewChat = (incomingList) => {
    const activeList = Array.isArray(incomingList) ? incomingList : threadList;
    const newId = `session_${new Date().getTime()}`;

    dispatch(setThreadId(newId));
    dispatch(setRepoUrl(""));
    dispatch(clearStore());

    if (!activeList.find((t) => t.id === newId)) {
      dispatch(
        setThreadList([
          { id: newId, name: "New Session", repo_url: "" },
          ...activeList,
        ]),
      );
    }
  };

  const handleDeleteThread = async (targetThreadId) => {
    const confirmDelete = window.confirm(`Do u want to delete thread?`);
    if (!confirmDelete) return;

    setIsDeleting(true);
    dispatch(setLoading(true));
    try {
      await axios.delete(`http://localhost:8000/api/chat/${targetThreadId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const updatedList = threadList.filter((t) => t.id !== targetThreadId);
      dispatch(setThreadList(updatedList));

      if (threadId === targetThreadId) {
        handleNewChat(updatedList);
      }
    } catch (error) {
      console.error("Failed to delete thread:", error);
    } finally {
      setIsDeleting(false);
      dispatch(setLoading(false));
    }
  };

  const handlePurgeAll = async () => {
    const confirmWipe = window.confirm(
      "Do you want to delete all threads?",
    );
    if (!confirmWipe) return;

    setIsPurging(true);
    dispatch(setLoading(true));
    try {
      await axios.delete("http://localhost:8000/api/chat/purge-all", {
        headers: { Authorization: `Bearer ${token}` },
      });
      dispatch(clearStore());
      dispatch(setThreadList([]));
      handleNewChat([]);
    } catch (error) {
      console.error("Purge failed:", error);
    } finally {
      setIsPurging(false);
      dispatch(setLoading(false));
    }
  };

  const handleSaveRename = async (targetId) => {
    if (!editNameValue.trim()) {
      setEditingThreadId(null);
      return;
    }

    try {
      await axios.put(
        `http://localhost:8000/api/chat/threads/${targetId}/rename`,
        { name: editNameValue.trim() },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const updatedList = threadList.map((t) =>
        t.id === targetId ? { ...t, name: editNameValue.trim() } : t,
      );
      dispatch(setThreadList(updatedList));
    } catch (error) {
      console.error("Failed to rename thread:", error);
      alert("Failed to save thread name.");
    } finally {
      setEditingThreadId(null);
    }
  };

  return (
    <div className="w-full md:w-72 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-6 flex-shrink-0 h-full overflow-hidden">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-2">
        <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
        <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
          Code Architect
        </h1>
      </div>

      {/* NEW CHAT BUTTON */}
      <button
        onClick={() => handleNewChat()}
        disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-white font-semibold py-2.5 rounded-lg shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <span>+</span> New Codebase Session
      </button>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs uppercase font-semibold tracking-wider text-slate-500 px-2">
            Target Repository
          </label>
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => {
              const newUrl = e.target.value;
              dispatch(setRepoUrl(newUrl));

              // Immediately update the threadList memory so it survives thread switching!
              const updatedList = threadList.map((t) =>
                t.id === threadId ? { ...t, repo_url: newUrl } : t,
              );
              dispatch(setThreadList(updatedList));
            }}
            disabled={loading || isChatActive}
            className={`w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors ${
              isChatActive ? "opacity-50 cursor-not-allowed" : ""
            }`}
          />
        </div>
      </div>

      {/* SCROLLABLE CHAT HISTORY LIST */}
      <div className="flex-1 overflow-y-auto mt-2 -mx-2 px-2 scrollbar-thin">
        <label className="text-xs uppercase font-semibold tracking-wider text-slate-500 mb-2 block px-2">
          Recent Threads
        </label>

        {threadList.length === 0 ? (
          <p className="text-xs text-slate-600 font-mono px-2 mt-2">
            No history found.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {threadList.map((t) => (
              <div
                key={t.id}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                  threadId === t.id
                    ? "bg-slate-800 border border-slate-700"
                    : "hover:bg-slate-800/50 border border-transparent"
                }`}
                onClick={() => {
                  if (
                    threadId !== t.id &&
                    !loading &&
                    editingThreadId !== t.id
                  ) {
                    dispatch(setThreadId(t.id));
                    dispatch(setRepoUrl(t.repo_url || ""));
                  }
                }}
              >
                <div className="flex-1 truncate pr-2 flex items-center">
                  <span className="text-slate-500 mr-2 text-xs">#</span>

                  {editingThreadId === t.id ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      onBlur={() => handleSaveRename(t.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveRename(t.id);
                        if (e.key === "Escape") setEditingThreadId(null);
                      }}
                      className="bg-slate-950 border border-indigo-500 text-slate-200 text-sm rounded px-1.5 py-0.5 w-full outline-none"
                    />
                  ) : (
                    <span className="text-sm text-slate-300 font-mono truncate">
                      {t.name}
                    </span>
                  )}
                </div>

                <div
                  className={`flex items-center gap-1 ${
                    threadId === t.id
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  } transition-opacity`}
                >
                  {editingThreadId !== t.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingThreadId(t.id);
                        setEditNameValue(t.name);
                      }}
                      disabled={loading}
                      className="text-slate-500 hover:text-indigo-400 transition-colors p-1"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteThread(t.id);
                    }}
                    disabled={loading || isDeleting}
                    className="text-slate-500 hover:text-red-400 transition-colors p-1"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-800/60 pt-4 mt-auto">
        <button
          onClick={handlePurgeAll}
          disabled={loading || isPurging}
          className="w-full bg-red-950/20 hover:bg-red-900/30 border border-red-900/40 hover:border-red-500/50 text-red-400 active:scale-95 transition-all text-xs font-mono py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {isPurging ? "PURGING..." : "🗑️ Purge All Threads"}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;

import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  repoUrl: "",
  threadId: "live_architect_session",
  loading: false,
  pendingApproval: null,
  chatLog: [],
  threadList: [],

  user: null,
  token: localStorage.getItem("github_token") || null,
};

const agentSlice = createSlice({
  name: "agent",
  initialState,
  reducers: {
    setRepoUrl: (state, action) => {
      state.repoUrl = action.payload;
    },
    setThreadId: (state, action) => {
      state.threadId = action.payload;
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    setPendingApproval: (state, action) => {
      state.pendingApproval = action.payload;
    },
    addMessage: (state, action) => {
      state.chatLog.push(action.payload);
    },
    setChatLog: (state, action) => {
      state.chatLog = action.payload;
    },
    setThreadList: (state, action) => {
      state.threadList = action.payload;
    },

    setAuth: (state, action) => {
      state.user = action.payload.user;
      state.token = action.payload.token;
      localStorage.setItem("github_token", action.payload.token);
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      localStorage.removeItem("github_token");
    },

    clearStore: (state) => {
      state.chatLog = [];
      state.pendingApproval = null;
      state.loading = false;
    },
  },
});

export const {
  setRepoUrl,
  setThreadId,
  setLoading,
  setPendingApproval,
  addMessage,
  setChatLog,
  setThreadList,
  clearStore,
  setAuth,
  logout, // Export the new actions
} = agentSlice.actions;

export default agentSlice.reducer;

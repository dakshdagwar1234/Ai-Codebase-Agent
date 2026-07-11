import { configureStore } from "@reduxjs/toolkit";
import agentReducer from "./agentSlice";

export const store = configureStore({
  reducer: {
    agent: agentReducer,
  },
});

import React, { useEffect, useState, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import axios from "axios";
import Sidebar from "./components/Sidebar";
import ChatFeed from "./components/ChatFeed";
import ChatInput from "./components/ChatInput"; 
import { setAuth, logout } from "./store/agentSlice";

function App() {
  const dispatch = useDispatch();
  const { user, token } = useSelector((state) => state.agent);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const hasFetched = useRef(false);

 useEffect(() => {
   const urlParams = new URLSearchParams(window.location.search);
   const code = urlParams.get("code");
   const returnedState = urlParams.get("state"); 

   if (code && !hasFetched.current) {
     hasFetched.current = true;

     window.history.replaceState({}, document.title, "/");

   
     const savedState = sessionStorage.getItem("github_oauth_state");
     sessionStorage.removeItem("github_oauth_state");

   
     if (!savedState || savedState !== returnedState) {
       console.error(
         "OAuth state mismatch. Possible CSRF attack prevented.",
       );
       alert("Security verification failed. Please try logging in again.");
       return;
     }

     setIsAuthenticating(true);
     axios
       .post(`${import.meta.env.VITE_API_URL}/api/auth/github`, { code })
       .then((response) => {
         dispatch(
           setAuth({
             user: response.data.user,
             token: response.data.token,
           }),
         );
       })
       .catch((error) => {
         console.error("OAuth Login Failed:", error);
         alert("Login failed. Check console.");
       })
       .finally(() => {
         setIsAuthenticating(false);
       });
   }
 }, [dispatch]);

const handleLogin = () => {
  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;


  const randomState =
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);

 
  sessionStorage.setItem("github_oauth_state", randomState);


  window.location.assign(
    `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo&state=${randomState}`,
  );
};

 
  if (isAuthenticating) {
    return (
      <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-emerald-400 font-mono">
        <svg
          className="animate-spin h-10 w-10 mb-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <p>Securing GitHub connection...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center">
        <div className="bg-slate-900 p-8 rounded-xl border border-slate-800 text-center max-w-md w-full shadow-2xl">
          <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚡</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-200 mb-2">
            Codebase Architect
          </h1>
          <p className="text-slate-400 text-sm mb-8">
            Sign in with GitHub to allow the AI to analyze and modify your
            repositories.
          </p>

          <button
            onClick={handleLogin}
            className="w-full bg-white hover:bg-slate-200 text-slate-900 font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors"
          >
            <svg height="24" width="24" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
            </svg>
            Sign in with GitHub
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-300 font-sans overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 relative">
       
        <div className="absolute top-4 right-4 z-10 flex items-center gap-3 bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-full border border-slate-800">
          <img
            src={user?.avatar_url}
            alt="Profile"
            className="w-6 h-6 rounded-full"
          />
          <span className="text-xs font-semibold text-slate-300">
            {user?.username}
          </span>
          <button
            onClick={() => dispatch(logout())}
            className="text-xs text-red-400 hover:text-red-300 ml-2"
          >
            Logout
          </button>
        </div>

      
        <div className="flex-1 overflow-y-auto">
          <ChatFeed />
        </div>

        <ChatInput />

      </div>
    </div>
  );
}

export default App;
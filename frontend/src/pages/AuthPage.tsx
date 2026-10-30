import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useWorkspaceStore } from '../context/useWorkspaceStore';
import { AnavyaLogo } from '../components/BrandIcons';

export const AuthPage: React.FC = () => {
  const { setAuth } = useWorkspaceStore();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('akshat@gmail.com');
  const [password, setPassword] = useState('SecurePass123!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Handle Google OAuth login redirect (?token=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get('token');
    const queryEmail = params.get('email');
    const queryUid = params.get('uid');
    if (oauthToken) {
      window.history.replaceState({}, '', window.location.pathname);
      localStorage.setItem('taskforce_jwt', oauthToken);

      // Decode JWT payload directly so login succeeds immediately
      try {
        const payloadPart = oauthToken.split('.')[1];
        if (payloadPart) {
          const decoded = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')));
          if (decoded?.id && decoded?.email) {
            setAuth({ id: decoded.id, email: decoded.email }, oauthToken);
            return;
          }
        }
      } catch {
        // Fallback to query params or /auth/me
      }

      if (queryUid && queryEmail) {
        setAuth({ id: queryUid, email: queryEmail }, oauthToken);
        return;
      }

      api
        .get('/auth/me', {
          headers: { Authorization: `Bearer ${oauthToken}` },
        })
        .then((res) => {
          const user = res.data.data?.user;
          if (user) {
            setAuth(user, oauthToken);
          }
        })
        .catch(() => {
          localStorage.removeItem('taskforce_jwt');
          setError('Failed to verify Google OAuth session.');
        });
    }
  }, [setAuth]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const res = await api.get('/auth/google');
      const data = res.data.data;
      if (data?.configured && data?.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setError(
          'Google OAuth is not configured on the server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env, or sign in with email below.'
        );
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.message || 'Could not start Google OAuth sign-in.'
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isRegister) {
        const res = await api.post('/auth/register', { email, password });
        const { user, token } = res.data.data;
        setAuth(user, token);
      } else {
        try {
          const loginRes = await api.post('/auth/login', { email, password });
          const { user, token } = loginRes.data.data;
          setAuth(user, token);
        } catch (loginErr: any) {
          // If account doesn't exist yet on first run, create it automatically
          if (loginErr?.response?.status === 401) {
            try {
              const regRes = await api.post('/auth/register', { email, password });
              const { user, token } = regRes.data.data;
              setAuth(user, token);
              return;
            } catch {
              // If email already exists with different password, show invalid credentials
            }
          }
          throw loginErr;
        }
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          'Invalid email or password'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#181818] border border-[#262626] rounded-2xl p-6 shadow-2xl space-y-5">
        <div className="flex flex-col items-center text-center space-y-1.5">
          <AnavyaLogo className="w-10 h-10" />
          <h1 className="text-xl font-semibold text-white tracking-tight mt-1">
            Anavya
          </h1>
          <p className="text-xs text-[#8E8E93]">
            Your AI workspace. Your agents. Your work, done.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-300 leading-relaxed">
            {error}
          </div>
        )}

        {/* Real Google OAuth 2.0 Sign-In */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl bg-white hover:bg-neutral-200 text-[#121212] font-medium text-xs transition disabled:opacity-50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span>{googleLoading ? 'Redirecting to Google...' : 'Continue with Google'}</span>
        </button>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-[#262626] w-full" />
          <span className="bg-[#181818] px-3 text-[11px] text-[#6E6E73]">or</span>
          <div className="border-t border-[#262626] w-full" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="text-xs text-[#A0A0A5] block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-[#121212] border border-[#2A2A2C] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#E9A23B]"
            />
          </div>

          <div>
            <label className="text-xs text-[#A0A0A5] block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-[#121212] border border-[#2A2A2C] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#E9A23B]"
            />
          </div>

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full py-2.5 rounded-xl bg-[#E9A23B] hover:opacity-95 text-[#121212] font-semibold text-xs transition disabled:opacity-50"
          >
            {loading ? 'Signing in...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            className="text-xs text-[#8E8E93] hover:text-white transition"
          >
            {isRegister
              ? 'Already have an account? Sign in'
              : "Don't have an account? Create one"}
          </button>
        </div>
      </div>
    </div>
  );
};

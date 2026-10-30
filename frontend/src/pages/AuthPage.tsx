import React, { useState } from 'react';
import { api } from '../api/client';
import { useWorkspaceStore } from '../context/useWorkspaceStore';
import { AnavyaLogo } from '../components/BrandIcons';

export const AuthPage: React.FC = () => {
  const { setAuth } = useWorkspaceStore();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('founder@anavya.ai');
  const [password, setPassword] = useState('SecurePass123!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
      const res = await api.post(endpoint, { email, password });
      const { user, token } = res.data.data;
      setAuth(user, token);
    } catch (err: any) {
      if (
        mode === 'register' &&
        err?.response?.data?.error?.code === 'EMAIL_ALREADY_EXISTS'
      ) {
        try {
          const loginRes = await api.post('/auth/login', { email, password });
          const { user, token } = loginRes.data.data;
          setAuth(user, token);
          return;
        } catch (loginErr: any) {
          setError(
            loginErr?.response?.data?.error?.message || 'Authentication failed'
          );
        }
      } else {
        setError(
          err?.response?.data?.error?.message || 'Authentication failed'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#171717] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#202020] border border-[#2E2E2E] rounded-3xl p-8 shadow-2xl space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <AnavyaLogo className="w-12 h-12" />
          <h1 className="text-2xl font-semibold text-[#F5F5F5] mt-2 tracking-tight">
            Anavya
          </h1>
          <p className="text-xs text-[#A0A0A0]">
            Your AI workspace. Your agents. Your work, done.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 bg-[#171717] rounded-xl">
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`py-2 rounded-lg text-xs font-medium transition ${
              mode === 'register'
                ? 'bg-[#2A2A2A] text-[#F5F5F5]'
                : 'text-[#A0A0A0]'
            }`}
          >
            Create Workspace
          </button>
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`py-2 rounded-lg text-xs font-medium transition ${
              mode === 'login'
                ? 'bg-[#2A2A2A] text-[#F5F5F5]'
                : 'text-[#A0A0A0]'
            }`}
          >
            Sign In
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-[#2A1C1C] border border-[#EF6464]/40 text-xs text-[#EF6464]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-[#A0A0A0] block mb-1">
              Workspace Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[#171717] border border-[#343434] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#E9A23B]"
            />
          </div>

          <div>
            <label className="text-xs text-[#A0A0A0] block mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-[#171717] border border-[#343434] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#E9A23B]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-[#E9A23B] hover:opacity-95 text-[#151515] font-semibold text-xs transition disabled:opacity-50"
          >
            {loading
              ? 'Initializing Anavya Workspace...'
              : mode === 'register'
              ? 'Launch Anavya Workspace'
              : 'Sign In to Anavya'}
          </button>
        </form>
      </div>
    </div>
  );
};

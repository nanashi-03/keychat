import React, { useState } from 'react';
import { useAuth } from '../core/useAuth';
import { useNavigate } from 'react-router-dom';

export const Auth: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (isLogin) {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData
        });

        if (!res.ok) throw new Error('Invalid credentials');
        const data = await res.json();

        login(data.token.access_token, data.user);
        navigate('/chat');
      } else {
        const res = await fetch('/api/v1/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password })
        });

        if (!res.ok) throw new Error('Registration failed');
        setIsLogin(true);
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'An unexpected error occurred');
    }
  };

  return (
    <div className="auth-wrapper">
      <form onSubmit={handleSubmit} className="auth-card">
        <h2>KeyChat {isLogin ? 'Login' : 'Register'}</h2>
        {error && <div className="error-banner">{error}</div>}

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        {!isLogin && (
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        )}

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button type="submit">{isLogin ? 'Sign In' : 'Create Account'}</button>

        <p onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? "Need an account? Register" : "Already registered? Login"}
        </p>
      </form>
    </div>
  );
};

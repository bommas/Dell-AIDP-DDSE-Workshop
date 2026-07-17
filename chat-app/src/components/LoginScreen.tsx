import { useState, type FormEvent } from "react";

const DEMO_USER = "admin";
const DEMO_PASS = "admin";

type Props = {
  onSuccess: () => void;
};

export function LoginScreen({ onSuccess }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (username.trim() === DEMO_USER && password === DEMO_PASS) {
      setError(null);
      onSuccess();
      return;
    }
    setError("Invalid username or password.");
  }

  return (
    <div className="login-shell">
      <div className="ambient" aria-hidden="true" />
      <form className="login-panel" onSubmit={handleSubmit}>
        <p className="brand">Elastic A2A Chat</p>
        <h1>Sign in</h1>
        <p className="login-lead">Demo access for the workshop chat.</p>

        <label className="field">
          <span>Username</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="admin"
          />
        </label>

        {error && <p className="banner err">{error}</p>}

        <button type="submit" className="btn primary login-submit">
          Sign in
        </button>
      </form>
    </div>
  );
}

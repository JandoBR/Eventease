// src/pages/AuthLogin.jsx
import { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { isAuthed, setAuth } from "../authStorage";
import bgImage from "../assets/photo-1464618663641-bbdd760ae84a.jpg";

const API_BASE = "/api";

export default function AuthLogin() {
    const navigate = useNavigate();
    const location = useLocation();
    const redirectQ = new URLSearchParams(window.location.search).get("redirect");
    const back = location.state?.from?.pathname || redirectQ || "/";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    async function handleLogin(e) {
        e.preventDefault();
        setError("");

        if (!email.trim() || !password.trim()) {
            setError("Por favor completa todos los campos.");
            return;
        }

        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            setError("El correo no tiene un formato válido.");
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include", 
                body: JSON.stringify({ email, password }),
            });

            if (!res.ok) {
                let msg = "Error al iniciar sesión.";
                try {
                    const data = await res.json();
                    if (data?.detail) msg = data.detail;
                } catch {
                }
                setError(msg);
                return;
            }

            const user = await res.json();
            console.log("Usuario autenticado:", user);

            setAuth("session");

            navigate(back, { replace: true });
        } catch (err) {
            console.error(err);
            setError("No se pudo conectar con el servidor.");
        }
    }

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backgroundImage: `url(${bgImage})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundAttachment: "fixed",
                padding: 24,
            }}
        >
            <div
                className="container"
                style={{
                    maxWidth: 420,
                    width: "100%",
                    background: "white",
                    padding: 24,
                    borderRadius: 20,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
                }}
            >
                <h1 style={{ marginBottom: 12 }}>Iniciar sesión</h1>

                <form onSubmit={handleLogin} className="stack">
                    <label>
                        Correo electrónico
                        <input
                            type="email"
                            placeholder="tucorreo@ejemplo.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                        />
                    </label>

                    <label>
                        Contraseña
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </label>

                    {error && (
                        <div
                            className="card"
                            style={{
                                background: "#fef2f2",
                                color: "#7f1d1d",
                                border: "1px solid #fecaca",
                                borderRadius: 12,
                                padding: "8px 12px",
                            }}
                        >
                            {error}
                        </div>
                    )}

                    <button className="btn" type="submit" style={{ marginTop: 8 }}>
                        Entrar
                    </button>
                </form>

                <p style={{ marginTop: 16, textAlign: "center" }}>
                    ¿No tienes cuenta?{" "}
                    <Link to="/auth/register" className="link">
                        Crear cuenta
                    </Link>
                </p>
            </div>
        </div>
    );

}

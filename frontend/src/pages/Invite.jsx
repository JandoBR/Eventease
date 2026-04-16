import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
const API_BASE = "/api";



function parseToken() {
    const path = window.location.pathname || "";
    const m = path.match(/^\/invite\/([A-Za-z0-9_-]+)\/?$/i);
    if (m) return m[1];
    const h = window.location.hash || "";
    const mh = h.match(/#\/?invite\/([A-Za-z0-9_-]+)\/?$/i);
    if (mh) return mh[1];
    return null;
}

async function acceptInviteOnServer(token) {
    const res = await fetch(`${API_BASE}/invite-links/${token}/accept`, {
        method: "POST",
        credentials: "include",  
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Error acceptInviteOnServer:", res.status, text);
        throw new Error(`Error ${res.status} aceptando invitación`);
    }

    return await res.json();
}


function isAuthed() {
    return Boolean(localStorage.getItem("ee_auth"));
}

export default function Invite() {
    const token = useMemo(parseToken, []);
    const processedRef = useRef(false);
    const navigate = useNavigate();

    useEffect(() => {
        let timeoutId;

        async function processInvite() {
            if (!token) {
                navigate(isAuthed() ? "/" : "/auth/login", { replace: true });
                return;
            }
            if (processedRef.current) return; 
            processedRef.current = true;

            timeoutId = setTimeout(() => {
                navigate(isAuthed() ? "/" : "/auth/login", { replace: true });
            }, 4000);

            try {
                const inv = await acceptInviteOnServer(token);
                sessionStorage.setItem("ee_incoming_invite", JSON.stringify({ invite: inv }));
            } catch (e) {
                console.error(e);
            } finally {
                clearTimeout(timeoutId);
                window.history.replaceState({}, "", "/");
                navigate(isAuthed() ? "/" : "/auth/login", { replace: true });
            }
        }

        processInvite();
        return () => clearTimeout(timeoutId);
    }, [token, navigate]);

    return (
        <div className="container" style={{ maxWidth: 720, marginTop: 32 }}>
            <h1>Procesando invitación...</h1>
            <p>Por favor espera un momento.</p>
        </div>
    );
}

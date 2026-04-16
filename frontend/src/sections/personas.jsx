// ../sections/People.jsx
import { useState, useEffect } from "react";

export default function People({ apiBase, showToast, isActive }) {
    const [searchEmail, setSearchEmail] = useState("");
    const [searchResult, setSearchResult] = useState(null);
    const [searching, setSearching] = useState(false);
    const [sendingRequest, setSendingRequest] = useState(false);

    const [incoming, setIncoming] = useState([]);
    const [loadingIncoming, setLoadingIncoming] = useState(true);
    const [processingReqId, setProcessingReqId] = useState(null);

    const [contacts, setContacts] = useState([]);
    const [loadingContacts, setLoadingContacts] = useState(true);
    const [removingContactId, setRemovingContactId] = useState(null);

    // =========================================================
    //                  BÚSQUEDA POR EMAIL
    // =========================================================
    async function handleSearchUser(e) {
        e?.preventDefault?.();
        if (!searchEmail.trim()) {
            showToast("Escribe un correo para buscar");
            return;
        }

        setSearching(true);
        setSearchResult(null);
        try {
            const res = await fetch(
                `${apiBase}/users/search?email=${encodeURIComponent(
                    searchEmail.trim()
                )}`,
                {
                    credentials: "include",
                }
            );

            if (res.status === 401) {
                localStorage.removeItem("ee_auth");
                window.location.href = `/auth/login?redirect=${encodeURIComponent(
                    window.location.pathname
                )}`;
                return;
            }

            if (res.status === 404) {
                showToast("No se encontró ningún usuario con ese correo");
                setSearchResult(null);
                return;
            }

            if (!res.ok) {
                const text = await res.text();
                console.error("user search error body:", text);
                showToast("Error al buscar usuario");
                return;
            }

            const user = await res.json(); // { id, name, email }
            setSearchResult(user);
        } catch (err) {
            console.error("handleSearchUser error:", err);
            showToast("Error al buscar usuario");
        } finally {
            setSearching(false);
        }
    }

    async function handleSendFriendRequest() {
        if (!searchResult?.id) return;
        setSendingRequest(true);
        try {
            const res = await fetch(`${apiBase}/friend-requests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ target_user_id: searchResult.id }),
            });

            if (res.status === 401) {
                localStorage.removeItem("ee_auth");
                window.location.href = `/auth/login?redirect=${encodeURIComponent(
                    window.location.pathname
                )}`;
                return;
            }

            if (!res.ok) {
                const text = await res.text();
                console.error("friend request error body:", text);
                showToast("No se pudo enviar la solicitud");
                return;
            }

            showToast("Solicitud de amistad enviada");
        } catch (err) {
            console.error("handleSendFriendRequest error:", err);
            showToast("Error al enviar la solicitud");
        } finally {
            setSendingRequest(false);
        }
    }

    // =========================================================
    //           SOLICITUDES RECIBIDAS & CONTACTOS
    // =========================================================

    async function fetchIncoming({ showSpinner = false } = {}) {
        if (showSpinner) setLoadingIncoming(true);
        try {
            const res = await fetch(`${apiBase}/friend-requests/received`, {
                credentials: "include",
            });

            if (res.status === 401) {
                localStorage.removeItem("ee_auth");
                window.location.href = `/auth/login?redirect=${encodeURIComponent(
                    window.location.pathname
                )}`;
                return;
            }

            if (!res.ok) {
                const text = await res.text();
                console.error("incoming requests error body:", text);
                showToast("Error al cargar solicitudes");
                return;
            }

            const data = await res.json(); // [{ id, from_user, status }]
            setIncoming(data || []);
        } catch (err) {
            console.error("fetchIncoming error:", err);
            showToast("Error al cargar solicitudes");
        } finally {
            if (showSpinner) setLoadingIncoming(false);
        }
    }

    async function fetchContacts({ showSpinner = false } = {}) {
        if (showSpinner) setLoadingContacts(true);
        try {
            const res = await fetch(`${apiBase}/contacts`, {
                credentials: "include",
            });

            if (res.status === 401) {
                localStorage.removeItem("ee_auth");
                window.location.href = `/auth/login?redirect=${encodeURIComponent(
                    window.location.pathname
                )}`;
                return;
            }

            if (!res.ok) {
                const text = await res.text();
                console.error("contacts error body:", text);
                showToast("Error al cargar contactos");
                return;
            }

            const data = await res.json(); // [{ id, status, friend }]
            setContacts(data || []);
        } catch (err) {
            console.error("fetchContacts error:", err);
            showToast("Error al cargar contactos");
        } finally {
            if (showSpinner) setLoadingContacts(false);
        }
    }

    useEffect(() => {
        if (!isActive) return;

        const isInitialLoad =
            incoming.length === 0 && contacts.length === 0;

        fetchIncoming({ showSpinner: isInitialLoad });
        fetchContacts({ showSpinner: isInitialLoad });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive]);

    async function handleRespond(requestId, action) {
        // action: "accept" | "reject"
        setProcessingReqId(requestId);
        try {
            const res = await fetch(
                `${apiBase}/friend-requests/${requestId}/${action}`,
                {
                    method: "POST",
                    credentials: "include",
                }
            );

            if (res.status === 401) {
                localStorage.removeItem("ee_auth");
                window.location.href = `/auth/login?redirect=${encodeURIComponent(
                    window.location.pathname
                )}`;
                return;
            }

            if (!res.ok) {
                const text = await res.text();
                console.error(`friend request ${action} error body:`, text);
                showToast("Error al procesar la solicitud");
                return;
            }

            // Quitar de la lista local
            setIncoming(prev => prev.filter(r => r.id !== requestId));

            // Si se aceptó, refrescamos contactos (sin spinner grande)
            if (action === "accept") {
                fetchContacts();
            }

            showToast(
                action === "accept"
                    ? "Solicitud aceptada"
                    : "Solicitud rechazada"
            );
        } catch (err) {
            console.error(`handleRespond(${action}) error:`, err);
            showToast("Error al procesar la solicitud");
        } finally {
            setProcessingReqId(null);
        }
    }

    async function handleRemoveContact(friendId) {
        setRemovingContactId(friendId);
        try {
            const res = await fetch(`${apiBase}/contacts/${friendId}`, {
                method: "DELETE",
                credentials: "include",
            });

            if (res.status === 401) {
                localStorage.removeItem("ee_auth");
                window.location.href = `/auth/login?redirect=${encodeURIComponent(
                    window.location.pathname
                )}`;
                return;
            }

            if (!res.ok) {
                const text = await res.text();
                console.error("remove contact error body:", text);
                showToast("No se pudo eliminar el contacto");
                return;
            }

            setContacts(prev =>
                prev.filter(c => c.friend?.id !== friendId)
            );
            showToast("Contacto eliminado");
        } catch (err) {
            console.error("handleRemoveContact error:", err);
            showToast("Error al eliminar contacto");
        } finally {
            setRemovingContactId(null);
        }
    }

    // =========================================================
    //                          UI
    // =========================================================

    return (
        <div
            style={{
                width: "100%",
                margin: "0 auto",
                display: "grid",
                gap: 16,
                gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
                alignItems: "flex-start",
            }}
        >
            {/* Columna izquierda: búsqueda + contactos */}
            <div className="stack" style={{ gap: 16 }}>
                {/* BUSCADOR */}
                <div className="card">
                    <h2>Buscar personas</h2>
                    <form
                        onSubmit={handleSearchUser}
                        className="stack"
                        style={{ marginTop: 8 }}
                    >
                        <label>
                            Correo electrónico
                            <input
                                type="email"
                                placeholder="usuario@ejemplo.com"
                                value={searchEmail}
                                onChange={e =>
                                    setSearchEmail(e.target.value)
                                }
                            />
                        </label>
                        <button
                            className="btn"
                            type="submit"
                            disabled={searching}
                        >
                            {searching ? "Buscando..." : "Buscar"}
                        </button>
                    </form>

                    {searchResult && (
                        <div
                            className="card"
                            style={{ marginTop: 16, background: "#f9fafb" }}
                        >
                            <h3
                                style={{
                                    marginTop: 0,
                                    wordBreak: "break-word",
                                }}
                            >
                                {searchResult.name || "Sin nombre"}
                            </h3>
                            <p
                                className="muted"
                                style={{ wordBreak: "break-word" }}
                            >
                                {searchResult.email}
                            </p>
                            <button
                                className="btn btn--outline"
                                onClick={handleSendFriendRequest}
                                disabled={sendingRequest}
                                style={{ marginTop: 8 }}
                            >
                                {sendingRequest
                                    ? "Enviando..."
                                    : "Enviar solicitud de amistad"}
                            </button>
                        </div>
                    )}
                </div>

                {/* CONTACTOS */}
                <div className="card">
                    <h2>Tus contactos</h2>

                    {loadingContacts ? (
                        <p className="muted">Cargando contactos...</p>
                    ) : contacts.length === 0 ? (
                        <p className="muted">
                            Aún no tienes contactos. Acepta solicitudes o busca
                            personas para agregar.
                        </p>
                    ) : (
                        <div className="stack" style={{ marginTop: 8 }}>
                            {contacts.map(c => (
                                <div
                                    key={c.id}
                                    className="card"
                                    style={{ background: "#f9fafb" }}
                                >
                                    <h3
                                        style={{
                                            marginTop: 0,
                                            wordBreak: "break-word",
                                        }}
                                    >
                                        {c.friend?.name || "Sin nombre"}
                                    </h3>
                                    <p
                                        className="muted"
                                        style={{
                                            wordBreak: "break-word",
                                            marginBottom: 4,
                                        }}
                                    >
                                        {c.friend?.email}
                                    </p>
                                    <p className="muted" style={{ fontSize: 12 }}>
                                        Estado: {c.status}
                                    </p>
                                    <button
                                        className="btn btn--outline"
                                        onClick={() =>
                                            handleRemoveContact(c.friend?.id)
                                        }
                                        disabled={
                                            removingContactId === c.friend?.id
                                        }
                                        style={{ marginTop: 8 }}
                                    >
                                        {removingContactId === c.friend?.id
                                            ? "Eliminando..."
                                            : "Eliminar contacto"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Columna derecha: solicitudes recibidas */}
            <div className="card">
                <h2>Solicitudes recibidas</h2>

                {loadingIncoming ? (
                    <p className="muted">Cargando solicitudes...</p>
                ) : incoming.length === 0 ? (
                    <p className="muted">No tienes solicitudes pendientes.</p>
                ) : (
                    <div className="stack" style={{ marginTop: 8 }}>
                        {incoming.map(req => (
                            <div
                                key={req.id}
                                className="card"
                                style={{ background: "#f9fafb" }}
                            >
                                <h3
                                    style={{
                                        marginTop: 0,
                                        wordBreak: "break-word",
                                    }}
                                >
                                    {req.from_user?.name || "Sin nombre"}
                                </h3>
                                <p
                                    className="muted"
                                    style={{ wordBreak: "break-word" }}
                                >
                                    {req.from_user?.email}
                                </p>
                                <div
                                    className="stack stack--horizontal"
                                    style={{ marginTop: 8, gap: 8 }}
                                >
                                    <button
                                        className="btn"
                                        onClick={() =>
                                            handleRespond(req.id, "accept")
                                        }
                                        disabled={
                                            processingReqId === req.id
                                        }
                                    >
                                        {processingReqId === req.id
                                            ? "Procesando..."
                                            : "Aceptar"}
                                    </button>
                                    <button
                                        className="btn btn--outline"
                                        onClick={() =>
                                            handleRespond(req.id, "reject")
                                        }
                                        disabled={
                                            processingReqId === req.id
                                        }
                                    >
                                        Rechazar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

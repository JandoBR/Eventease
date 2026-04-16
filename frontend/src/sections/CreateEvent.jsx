import { useEffect, useRef, useState } from "react";

export default function CreateEvent({ apiBase, showToast, onEventCreated }) {
    const [title, setTitle] = useState("");
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [endTime, setEndTime] = useState("");
    const [location, setLocation] = useState("");
    const [description, setDescription] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const titleRef = useRef(null);

    // --- datos base para quick invite (NO se muestran por defecto) ---
    const [contacts, setContacts] = useState([]);
    const [loadingContacts, setLoadingContacts] = useState(true);

    const [teams, setTeams] = useState([]);
    const [loadingTeams, setLoadingTeams] = useState(true);

    // --- búsqueda de contactos/equipos ---
    const [contactQuery, setContactQuery] = useState("");
    const [teamQuery, setTeamQuery] = useState("");

    // seleccionados
    const [selectedContacts, setSelectedContacts] = useState([]); // [{id, name, email}]
    const [selectedTeams, setSelectedTeams] = useState([]);       // [{id, name}]

    // =========================================================
    //           Cargar contactos y equipos del usuario
    // =========================================================
    useEffect(() => {
        async function loadContacts() {
            setLoadingContacts(true);
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
                    setContacts([]);
                    return;
                }

                const data = await res.json(); // [{ id, status, friend }]
                const mapped = (data || [])
                    .filter(c => c.friend)
                    .map(c => c.friend);
                setContacts(mapped);
            } catch (err) {
                console.error("loadContacts error:", err);
                showToast("Error al cargar contactos");
                setContacts([]);
            } finally {
                setLoadingContacts(false);
            }
        }

        async function loadTeams() {
            setLoadingTeams(true);
            try {
                const [ownedRes, mineRes] = await Promise.all([
                    fetch(`${apiBase}/teams/owned`, {
                        credentials: "include",
                    }),
                    fetch(`${apiBase}/teams/mine`, {
                        credentials: "include",
                    }),
                ]);

                if (ownedRes.status === 401 || mineRes.status === 401) {
                    localStorage.removeItem("ee_auth");
                    window.location.href = `/auth/login?redirect=${encodeURIComponent(
                        window.location.pathname
                    )}`;
                    return;
                }

                if (!ownedRes.ok || !mineRes.ok) {
                    const t1 = await ownedRes.text();
                    const t2 = await mineRes.text();
                    console.error("teams owned error body:", t1);
                    console.error("teams mine error body:", t2);
                    showToast("Error al cargar equipos");
                    setTeams([]);
                    return;
                }

                const [owned, mine] = await Promise.all([
                    ownedRes.json(),
                    mineRes.json(),
                ]);

                // Mezclar y quitar duplicados por id
                const all = [...(owned || []), ...(mine || [])];
                const dedup = [];
                const seen = new Set();
                for (const t of all) {
                    if (!seen.has(t.id)) {
                        seen.add(t.id);
                        dedup.push(t);
                    }
                }
                setTeams(dedup);
            } catch (err) {
                console.error("loadTeams error:", err);
                showToast("Error al cargar equipos");
                setTeams([]);
            } finally {
                setLoadingTeams(false);
            }
        }

        loadContacts();
        loadTeams();
    }, []);

    // =========================================================
    //                   Helpers de selección
    // =========================================================
    function addContact(contact) {
        setSelectedContacts(prev => {
            if (prev.some(c => c.id === contact.id)) return prev;
            return [...prev, contact];
        });
        setContactQuery("");
    }

    function removeContact(id) {
        setSelectedContacts(prev => prev.filter(c => c.id !== id));
    }

    function addTeam(team) {
        setSelectedTeams(prev => {
            if (prev.some(t => t.id === team.id)) return prev;
            return [...prev, team];
        });
        setTeamQuery("");
    }

    function removeTeam(id) {
        setSelectedTeams(prev => prev.filter(t => t.id !== id));
    }

    // ---- CONTACTOS: búsqueda con debounce ----
    const [liveContacts, setLiveContacts] = useState(null);

    useEffect(() => {
        const q = contactQuery.trim();

        if (q.length < 2) {
            setLiveContacts(null);
            return;
        }

        const controller = new AbortController();
        const handle = setTimeout(async () => {
            try {
                const res = await fetch(
                    `${apiBase}/contacts/search?q=${encodeURIComponent(q)}`,
                    { credentials: "include", signal: controller.signal }
                );

                if (res.status === 401) {
                    localStorage.removeItem("ee_auth");
                    window.location.href = `/auth/login?redirect=${encodeURIComponent(
                        window.location.pathname
                    )}`;
                    return;
                }

                if (!res.ok) {
                    const txt = await res.text();
                    console.error("contacts/search error body:", txt);
                    return;
                }

                const data = await res.json();
                setLiveContacts(data || []);
            } catch (err) {
                if (err.name !== "AbortError") {
                    console.error("contacts/search error:", err);
                }
            }
        }, 300); // debounce 300ms

        return () => {
            clearTimeout(handle);
            controller.abort();
        };
    }, [contactQuery, apiBase]);

    const contactSuggestions =
        contactQuery.trim().length === 0
            ? []
            : liveContacts && liveContacts.length > 0
                ? liveContacts
                : contacts.filter(c => {
                    const q = contactQuery.toLowerCase();
                    return (
                        (c.name || "").toLowerCase().includes(q) ||
                        (c.email || "").toLowerCase().includes(q)
                    );
                });


    // ---- TEAMS: búsqueda con debounce ----
    const [liveTeams, setLiveTeams] = useState(null);

    useEffect(() => {
        const q = teamQuery.trim();

        if (q.length < 2) {
            setLiveTeams(null);
            return;
        }

        const controller = new AbortController();
        const handle = setTimeout(async () => {
            try {
                const res = await fetch(
                    `${apiBase}/teams/search?q=${encodeURIComponent(q)}`,
                    { credentials: "include", signal: controller.signal }
                );

                if (res.status === 401) {
                    localStorage.removeItem("ee_auth");
                    window.location.href = `/auth/login?redirect=${encodeURIComponent(
                        window.location.pathname
                    )}`;
                    return;
                }

                if (!res.ok) {
                    const txt = await res.text();
                    console.error("teams/search error body:", txt);
                    return;
                }

                const data = await res.json();
                setLiveTeams(data || []);
            } catch (err) {
                if (err.name !== "AbortError") {
                    console.error("teams/search error:", err);
                }
            }
        }, 300); // debounce 300ms

        return () => {
            clearTimeout(handle);
            controller.abort();
        };
    }, [teamQuery, apiBase]);

    const teamSuggestions =
        teamQuery.trim().length === 0
            ? []
            : liveTeams && liveTeams.length > 0
                ? liveTeams
                : teams.filter(t =>
                    (t.name || "")
                        .toLowerCase()
                        .includes(teamQuery.toLowerCase())
                );

    // =========================================================
    //                          SUBMIT
    // =========================================================
    async function submit() {
        if (submitting) return;
        if (!title.trim() || !date || !time || !endTime) {
            showToast("Título, fecha, hora de inicio y hora de fin son obligatorios");
            return;
        }

        const payload = {
            title: title.trim(),
            date,                        // "YYYY-MM-DD"
            time,                        // "HH:MM" (requerida)
            endtime: endTime,
            location: location.trim() || null,
            description: description.trim() || null,

            contact_ids: selectedContacts.map(c => c.id),
            team_ids: selectedTeams.map(t => t.id),
        };



        setSubmitting(true);
        try {
            // 1) Crear evento
            const res = await fetch(`${apiBase}/events`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
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
                console.error("create event error body:", text);
                showToast("No se pudo crear el evento");
                return;
            }

            const created = await res.json(); // EventOut con invitees ya incluidos

            showToast("Evento creado");

            // Avisar al padre (AppHome) para que lo añada a la lista
            onEventCreated?.(created);

            // limpiar formulario
            setTitle("");
            setDate("");
            setTime("");
            setEndTime("");
            setLocation("");
            setDescription("");
            setSelectedContacts([]);
            setSelectedTeams([]);
            setContactQuery("");
            setTeamQuery("");

            requestAnimationFrame(() => titleRef.current?.focus());

        } catch (err) {
            console.error("submit event error:", err);
            showToast("Error al crear el evento");
        } finally {
            setSubmitting(false);
        }
    }

    function clear() {
        setTitle("");
        setDate("");
        setTime("");
        setEndTime("");
        setLocation("");
        setDescription("");
        setSelectedContacts([]);
        setSelectedTeams([]);
        setContactQuery("");
        setTeamQuery("");
        titleRef.current?.focus();
    }

    // =========================================================
    //                          UI
    // =========================================================
    return (
        <div className="card">
            <h2>Crear evento</h2>

            <div
                className="grid-2"
                style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)",
                    columnGap: 16,
                    rowGap: 12,
                }}
            >
                {/* Fila 1 */}
                <label style={{ gridColumn: "1 / 2" }}>
                    Título{" "}
                    <input
                        ref={titleRef}
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="Ej. Taller de React"
                    />
                </label>

                <label style={{ gridColumn: "2 / 3" }}>
                    Fecha{" "}
                    <input
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                    />
                </label>

                <label style={{ gridColumn: "3 / 4" }}>
                    Hora de inicio{" "}
                    <input
                        type="time"
                        value={time}
                        onChange={e => setTime(e.target.value)}
                    />
                </label>

                {/* Fila 2 */}
                <label style={{ gridColumn: "1 / 3" }}>
                    Lugar{" "}
                    <input
                        value={location}
                        onChange={e => setLocation(e.target.value)}
                        placeholder="Auditorio A"
                    />
                </label>

                <label style={{ gridColumn: "3 / 4" }}>
                    Hora de fin{" "}
                    <input
                        type="time"
                        value={endTime}
                        onChange={e => setEndTime(e.target.value)}
                    />
                </label>

                {/* Fila 3 */}
                <label style={{ gridColumn: "1 / 4" }}>
                    Descripción{" "}
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Detalles, agenda, recordatorios..."
                    />
                </label>
            </div>


            {/* QUICK INVITE: CONTACTOS */}
            <div
                className="card"
                style={{
                    marginTop: 16,
                    background: "#f9fafb",
                }}
            >
                <h3 style={{ marginTop: 0 }}>Invitar contactos</h3>
                {loadingContacts ? (
                    <p className="muted">Cargando contactos...</p>
                ) : (
                    <>
                        <label>
                            Buscar contacto
                            <input
                                type="text"
                                value={contactQuery}
                                onChange={e =>
                                    setContactQuery(e.target.value)
                                }
                                placeholder="Escribe nombre o correo"
                            />
                        </label>

                        {contactQuery.trim() !== "" &&
                            contactSuggestions.length > 0 && (
                                <div
                                    className="card"
                                    style={{
                                        marginTop: 8,
                                        maxHeight: 200,
                                        overflowY: "auto",
                                        background: "#ffffff",
                                    }}
                                >
                                    {contactSuggestions.map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            className="btn btn--ghost"
                                            style={{
                                                width: "100%",
                                                justifyContent: "flex-start",
                                                textAlign: "left",
                                                marginBottom: 4,
                                            }}
                                            onClick={() => addContact(c)}
                                        >
                                            <div>
                                                <div
                                                    style={{
                                                        fontWeight: 500,
                                                        wordBreak: "break-word",
                                                    }}
                                                >
                                                    {c.name || "Sin nombre"}
                                                </div>
                                                <div
                                                    className="muted"
                                                    style={{
                                                        fontSize: 12,
                                                        wordBreak: "break-word",
                                                    }}
                                                >
                                                    {c.email}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                        {selectedContacts.length > 0 && (
                            <div
                                className="stack"
                                style={{ marginTop: 8, gap: 8 }}
                            >
                                <p className="muted" style={{ fontSize: 12 }}>
                                    Contactos invitados:
                                </p>
                                <div
                                    style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: 8,
                                    }}
                                >
                                    {selectedContacts.map(c => (
                                        <span
                                            key={c.id}
                                            className="badge"
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 4,
                                            }}
                                        >
                                            {c.name || c.email}
                                            <button
                                                type="button"
                                                className="btn btn--xs btn--outline"
                                                onClick={() =>
                                                    removeContact(c.id)
                                                }
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* QUICK INVITE: EQUIPOS */}
            <div
                className="card"
                style={{
                    marginTop: 16,
                    background: "#f9fafb",
                }}
            >
                <h3 style={{ marginTop: 0 }}>Invitar equipos</h3>
                {loadingTeams ? (
                    <p className="muted">Cargando equipos...</p>
                ) : (
                    <>
                        <label>
                            Buscar equipo
                            <input
                                type="text"
                                value={teamQuery}
                                onChange={e =>
                                    setTeamQuery(e.target.value)
                                }
                                placeholder="Escribe el nombre del equipo"
                            />
                        </label>

                        {teamQuery.trim() !== "" &&
                            teamSuggestions.length > 0 && (
                                <div
                                    className="card"
                                    style={{
                                        marginTop: 8,
                                        maxHeight: 200,
                                        overflowY: "auto",
                                        background: "#ffffff",
                                    }}
                                >
                                    {teamSuggestions.map(t => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            className="btn btn--ghost"
                                            style={{
                                                width: "100%",
                                                justifyContent: "flex-start",
                                                textAlign: "left",
                                                marginBottom: 4,
                                            }}
                                            onClick={() => addTeam(t)}
                                        >
                                            <div
                                                style={{
                                                    fontWeight: 500,
                                                    wordBreak: "break-word",
                                                }}
                                            >
                                                {t.name}
                                            </div>
                                            {t.description && (
                                                <div
                                                    className="muted"
                                                    style={{
                                                        fontSize: 12,
                                                        wordBreak: "break-word",
                                                    }}
                                                >
                                                    {t.description}
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}

                        {selectedTeams.length > 0 && (
                            <div
                                className="stack"
                                style={{ marginTop: 8, gap: 8 }}
                            >
                                <p className="muted" style={{ fontSize: 12 }}>
                                    Equipos invitados:
                                </p>
                                <div
                                    style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: 8,
                                    }}
                                >
                                    {selectedTeams.map(t => (
                                        <span
                                            key={t.id}
                                            className="badge"
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 4,
                                            }}
                                        >
                                            {t.name}
                                            <button
                                                type="button"
                                                className="btn btn--xs btn--outline"
                                                onClick={() =>
                                                    removeTeam(t.id)
                                                }
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="controls" style={{ marginTop: 16 }}>
                <button
                    className="btn"
                    onClick={submit}
                    disabled={submitting}
                >
                    {submitting ? "Creando..." : "Crear"}
                </button>
                <button
                    className="btn btn--outline"
                    onClick={clear}
                    disabled={submitting}
                >
                    Limpiar
                </button>
            </div>
        </div>
    );
}


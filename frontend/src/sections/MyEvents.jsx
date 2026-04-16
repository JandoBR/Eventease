import { useState, useMemo } from "react";

const pad = (n) => String(n).padStart(2, "0");

function normalizeDateToISO(date) {
    if (!date) return null;

    if (typeof date === "string") {
        const m = date.match(/^\d{4}-\d{2}-\d{2}/);
        if (m) return m[0];

        const d = new Date(date);
        if (!isNaN(d.getTime())) {
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        }
        return null;
    }

    if (date instanceof Date && !isNaN(date.getTime())) {
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    return null;
}

function normalizeTimeToHHMM(t, fallback = "00:00") {
    if (!t) return fallback;

    if (typeof t === "string") {
        const m = t.match(/^\d{2}:\d{2}/);
        if (m) return m[0];
        return fallback;
    }

    if (t instanceof Date && !isNaN(t.getTime())) {
        return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
    }

    return fallback;
}

function computeEnd(date, time, endtime) {
    const dateIso = normalizeDateToISO(date);
    if (!dateIso) {
        return { endDate: null, endTime: null };
    }

    const startStr = normalizeTimeToHHMM(time, "00:00");

    const start = new Date(`${dateIso}T${startStr}:00`);
    if (isNaN(start.getTime())) {
        return { endDate: null, endTime: null };
    }

    let end;
    if (endtime) {
        const endStr = normalizeTimeToHHMM(endtime, null);
        if (endStr) {
            end = new Date(`${dateIso}T${endStr}:00`);
            if (isNaN(end.getTime())) {
                end = new Date(start.getTime() + 60 * 60 * 1000);
            }
        } else {
            end = new Date(start.getTime() + 60 * 60 * 1000);
        }
    } else {
        end = new Date(start.getTime() + 60 * 60 * 1000);
    }

    if (isNaN(end.getTime())) {
        return { endDate: null, endTime: null };
    }

    const endDateIso = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
    const endTimeStr = `${pad(end.getHours())}:${pad(end.getMinutes())}`;

    return { endDate: endDateIso, endTime: endTimeStr };
}

function isPast(date, time, endtime) {
    try {
        const { endDate, endTime } = computeEnd(date, time, endtime);
        if (!endDate || !endTime) return false;
        const d = new Date(`${endDate}T${endTime}:00`);
        if (isNaN(d.getTime())) return false;
        return d.getTime() < Date.now();
    } catch {
        return false;
    }
}

function formatDate(iso) {
    if (!iso) return "";
    const dateIso = normalizeDateToISO(iso);
    if (!dateIso) return String(iso);
    try {
        return new Date(dateIso + "T00:00:00").toLocaleDateString("es-ES");
    } catch {
        return dateIso;
    }
}

/* ----------------- UI ----------------- */

function SectionTitle({ children }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 8px 0" }}>
            <span aria-hidden="true" style={{ width: 6, height: 18, borderRadius: 6, background: "#111", opacity: 0.9 }} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{children}</h3>
        </div>
    );
}

function ConfirmModal({ open, onClose, onConfirm, title, message }) {
    if (!open) return null;
    return (
        <div style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 3000,
        }}>
            <div
                className="card"
                style={{
                    maxWidth: 360,
                    padding: 24,
                    textAlign: "center",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                    animation: "fadeIn .2s ease-out",
                    wordBreak: "break-word",
                }}
            >
                <h3 style={{ marginTop: 0 }}>{title}</h3>
                <p style={{ marginBottom: 24, opacity: 0.85 }}>{message}</p>
                <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
                    <button className="btn btn--outline" onClick={onClose}>Cancelar</button>
                    <button className="btn" style={{ background: "#dc2626", borderColor: "#dc2626" }} onClick={onConfirm}>
                        Eliminar
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function MyEvents({
    apiBase,
    events = [],
    onDelete,
    onCopyLink,
    showToast,
}) {
    const [open, setOpen] = useState(() => new Set());
    const [showPast, setShowPast] = useState(false);
    const [confirmData, setConfirmData] = useState(null);

    const toggle = (id) => {
        setOpen(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const { upcoming, past } = useMemo(() => {
        const up = [], pa = [];
        for (const ev of events) {
            (isPast(ev.date, ev.time, ev.endtime) ? pa : up).push(ev);
        }
        return { upcoming: up, past: pa };
    }, [events]);

    async function handleDeleteEvent(eventId) {
        if (!apiBase) {
            console.warn("MyEvents: apiBase no definido, no puedo llamar al backend");
            return;
        }
        try {
            const res = await fetch(`${apiBase}/events/${eventId}`, {
                method: "DELETE",
                credentials: "include",
            });

            if (!res.ok) {
                throw new Error(`Error ${res.status}`);
            }

            showToast?.("Evento eliminado correctamente", "success");
            onDelete?.(eventId);
        } catch (err) {
            console.error("Error al eliminar evento:", err);
            showToast?.("No se pudo eliminar el evento", "error");
        }
    }

    function renderEventCard(ev, expanded) {
        const invitees = Array.isArray(ev.invitees) ? ev.invitees : [];

        const startDateIso = normalizeDateToISO(ev.date);
        const startTimeStr = ev.time ? normalizeTimeToHHMM(ev.time, null) : null;
        const { endDate, endTime } = computeEnd(ev.date, ev.time, ev.endtime);
        const sameDay = endDate && startDateIso && endDate === startDateIso;

        const dateLine = (() => {
            if (!startDateIso) return "Fecha inválida";

            if (sameDay) {
                // Ej: 20/10/2025 · 09:30–10:30
                const range = startTimeStr
                    ? ` · ${startTimeStr}${endTime ? `–${endTime}` : ""}`
                    : "";
                return `${formatDate(startDateIso)}${range}`;
            }

            const left = `${formatDate(startDateIso)}${startTimeStr ? ` · ${startTimeStr}` : ""}`;
            const right = endDate ? `${formatDate(endDate)}${endTime ? ` · ${endTime}` : ""}` : "";
            return right ? `${left} → ${right}` : left;
        })();

        return (
            <article
                key={ev.id}
                className="card"
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    overflow: "hidden",
                }}
            >
                <header
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                    }}
                >
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h3
                            style={{
                                margin: 0,
                                whiteSpace: expanded ? "normal" : "nowrap",
                                overflow: "hidden",
                                textOverflow: expanded ? "clip" : "ellipsis",
                                wordBreak: "break-word",
                                maxWidth: expanded ? "100%" : "92%",
                            }}
                            title={!expanded ? ev.title : undefined}
                        >
                            {ev.title}
                        </h3>
                        <p
                            style={{
                                margin: "4px 0",
                                whiteSpace: expanded ? "normal" : "nowrap",
                                overflow: "hidden",
                                textOverflow: expanded ? "clip" : "ellipsis",
                                maxWidth: expanded ? "100%" : "92%",
                            }}
                            title={!expanded ? `${dateLine} ${ev.location || ""}` : undefined}
                        >
                            {dateLine} — {ev.location || "Sin lugar"}
                        </p>
                    </div>
                    <button
                        className="btn btn--outline"
                        onClick={() => toggle(ev.id)}
                        aria-expanded={expanded}
                        aria-controls={`ev-${ev.id}-details`}
                        title={expanded ? "Ocultar detalles" : "Ver detalles"}
                    >
                        {expanded ? "Ocultar" : "Detalles"}
                    </button>
                </header>

                {ev.description && (
                    <p
                        className="muted"
                        style={{
                            marginTop: 0,
                            whiteSpace: expanded ? "normal" : "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: expanded ? "100%" : "92%",
                        }}
                        title={!expanded ? ev.description : undefined}
                    >
                        {ev.description}
                    </p>
                )}

                <div className="controls" style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                        className="btn btn--outline"
                        onClick={() => setConfirmData({ id: ev.id, title: ev.title })}
                        aria-label="Eliminar evento"
                        title="Eliminar evento"
                    >
                        🗑️ Eliminar
                    </button>

                    <button
                        className="btn btn--outline"
                        onClick={() => onCopyLink?.(ev.id)}
                        aria-label="Copiar enlace de invitación"
                        title="Copiar enlace de invitación"
                    >
                        🔗
                    </button>
                </div>

                {expanded && (
                    <section
                        id={`ev-${ev.id}-details`}
                        className="card"
                        style={{ background: "#fafafa", overflowWrap: "anywhere" }}
                    >
                        <h4 style={{ margin: "0 0 8px 0" }}>Invitados</h4>
                        {invitees.length === 0 ? (
                            <p className="muted" style={{ margin: 0 }}>Sin invitados aún.</p>
                        ) : (
                            <ul style={{
                                listStyle: "none",
                                padding: 0,
                                margin: 0,
                                display: "grid",
                                gap: 6,
                            }}>
                                {invitees.map((p, idx) => {
                                    const r = ["confirmed", "rejected", "pending", "accepted"].includes(p?.rsvp)
                                        ? p.rsvp
                                        : "pending";

                                    const normalized = r === "accepted" ? "confirmed" : r;
                                    const icon = normalized === "confirmed"
                                        ? "✅"
                                        : normalized === "rejected"
                                            ? "❌"
                                            : "⏳";
                                    const label = normalized === "confirmed"
                                        ? "Confirmado"
                                        : normalized === "rejected"
                                            ? "Rechazado"
                                            : "Pendiente";

                                    return (
                                        <li
                                            key={`${ev.id}-g-${idx}`}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                flexWrap: "wrap",
                                                wordBreak: "break-word",
                                            }}
                                        >
                                            <span>{icon}</span>
                                            <span style={{ overflowWrap: "anywhere" }}>
                                                <strong>{p.name || p.email}</strong>
                                                {p.email && p.name ? <span className="muted"> · {p.email}</span> : null}
                                                <span className="muted"> · {label}</span>
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                )}
            </article>
        );
    }

    return (
        <>
            <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <h2 style={{ margin: 0 }}>Mis eventos</h2>
                    <button
                        className="btn btn--outline"
                        onClick={() => setShowPast(v => !v)}
                        disabled={past.length === 0}
                    >
                        {showPast ? "Ocultar pasados" : "Mostrar pasados"}
                    </button>
                </div>

                {events.length === 0 && <p className="muted">Aún no hay eventos.</p>}

                {upcoming.length > 0 && (
                    <>
                        <SectionTitle>Próximos</SectionTitle>
                        <div className="grid-2">
                            {upcoming.map(ev => renderEventCard(ev, open.has(ev.id)))}
                        </div>
                    </>
                )}

                {showPast && past.length > 0 && (
                    <>
                        <div style={{ borderTop: "1px solid #eee", marginTop: 12, paddingTop: 12 }}>
                            <SectionTitle>Pasados</SectionTitle>
                        </div>
                        <div className="grid-2" style={{ opacity: 0.95 }}>
                            {past.map(ev => renderEventCard(ev, open.has(ev.id)))}
                        </div>
                    </>
                )}
            </div>

            <ConfirmModal
                open={!!confirmData}
                title="¿Eliminar evento?"
                message={`¿Seguro que quieres eliminar “${confirmData?.title}”? Esta acción no se puede deshacer.`}
                onClose={() => setConfirmData(null)}
                onConfirm={async () => {
                    if (!confirmData) return;
                    await handleDeleteEvent(confirmData.id);
                    setConfirmData(null);
                }}
            />
        </>
    );
}

// ../sections/Teams.jsx
import { useEffect, useState } from "react";

function ConfirmModal({ open, onClose, onConfirm, title, message }) {
    if (!open) return null;
    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 3000,
            }}
        >
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
                <div
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: 12,
                        flexWrap: "wrap",
                    }}
                >
                    <button className="btn btn--outline" onClick={onClose}>
                        Cancelar
                    </button>
                    <button
                        className="btn"
                        style={{
                            background: "#dc2626",
                            borderColor: "#dc2626",
                        }}
                        onClick={onConfirm}
                    >
                        Eliminar
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function Teams({ apiBase, showToast, isActive }) {
    // Equipos
    const [ownedTeams, setOwnedTeams] = useState([]);
    const [otherTeams, setOtherTeams] = useState([]);
    const [loadingOwned, setLoadingOwned] = useState(true);
    const [loadingOthers, setLoadingOthers] = useState(true);

    // Miembros por equipo
    const [membersByTeam, setMembersByTeam] = useState({}); // { [teamId]: Member[] }
    const [loadingMembersFor, setLoadingMembersFor] = useState(null);
    const [expandedTeamId, setExpandedTeamId] = useState(null);

    // Crear equipo
    const [newName, setNewName] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [creating, setCreating] = useState(false);

    // Contactos (para selección rápida al crear e invitar)
    const [contacts, setContacts] = useState([]);
    const [loadingContacts, setLoadingContacts] = useState(true);
    const [selectedContactIds, setSelectedContactIds] = useState([]); // para creación
    const [createInviteSearch, setCreateInviteSearch] = useState(""); // 🔍 búsqueda en creación

    // Editar descripción de equipo (solo owner)
    const [editingTeamId, setEditingTeamId] = useState(null);
    const [editDescription, setEditDescription] = useState("");
    const [savingDescriptionId, setSavingDescriptionId] = useState(null);

    // Invitar / eliminar miembros existentes
    const [inviteTargetByTeam, setInviteTargetByTeam] = useState({}); // { [teamId]: userId }
    const [invitingForTeamId, setInvitingForTeamId] = useState(null);
    const [removingMemberKey, setRemovingMemberKey] = useState(null); // `${teamId}:${userId}`
    const [inviteSearchByTeam, setInviteSearchByTeam] = useState({}); // { [teamId]: string }
    const [currentUserId, setCurrentUserId] = useState(null);

    // Equipos donde eres miembro (raw) para cruzar con owned
    const [rawMine, setRawMine] = useState([]);

    // Invitaciones a equipos
    const [teamInvites, setTeamInvites] = useState([]); // [{ team_id, role, team: {...} }]
    const [loadingTeamInvites, setLoadingTeamInvites] = useState(true);
    const [processingInviteTeamId, setProcessingInviteTeamId] =
        useState(null);

    // Modal de confirmación de eliminación de equipo
    const [confirmDelete, setConfirmDelete] = useState(null); // { id, name }
    const [confirmRemoveMember, setConfirmRemoveMember] = useState(null);
    const [confirmLeaveTeam, setConfirmLeaveTeam] = useState(null);


    // --------------------------------------------------------
    // Helpers
    // --------------------------------------------------------
    function handleAuth401(res) {
        if (res.status === 401) {
            localStorage.removeItem("ee_auth");
            window.location.href = `/auth/login?redirect=${encodeURIComponent(
                window.location.pathname
            )}`;
            return true;
        }
        return false;
    }

    async function handleInviteFromSuggestion(teamId, userId) {
        setInvitingForTeamId(teamId);
        try {
            const ok = await inviteUserToTeam(teamId, userId);
            if (!ok) {
                showToast("No se pudo enviar la invitación");
                return;
            }
            showToast("Invitación enviada");

            // limpiar el campo de búsqueda para ese equipo
            setInviteSearchByTeam(prev => ({
                ...prev,
                [teamId]: "",
            }));
        } finally {
            setInvitingForTeamId(null);
        }
    }

    async function handleDeleteTeam(teamId) {
        try {
            const res = await fetch(`${apiBase}/teams/${teamId}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (handleAuth401(res)) return;
            if (!res.ok) {
                const text = await res.text();
                console.error("delete team error body:", text);
                showToast("No se pudo eliminar el equipo");
                return;
            }

            showToast("Equipo eliminado");

            setOwnedTeams(prev => prev.filter(t => t.id !== teamId));
            setRawMine(prev => prev.filter(t => t.id !== teamId));
            setOtherTeams(prev => prev.filter(t => t.id !== teamId));

            setMembersByTeam(prev => {
                const copy = { ...prev };
                delete copy[teamId];
                return copy;
            });
        } catch (err) {
            console.error("handleDeleteTeam error:", err);
            showToast("Error al eliminar el equipo");
        }
    }

    // --------------------------------------------------------
    // Fetch: equipos y contactos
    // --------------------------------------------------------
    async function fetchOwnedTeams({ showSpinner = false } = {}) {
        if (showSpinner) setLoadingOwned(true);
        try {
            const res = await fetch(`${apiBase}/teams/owned`, {
                credentials: "include",
            });
            if (handleAuth401(res)) return;
            if (!res.ok) {
                const text = await res.text();
                console.error("owned teams error body:", text);
                showToast("Error al cargar equipos creados");
                return;
            }
            const data = await res.json();
            setOwnedTeams(data || []);
        } catch (err) {
            console.error("fetchOwnedTeams error:", err);
            showToast("Error al cargar equipos creados");
        } finally {
            if (showSpinner) setLoadingOwned(false);
        }
    }

    async function fetchMineTeams({ showSpinner = false } = {}) {
        if (showSpinner) setLoadingOthers(true);
        try {
            const res = await fetch(`${apiBase}/teams/mine`, {
                credentials: "include",
            });
            if (handleAuth401(res)) return;
            if (!res.ok) {
                const text = await res.text();
                console.error("mine teams error body:", text);
                showToast("Error al cargar tus equipos");
                return;
            }
            const mine = await res.json();
            setRawMine(mine || []);
        } catch (err) {
            console.error("fetchMineTeams error:", err);
            showToast("Error al cargar tus equipos");
        } finally {
            if (showSpinner) setLoadingOthers(false);
        }
    }

    async function fetchContacts({ showSpinner = false } = {}) {
        if (showSpinner) setLoadingContacts(true);
        try {
            const res = await fetch(`${apiBase}/contacts`, {
                credentials: "include",
            });
            if (handleAuth401(res)) return;
            if (!res.ok) {
                const text = await res.text();
                console.error("contacts error body:", text);
                showToast("Error al cargar contactos");
                return;
            }
            const data = await res.json(); // [{ id, status, friend: { id, name, email } }]
            setContacts(data || []);
        } catch (err) {
            console.error("fetchContacts error:", err);
            showToast("Error al cargar contactos");
        } finally {
            if (showSpinner) setLoadingContacts(false);
        }
    }

    async function fetchTeamInvites({ showSpinner = false } = {}) {
        if (showSpinner) setLoadingTeamInvites(true);
        try {
            const res = await fetch(`${apiBase}/teams/invitations`, {
                credentials: "include",
            });
            if (handleAuth401(res)) return;
            if (!res.ok) {
                const text = await res.text();
                console.error("team invitations error body:", text);
                showToast("Error al cargar invitaciones de equipo");
                return;
            }
            const data = await res.json(); // esperamos [{ team_id, role, status, team: TeamOut }]
            setTeamInvites(data || []);
        } catch (err) {
            console.error("fetchTeamInvites error:", err);
            showToast("Error al cargar invitaciones de equipo");
        } finally {
            if (showSpinner) setLoadingTeamInvites(false);
        }
    }
    useEffect(() => {
        if (!isActive) return;

        const isInitialLoad =
            ownedTeams.length === 0 &&
            rawMine.length === 0 &&
            contacts.length === 0 &&
            teamInvites.length === 0;

        fetchOwnedTeams({ showSpinner: isInitialLoad });
        fetchMineTeams({ showSpinner: isInitialLoad });
        fetchContacts({ showSpinner: isInitialLoad });
        fetchTeamInvites({ showSpinner: isInitialLoad });
    }, [isActive]);


    // Cada vez que ownedTeams o rawMine cambian, recalculamos otros equipos
    useEffect(() => {
        if (!rawMine) return;
        const ownedIds = new Set(ownedTeams.map(t => t.id));
        const others = rawMine.filter(t => !ownedIds.has(t.id));
        setOtherTeams(others);
    }, [ownedTeams, rawMine]);

    // --------------------------------------------------------
    // Crear equipo + invitaciones iniciales
    // --------------------------------------------------------
    function toggleContactSelection(friendId) {
        setSelectedContactIds(prev =>
            prev.includes(friendId)
                ? prev.filter(id => id !== friendId)
                : [...prev, friendId]
        );
    }

    async function inviteUserToTeam(teamId, userId) {
        const res = await fetch(`${apiBase}/teams/${teamId}/invite`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ user_id: userId }),
        });
        if (handleAuth401(res)) return false;
        if (!res.ok) {
            const text = await res.text();
            console.error("invite user to team error body:", text);
            return false;
        }
        return true;
    }

    async function handleCreateTeam(e) {
        e?.preventDefault?.();
        if (!newName.trim()) {
            showToast("El nombre del equipo es obligatorio");
            return;
        }

        setCreating(true);
        try {
            const res = await fetch(`${apiBase}/teams`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: newName.trim(),
                    description: newDescription.trim() || null,
                }),
            });
            if (handleAuth401(res)) return;

            if (!res.ok) {
                const text = await res.text();
                console.error("create team error body:", text);
                showToast(
                    res.status === 400
                        ? "No se pudo crear el equipo (¿nombre duplicado?)"
                        : "Error al crear el equipo"
                );
                return;
            }

            const team = await res.json();
            showToast("Equipo creado");
            setNewName("");
            setNewDescription("");
            setCreateInviteSearch("");
            setSelectedContactIds([]);

            setOwnedTeams(prev => [...prev, team]);
            setRawMine(prev => {
                const exists = prev.some(t => t.id === team.id);
                return exists ? prev : [...prev, team];
            });

            if (selectedContactIds.length > 0) {
                let okCount = 0;
                for (const friendId of selectedContactIds) {
                    const ok = await inviteUserToTeam(team.id, friendId);
                    if (ok) okCount++;
                }
                if (okCount > 0) {
                    showToast(
                        `Se enviaron ${okCount} invitaciones al equipo`
                    );
                }
                setSelectedContactIds([]);
            }
        } catch (err) {
            console.error("handleCreateTeam error:", err);
            showToast("Error al crear el equipo");
        } finally {
            setCreating(false);
        }
    }

    // --------------------------------------------------------
    // Miembros por equipo (detalles)
    // --------------------------------------------------------
    async function fetchTeamMembers(teamId) {
        setLoadingMembersFor(teamId);
        try {
            const res = await fetch(`${apiBase}/teams/${teamId}/members`, {
                credentials: "include",
            });
            if (handleAuth401(res)) return;
            if (!res.ok) {
                const text = await res.text();
                console.error("team members error body:", text);
                showToast("Error al cargar miembros del equipo");
                setMembersByTeam(prev => ({ ...prev, [teamId]: [] }));
                return;
            }
            const data = await res.json(); // [{ id, team_id, user: { id, name, email }, role }]
            setMembersByTeam(prev => ({ ...prev, [teamId]: data || [] }));
        } catch (err) {
            console.error("fetchTeamMembers error:", err);
            showToast("Error al cargar miembros del equipo");
            setMembersByTeam(prev => ({ ...prev, [teamId]: [] }));
        } finally {
            setLoadingMembersFor(null);
        }
    }

    async function toggleDetails(teamId) {
        if (expandedTeamId === teamId) {
            setExpandedTeamId(null);
            return;
        }
        setExpandedTeamId(teamId);
        if (!membersByTeam[teamId]) {
            await fetchTeamMembers(teamId);
        }
    }

    // --------------------------------------------------------
    // Editar descripción (solo owner)
    // --------------------------------------------------------
    function startEditDescription(team) {
        setEditingTeamId(team.id);
        setEditDescription(team.description || "");
    }

    function cancelEditDescription() {
        setEditingTeamId(null);
        setEditDescription("");
    }

    async function saveDescription(teamId) {
        setSavingDescriptionId(teamId);
        try {
            const res = await fetch(`${apiBase}/teams/${teamId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    description: editDescription.trim() || null,
                }),
            });
            if (handleAuth401(res)) return;
            if (!res.ok) {
                const text = await res.text();
                console.error("update description error body:", text);
                showToast("No se pudo actualizar la descripción");
                return;
            }
            const updated = await res.json();
            showToast("Descripción actualizada");

            setOwnedTeams(prev =>
                prev.map(t => (t.id === updated.id ? updated : t))
            );
            setOtherTeams(prev =>
                prev.map(t => (t.id === updated.id ? updated : t))
            );
            setRawMine(prev =>
                prev.map(t => (t.id === updated.id ? updated : t))
            );

            cancelEditDescription();
        } catch (err) {
            console.error("saveDescription error:", err);
            showToast("Error al actualizar la descripción");
        } finally {
            setSavingDescriptionId(null);
        }
    }

    // --------------------------------------------------------
    // Invitar miembro (equipos que ya existen) y eliminar miembro
    // --------------------------------------------------------
    function handleChangeInviteTarget(teamId, userId) {
        setInviteTargetByTeam(prev => ({ ...prev, [teamId]: userId }));
    }

    async function handleInviteExisting(teamId) {
        const targetId = inviteTargetByTeam[teamId];
        if (!targetId) {
            showToast("Selecciona un contacto para invitar");
            return;
        }
        setInvitingForTeamId(teamId);
        try {
            const ok = await inviteUserToTeam(teamId, targetId);
            if (!ok) {
                showToast("No se pudo enviar la invitación");
                return;
            }
            showToast("Invitación enviada");
            // No aparece en la lista de miembros porque está 'pending'
        } finally {
            setInvitingForTeamId(null);
        }
    }

    async function handleRemoveMember(teamId, userId) {
        const key = `${teamId}:${userId}`;
        setRemovingMemberKey(key);
        try {
            const res = await fetch(
                `${apiBase}/teams/${teamId}/members/${userId}`,
                {
                    method: "DELETE",
                    credentials: "include",
                }
            );
            if (handleAuth401(res)) return;
            if (!res.ok) {
                const text = await res.text();
                console.error("remove member error body:", text);
                showToast("No se pudo eliminar al miembro");
                return;
            }
            showToast("Miembro eliminado");
            setMembersByTeam(prev => {
                const list = prev[teamId] || [];
                return {
                    ...prev,
                    [teamId]: list.filter(m => m.user.id !== userId),
                };
            });
        } catch (err) {
            console.error("handleRemoveMember error:", err);
            showToast("Error al eliminar miembro");
        } finally {
            setRemovingMemberKey(null);
        }
    }

    async function handleLeaveTeam(teamId) {
        const key = `${teamId}:me`;
        setRemovingMemberKey(key);

        try {
            const res = await fetch(`${apiBase}/teams/${teamId}/members/me`, {
                method: "DELETE",
                credentials: "include",
            });

            if (handleAuth401(res)) return;

            if (!res.ok) {
                const text = await res.text();
                console.error("leave team error body:", text);
                showToast("No se pudo salir del equipo");
                return;
            }

            showToast("Has salido del equipo");
            setRawMine(prev => prev.filter(t => t.id !== teamId));
            setOtherTeams(prev => prev.filter(t => t.id !== teamId));

        } catch (err) {
            console.error("handleLeaveTeam error:", err);
            showToast("Error al salir del equipo");
        } finally {
            setRemovingMemberKey(null);
        }
    }


    // --------------------------------------------------------
    // Aceptar / rechazar invitaciones de equipo
    // --------------------------------------------------------
    async function handleTeamInviteAction(teamId, action) {
        setProcessingInviteTeamId(teamId);
        try {
            const res = await fetch(
                `${apiBase}/teams/${teamId}/${action}-invite`,
                {
                    method: "POST",
                    credentials: "include",
                }
            );
            if (handleAuth401(res)) return;
            if (!res.ok) {
                const text = await res.text();
                console.error(
                    `${action} team invite error body:`,
                    text
                );
                showToast(
                    action === "accept"
                        ? "No se pudo aceptar la invitación"
                        : "No se pudo rechazar la invitación"
                );
                return;
            }

            showToast(
                action === "accept"
                    ? "Invitación aceptada"
                    : "Invitación rechazada"
            );

            // Sacar de la lista de invitaciones
            setTeamInvites(prev =>
                prev.filter(inv => inv.team_id !== teamId)
            );

            if (action === "accept") {
                // Actualizar equipos donde participas
                fetchMineTeams();
            }
        } catch (err) {
            console.error("handleTeamInviteAction error:", err);
            showToast("Error al procesar invitación de equipo");
        } finally {
            setProcessingInviteTeamId(null);
        }
    }

    // --------------------------------------------------------
    // UI Helpers
    // --------------------------------------------------------
    function renderMembersBlock(team) {
        const teamId = team.id;
        const isExpanded = expandedTeamId === teamId;
        const members = membersByTeam[teamId] || [];

        const isOwnedTeam = ownedTeams.some(t => t.id === teamId);
        const dangerStyle = {
            borderColor: "#dc2626",
            color: "#b91c1c",
        };

        return (
            <div style={{ marginTop: 8 }}>
                {/* Fila: Ver lista + eliminar/salir alineado a la derecha */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 8,
                        gap: 8,
                    }}
                >
                    <button
                        type="button"
                        className="btn btn--outline"
                        onClick={() => toggleDetails(team.id)}
                    >
                        {expandedTeamId === team.id
                            ? "Ocultar participantes"
                            : "Ver lista de participantes"}
                    </button>

                    {ownedTeams.some(t => t.id === team.id) ? (
                        <button
                            type="button"
                            className="btn btn--outline"
                            style={{ borderColor: "#dc2626", color: "#b91c1c" }}
                            onClick={() =>
                                setConfirmDelete({ id: team.id, name: team.name })
                            }
                        >
                            Eliminar equipo
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="btn btn--outline"
                            style={{ marginTop: 8, borderColor: "#dc2626", color: "#b91c1c" }}
                            onClick={() =>
                                setConfirmLeaveTeam({
                                    teamId: team.id,
                                    teamName: team.name
                                })
                            }
                        >
                            Salir del equipo
                        </button>

                    )}
                </div>


                {isExpanded && (
                    <div
                        className="stack"
                        style={{
                            marginTop: 8,
                            paddingTop: 8,
                            borderTop: "1px solid #e5e7eb",
                        }}
                    >
                        {loadingMembersFor === teamId ? (
                            <p className="muted">Cargando miembros...</p>
                        ) : members.length === 0 ? (
                            <p className="muted">
                                Este equipo no tiene miembros aceptados
                                aún.
                            </p>
                        ) : (
                            <div className="stack" style={{ gap: 8 }}>
                                {members.map(m => {
                                    const mKey = `${teamId}:${m.user.id}`;
                                    const isRemoving = removingMemberKey === mKey;
                                    return (
                                        <div
                                            key={m.id}
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "flex-end",
                                                gap: 8,
                                            }}
                                        >
                                            <div>
                                                <div
                                                    style={{
                                                        fontWeight: 500,
                                                        wordBreak: "break-word",
                                                    }}
                                                >
                                                    {m.user.name || "Sin nombre"}
                                                </div>
                                                <div
                                                    className="muted"
                                                    style={{
                                                        fontSize: 12,
                                                        wordBreak: "break-word",
                                                    }}
                                                >
                                                    {m.user.email}
                                                </div>
                                                <div
                                                    className="muted"
                                                    style={{ fontSize: 12 }}
                                                >
                                                    Rol: {m.role}
                                                </div>
                                            </div>

                                            {/* Eliminar miembro solo para equipos propios, y nunca al owner */}
                                            {team.owner_id === undefined
                                                ? null
                                                : team.owner_id === m.user.id
                                                    ? null
                                                    : isOwnedTeam && (
                                                        <button
                                                            type="button"
                                                            className="btn btn--outline"
                                                            style={{
                                                                ...dangerStyle,
                                                                marginTop: 4
                                                            }}
                                                            onClick={() =>
                                                                setConfirmRemoveMember({
                                                                    teamId,
                                                                    userId: m.user.id,
                                                                    name: m.user.name || m.user.email
                                                                })
                                                            }
                                                        >
                                                            Remover
                                                        </button>


                                                    )}
                                        </div>
                                    );
                                })}

                            </div>
                        )}

                        {/* 🔹 SOLO en equipos que tú creaste mostramos la barra de invitación */}
                        {isOwnedTeam &&
                            renderInviteControlsForOwned(team)}
                    </div>
                )}
            </div>
        );
    }

    function renderInviteControlsForOwned(team) {
        const teamId = team.id;
        const search = inviteSearchByTeam[teamId] || "";

        const members = membersByTeam[teamId] || [];
        const currentMemberIds = new Set(members.map(m => m.user.id));

        // contactos que NO están ya en el equipo y no son el owner
        const filteredContacts = contacts.filter(c => {
            const friend = c.friend;
            if (!friend) return false;
            if (friend.id === team.owner_id) return false;
            if (currentMemberIds.has(friend.id)) return false;

            if (!search.trim()) return false;

            const term = search.toLowerCase();
            const name = (friend.name || "").toLowerCase();
            const email = (friend.email || "").toLowerCase();

            return name.includes(term) || email.includes(term);
        });

        const showSuggestions =
            search.trim().length >= 2 && filteredContacts.length > 0;

        return (
            <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 14, display: "block" }}>
                    Invitar contacto al equipo
                    <input
                        type="text"
                        placeholder="Buscar por nombre o correo..."
                        value={search}
                        onChange={e =>
                            setInviteSearchByTeam(prev => ({
                                ...prev,
                                [teamId]: e.target.value,
                            }))
                        }
                        style={{
                            marginTop: 4,
                            width: "100%",
                        }}
                    />
                </label>

                {showSuggestions && (
                    <div
                        className="card"
                        style={{
                            marginTop: 4,
                            maxHeight: 200,
                            overflowY: "auto",
                            border: "1px solid #e5e7eb",
                            borderRadius: 6,
                            padding: 4,
                        }}
                    >
                        {filteredContacts.map(c => {
                            const friend = c.friend;
                            return (
                                <button
                                    key={friend.id}
                                    type="button"
                                    className="btn btn--outline"
                                    style={{
                                        width: "100%",
                                        justifyContent: "flex-start",
                                        marginBottom: 4,
                                    }}
                                    onClick={() =>
                                        handleInviteFromSuggestion(
                                            teamId,
                                            friend.id
                                        )
                                    }
                                    disabled={
                                        invitingForTeamId === teamId
                                    }
                                >
                                    <span
                                        style={{
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {friend.name || "Sin nombre"}{" "}
                                        <span className="muted">
                                            ({friend.email})
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    // --------------------------------------------------------
    // Render
    // --------------------------------------------------------
    // 🔍 contactos filtrados para la creación (barra de búsqueda)
    const createFilteredContacts =
        !createInviteSearch.trim()
            ? []
            : contacts.filter(c => {
                const friend = c.friend;
                if (!friend) return false;
                if (selectedContactIds.includes(friend.id)) return false;

                const term = createInviteSearch.toLowerCase();
                const name = (friend.name || "").toLowerCase();
                const email = (friend.email || "").toLowerCase();

                return name.includes(term) || email.includes(term);
            });

    const showCreateSuggestions =
        createInviteSearch.trim().length >= 2 &&
        createFilteredContacts.length > 0;

    return (
        <>
            <div
                style={{
                    width: "99%",
                    margin: "0 auto",
                    display: "grid",
                    gap: 16,
                    gridTemplateColumns:
                        "minmax(0, 1.2fr) minmax(0, 1fr)",
                    alignItems: "flex-start",
                }}
            >
                {/* Columna izquierda: creación + equipos creados */}
                <div className="stack" style={{ gap: 16 }}>
                    {/* Crear equipo */}
                    <div className="card">
                        <h2>Crear equipo</h2>
                        <form
                            onSubmit={handleCreateTeam}
                            className="stack"
                            style={{ marginTop: 8 }}
                        >
                            <label>
                                Nombre del equipo
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e =>
                                        setNewName(e.target.value)
                                    }
                                    placeholder="Ej. Compañeros de proyecto"
                                />
                            </label>

                            {/* 🔹 INVITAR CONTACTOS (barra de búsqueda encima de descripción) */}
                            <div style={{ marginTop: 8 }}>
                                <div
                                    style={{
                                        fontWeight: 500,
                                        marginBottom: 4,
                                    }}
                                >
                                    Invitar contactos al crear
                                </div>
                                {loadingContacts ? (
                                    <p className="muted">
                                        Cargando contactos...
                                    </p>
                                ) : contacts.length === 0 ? (
                                    <p className="muted">
                                        No tienes contactos
                                        todavía.
                                    </p>
                                ) : (
                                    <div
                                        className="stack"
                                        style={{ gap: 8 }}
                                    >
                                        <input
                                            type="text"
                                            placeholder="Buscar contacto por nombre o correo..."
                                            value={createInviteSearch}
                                            onChange={e =>
                                                setCreateInviteSearch(
                                                    e.target.value
                                                )
                                            }
                                        />

                                        {showCreateSuggestions && (
                                            <div
                                                className="card"
                                                style={{
                                                    maxHeight: 200,
                                                    overflowY:
                                                        "auto",
                                                    border: "1px solid #e5e7eb",
                                                    borderRadius: 6,
                                                    padding: 4,
                                                }}
                                            >
                                                {createFilteredContacts.map(
                                                    c => {
                                                        const friend =
                                                            c.friend;
                                                        return (
                                                            <button
                                                                key={
                                                                    friend.id
                                                                }
                                                                type="button"
                                                                className="btn btn--outline"
                                                                style={{
                                                                    width:
                                                                        "100%",
                                                                    justifyContent:
                                                                        "flex-start",
                                                                    marginBottom: 4,
                                                                }}
                                                                onClick={() => {
                                                                    toggleContactSelection(
                                                                        friend.id
                                                                    );
                                                                    setCreateInviteSearch(
                                                                        ""
                                                                    );
                                                                }}
                                                            >
                                                                <span
                                                                    style={{
                                                                        overflow:
                                                                            "hidden",
                                                                        textOverflow:
                                                                            "ellipsis",
                                                                        whiteSpace:
                                                                            "nowrap",
                                                                    }}
                                                                >
                                                                    {friend.name ||
                                                                        "Sin nombre"}{" "}
                                                                    <span className="muted">
                                                                        (
                                                                        {
                                                                            friend.email
                                                                        }
                                                                        )
                                                                    </span>
                                                                </span>
                                                            </button>
                                                        );
                                                    }
                                                )}
                                            </div>
                                        )}

                                        {selectedContactIds.length >
                                            0 && (
                                                <div
                                                    style={{
                                                        display:
                                                            "flex",
                                                        flexWrap:
                                                            "wrap",
                                                        gap: 6,
                                                        marginTop: 4,
                                                    }}
                                                >
                                                    {selectedContactIds.map(
                                                        id => {
                                                            const contact =
                                                                contacts.find(
                                                                    c =>
                                                                        c.friend &&
                                                                        c
                                                                            .friend
                                                                            .id ===
                                                                        id
                                                                );
                                                            const friend =
                                                                contact?.friend;
                                                            if (
                                                                !friend
                                                            )
                                                                return null;
                                                            return (
                                                                <button
                                                                    key={
                                                                        id
                                                                    }
                                                                    type="button"
                                                                    className="btn btn--outline"
                                                                    style={{
                                                                        fontSize: 12,
                                                                        padding:
                                                                            "2px 6px",
                                                                    }}
                                                                    onClick={() =>
                                                                        toggleContactSelection(
                                                                            id
                                                                        )
                                                                    }
                                                                >
                                                                    {friend.name ||
                                                                        "Sin nombre"}{" "}
                                                                    <span className="muted">
                                                                        (
                                                                        {
                                                                            friend.email
                                                                        }
                                                                        )
                                                                    </span>
                                                                    {"  ×"}
                                                                </button>
                                                            );
                                                        }
                                                    )}
                                                </div>
                                            )}
                                    </div>
                                )}
                            </div>

                            {/* Descripción (debajo de invitaciones) */}
                            <label>
                                Descripción (opcional)
                                <textarea
                                    rows={3}
                                    value={newDescription}
                                    onChange={e =>
                                        setNewDescription(
                                            e.target.value
                                        )
                                    }
                                    placeholder="Describe para qué es este equipo"
                                />
                            </label>

                            <button
                                className="btn"
                                type="submit"
                                disabled={creating}
                                style={{ marginTop: 8 }}
                            >
                                {creating
                                    ? "Creando..."
                                    : "Crear equipo"}
                            </button>
                        </form>
                    </div>

                    {/* Equipos creados por ti */}
                    <div className="card">
                        <h2>Equipos creados por ti</h2>
                        {loadingOwned ? (
                            <p className="muted">
                                Cargando equipos...
                            </p>
                        ) : ownedTeams.length === 0 ? (
                            <p className="muted">
                                Aún no has creado ningún
                                equipo.
                            </p>
                        ) : (
                            <div
                                className="stack"
                                style={{ marginTop: 8 }}
                            >
                                {ownedTeams.map(team => {
                                    const isEditing =
                                        editingTeamId ===
                                        team.id;
                                    const isSaving =
                                        savingDescriptionId ===
                                        team.id;

                                    return (
                                        <div
                                            key={team.id}
                                            className="card"
                                            style={{
                                                background:
                                                    "#f9fafb",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display:
                                                        "flex",
                                                    justifyContent:
                                                        "space-between",
                                                    alignItems:
                                                        "baseline",
                                                    gap: 8,
                                                }}
                                            >
                                                <h3
                                                    style={{
                                                        marginTop: 0,
                                                        wordBreak:
                                                            "break-word",
                                                    }}
                                                >
                                                    {team.name}
                                                </h3>
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        padding:
                                                            "2px 8px",
                                                        borderRadius: 999,
                                                        background:
                                                            "#dbeafe",
                                                        color: "#1d4ed8",
                                                        fontWeight: 500,
                                                        whiteSpace:
                                                            "nowrap",
                                                    }}
                                                >
                                                    Creador
                                                </span>
                                            </div>

                                            {/* 🔹 DESCRIPCIÓN (EDITABLE) */}
                                            {isEditing ? (
                                                <>
                                                    <label
                                                        style={{
                                                            marginTop: 8,
                                                            fontSize: 14,
                                                        }}
                                                    >
                                                        Descripción
                                                        <textarea
                                                            rows={
                                                                3
                                                            }
                                                            value={
                                                                editDescription
                                                            }
                                                            onChange={e =>
                                                                setEditDescription(
                                                                    e
                                                                        .target
                                                                        .value
                                                                )
                                                            }
                                                            style={{
                                                                marginTop: 4,
                                                            }}
                                                        />
                                                    </label>
                                                    <div
                                                        className="stack stack--horizontal"
                                                        style={{
                                                            marginTop: 8,
                                                            gap: 8,
                                                            justifyContent:
                                                                "flex-start",
                                                            flexWrap:
                                                                "wrap",
                                                        }}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="btn"
                                                            onClick={() =>
                                                                saveDescription(
                                                                    team.id
                                                                )
                                                            }
                                                            disabled={
                                                                isSaving
                                                            }
                                                        >
                                                            {isSaving
                                                                ? "Guardando..."
                                                                : "Guardar"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn--outline"
                                                            onClick={
                                                                cancelEditDescription
                                                            }
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    {team.description && (
                                                        <div
                                                            style={{
                                                                marginTop: 8,
                                                                marginBottom: 4,
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    fontSize: 12,
                                                                    fontWeight: 600,
                                                                    marginRight: 4,
                                                                }}
                                                            >
                                                                Descripción:
                                                            </span>
                                                            <span
                                                                className="muted"
                                                                style={{
                                                                    wordBreak:
                                                                        "break-word",
                                                                }}
                                                            >
                                                                {
                                                                    team.description
                                                                }
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Botón para editar descripción (ya sin alargarse raro) */}
                                                    <div
                                                        className="stack stack--horizontal"
                                                        style={{
                                                            marginTop: 8,
                                                            gap: 8,
                                                            justifyContent:
                                                                "flex-start",
                                                            flexWrap:
                                                                "wrap",
                                                        }}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="btn btn--outline"
                                                            onClick={() =>
                                                                startEditDescription(
                                                                    team
                                                                )
                                                            }
                                                        >
                                                            Editar
                                                            descripción
                                                        </button>
                                                    </div>
                                                </>
                                            )}

                                            {/* 🔹 LISTA DE MIEMBROS + INVITAR DESDE DETALLES + ELIMINAR/ SALIR EN LA MISMA LÍNEA */}
                                            {renderMembersBlock(team)}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Columna derecha: invitaciones + otros equipos */}
                <div className="stack" style={{ gap: 16 }}>
                    {/* Invitaciones a equipos */}
                    <div className="card">
                        <h2>Invitaciones a equipos</h2>
                        {loadingTeamInvites ? (
                            <p className="muted">
                                Cargando invitaciones...
                            </p>
                        ) : teamInvites.length === 0 ? (
                            <p className="muted">
                                No tienes invitaciones de
                                equipo pendientes.
                            </p>
                        ) : (
                            <div
                                className="stack"
                                style={{ marginTop: 8 }}
                            >
                                {teamInvites.map(inv => {
                                    const team = inv.team;
                                    const teamId = inv.team_id;
                                    const isProcessing =
                                        processingInviteTeamId ===
                                        teamId;

                                    return (
                                        <div
                                            key={teamId}
                                            className="card"
                                            style={{
                                                background:
                                                    "#f9fafb",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display:
                                                        "flex",
                                                    justifyContent:
                                                        "space-between",
                                                    alignItems:
                                                        "baseline",
                                                    gap: 8,
                                                }}
                                            >
                                                <h3
                                                    style={{
                                                        marginTop: 0,
                                                        wordBreak:
                                                            "break-word",
                                                    }}
                                                >
                                                    {team?.name ??
                                                        "Equipo sin nombre"}
                                                </h3>
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        padding:
                                                            "2px 8px",
                                                        borderRadius: 999,
                                                        background:
                                                            "#fef3c7",
                                                        color: "#92400e",
                                                        fontWeight: 500,
                                                        whiteSpace:
                                                            "nowrap",
                                                    }}
                                                >
                                                    Invitación
                                                    pendiente
                                                </span>
                                            </div>
                                            {team?.description && (
                                                <p
                                                    className="muted"
                                                    style={{
                                                        wordBreak:
                                                            "break-word",
                                                    }}
                                                >
                                                    {
                                                        team.description
                                                    }
                                                </p>
                                            )}

                                            <div
                                                className="stack stack--horizontal"
                                                style={{
                                                    marginTop: 8,
                                                    gap: 8,
                                                    flexWrap:
                                                        "wrap",
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    className="btn"
                                                    onClick={() =>
                                                        handleTeamInviteAction(
                                                            teamId,
                                                            "accept"
                                                        )
                                                    }
                                                    disabled={
                                                        isProcessing
                                                    }
                                                >
                                                    {isProcessing
                                                        ? "Procesando..."
                                                        : "Aceptar"}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn--outline"
                                                    onClick={() =>
                                                        handleTeamInviteAction(
                                                            teamId,
                                                            "reject"
                                                        )
                                                    }
                                                    disabled={
                                                        isProcessing
                                                    }
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Otros equipos donde participas */}
                    <div className="card">
                        <h2>Equipos donde participas</h2>
                        {loadingOthers ? (
                            <p className="muted">
                                Cargando equipos...
                            </p>
                        ) : otherTeams.length === 0 ? (
                            <p className="muted">
                                No formas parte de equipos
                                donde no seas el creador.
                            </p>
                        ) : (
                            <div
                                className="stack"
                                style={{ marginTop: 8 }}
                            >
                                {otherTeams.map(team => (
                                    <div
                                        key={team.id}
                                        className="card"
                                        style={{
                                            background:
                                                "#f9fafb",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display:
                                                    "flex",
                                                justifyContent:
                                                    "space-between",
                                                alignItems:
                                                    "baseline",
                                                gap: 8,
                                            }}
                                        >
                                            <h3
                                                style={{
                                                    marginTop: 0,
                                                    wordBreak:
                                                        "break-word",
                                                }}
                                            >
                                                {team.name}
                                            </h3>
                                            <span
                                                style={{
                                                    fontSize: 11,
                                                    padding:
                                                        "2px 8px",
                                                    borderRadius: 999,
                                                    background:
                                                        "#ecfdf5",
                                                    color: "#15803d",
                                                    fontWeight: 500,
                                                    whiteSpace:
                                                        "nowrap",
                                                }}
                                            >
                                                Miembro
                                            </span>
                                        </div>
                                        {team.description && (
                                            <div
                                                style={{
                                                    marginTop: 4,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontSize: 12,
                                                        fontWeight: 600,
                                                        marginRight: 4,
                                                    }}
                                                >
                                                    Descripción:
                                                </span>
                                                <span
                                                    className="muted"
                                                    style={{
                                                        wordBreak:
                                                            "break-word",
                                                    }}
                                                >
                                                    {
                                                        team.description
                                                    }
                                                </span>
                                            </div>
                                        )}

                                        {/* 🔹 Botones Ver lista + Salir alineados y con acento rojo en renderMembersBlock */}
                                        {renderMembersBlock(team)}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal de confirmación para eliminar equipo */}
            <ConfirmModal
                open={!!confirmDelete}
                title="¿Eliminar equipo?"
                message={
                    confirmDelete
                        ? `¿Seguro que quieres eliminar “${confirmDelete.name}”? Esta acción no se puede deshacer.`
                        : ""
                }
                onClose={() => setConfirmDelete(null)}
                onConfirm={() => {
                    if (confirmDelete?.id) {
                        handleDeleteTeam(confirmDelete.id);
                    }
                    setConfirmDelete(null);
                }}
            />

            <ConfirmModal
                open={!!confirmRemoveMember}
                title="¿Remover miembro?"
                message={
                    confirmRemoveMember
                        ? `¿Seguro que quieres remover a “${confirmRemoveMember.name}” del equipo?`
                        : ""
                }
                onClose={() => setConfirmRemoveMember(null)}
                onConfirm={() => {
                    if (confirmRemoveMember)
                        handleRemoveMember(
                            confirmRemoveMember.teamId,
                            confirmRemoveMember.userId
                        );

                    setConfirmRemoveMember(null);
                }}
            />
            <ConfirmModal
                open={!!confirmLeaveTeam}
                title="¿Salir del equipo?"
                message={
                    confirmLeaveTeam
                        ? `¿Seguro que quieres salir del equipo “${confirmLeaveTeam.teamName}”?`
                        : ""
                }
                onClose={() => setConfirmLeaveTeam(null)}
                onConfirm={() => {
                    if (confirmLeaveTeam)
                        handleLeaveTeam(confirmLeaveTeam.teamId);

                    setConfirmLeaveTeam(null);
                }}
            />


        </>
    );
}

import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request, status, FastAPI, Response
from sqlalchemy.orm import Session
from typing import List
from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware
from fastapi.middleware.cors import CORSMiddleware
from zoneinfo import ZoneInfo
from base import seed_demo_data 

from base import (
    get_session,
    User,
    Event,
    Contact,
    Team,
    EventInvitation,
    TeamMember,
    verify_user,
    get_user_by_id,
    create_user, 
    send_contact_request,
    list_pending_received_requests,
    accept_contact_request,
    reject_contact_request,
    list_contacts,
    remove_contact,
    create_team,
    update_team,
    delete_team,
    list_teams_created_by_user,
    list_teams_user_is_in,
    get_team_by_id,
    list_pending_team_invites,
    reject_team_invite,
    accept_team_invite,
    invite_user_to_team,
    list_team_members,
    remove_user_from_team,
    create_event as create_event_db,
    invite_team_to_event,
    auto_invite_team_members,
    search_user_contacts_by_query,
    search_user_teams_by_query,
    get_event_by_id,
    invite_user_to_event,
    delete_event,
    accept_event_invite,
    reject_event_invite,
    get_or_create_calendar_token,
    get_user_by_calendar_token,
    list_events_for_calendar,
    generate_ics_for_events,
)
from schemas import (
    EventOut,
    InvitationOut,
    RegisterRequest,
    LoginRequest,
    UserOut,
    EventCreate,
    FriendRequestCreate,
    UserSearchOut,
    IncomingFriendRequestOut,
    ContactOut,
    TeamCreate, 
    TeamUpdate, 
    TeamOut,
    TeamInvitationOut,
    TeamMemberOut,
    TeamInviteRequest,
    SimpleUserOut,
    EventInviteUserRequest,
    TimezoneUpdate,
    
)

router = APIRouter(prefix="/api", tags=["events"])
auth_router = APIRouter(prefix="/api/auth", tags=["auth"])

def get_current_user(
    request: Request,
    db: Session = Depends(get_session),
) -> User:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    user = get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user


@auth_router.post("/me/timezone")
def update_my_timezone(
    data: TimezoneUpdate,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        ZoneInfo(data.timezone)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid timezone")

    current_user.timezone = data.timezone
    db.flush()
    db.refresh(current_user)
    return {"timezone": current_user.timezone}


@router.get("/calendar/ics-url")
def get_calendar_ics_url(
    request: Request,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve la URL pública de tu feed ICS para pegar en Google Calendar.
    """
    token = get_or_create_calendar_token(db, current_user.id)

    base_url = str(request.base_url)
    if not base_url.endswith("/"):
        base_url += "/"

    ics_url = f"{base_url}api/calendar/{token}.ics"

    return {"ics_url": ics_url}

@router.get("/calendar/{token}.ics")
def calendar_feed(
    token: str,
    db: Session = Depends(get_session),
):
    user = get_user_by_calendar_token(db, token)
    if user is None:
        raise HTTPException(status_code=404, detail="Calendar not found")

    events = list_events_for_calendar(db, user.id)

    ics_str = generate_ics_for_events(events, timezone_name=user.timezone)

    return Response(content=ics_str, media_type="text/calendar")


@router.post("/invite-links/{token}/accept", response_model=InvitationOut)
def accept_invite_by_token(
    token: str,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Acepta un link de invitación público (/invite/{token}) y crea
    una EventInvitation para el usuario actual si no existe.
    """
    full_path = f"/invite/{token}"

    # 1) Buscar el evento por event_url
    event = db.query(Event).filter(Event.event_url == full_path).first()
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite link not found",
        )

    # 2) Si el owner abre su propio link, no tiene mucho sentido
    if event.owner_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owner cannot use their own invite link",
        )

    # 3) Ver si ya existe una invitación para este usuario
    invitation = (
        db.query(EventInvitation)
        .filter(
            EventInvitation.event_id == event.id,
            EventInvitation.user_id == current_user.id,
        )
        .first()
    )

    if invitation is None:
        # Crear invitación pendiente
        invitation = invite_user_to_event(
            db=db,
            event_id=event.id,
            user_id=current_user.id,
        )

    # 4) Obtener host (owner) para el campo host
    host_user = db.query(User).filter(User.id == event.owner_id).first()
    host_name = host_user.name if host_user else "—"

    # 5) Devolver en el mismo formato que /api/my-invitations
    return InvitationOut(
        id=invitation.id,
        title=event.title,
        date=event.date,
        time=event.time,
        location=event.location,
        host=host_name,
        rsvp=invitation.status,
    )

@router.post("/invitations/{invitation_id}/accept")
def accept_event_invitation_route(
    invitation_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # Buscar la invitación
    invitation = (
        db.query(EventInvitation)
        .filter(EventInvitation.id == invitation_id)
        .first()
    )

    if invitation is None or invitation.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Invitation not found")

    try:
        updated = accept_event_invite(
            db=db,
            event_id=invitation.event_id,
            user_id=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "id": updated.id,
        "status": updated.status,
    }


@router.post("/invitations/{invitation_id}/reject")
def reject_event_invitation_route(
    invitation_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    invitation = (
        db.query(EventInvitation)
        .filter(EventInvitation.id == invitation_id)
        .first()
    )

    if invitation is None or invitation.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Invitation not found")

    try:
        reject_event_invite(
            db=db,
            event_id=invitation.event_id,
            user_id=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "id": invitation.id,
        "status": "rejected",
    }


@router.delete("/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event_invitation_route(
    invitation_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    invitation = (
        db.query(EventInvitation)
        .filter(EventInvitation.id == invitation_id)
        .first()
    )

    if invitation is None or invitation.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Invitation not found")

    db.delete(invitation)
    db.flush()
    return


@router.post("/teams", response_model=TeamOut, status_code=status.HTTP_201_CREATED)
def create_team_route(
    data: TeamCreate,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        team = create_team(
            db=db,
            owner_id=current_user.id,
            name=data.name,
            description=data.description,
        )
        return team
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/teams/owned", response_model=list[TeamOut])
def list_owned_teams(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return list_teams_created_by_user(db, owner_id=current_user.id)


@router.get("/teams/mine", response_model=list[TeamOut])
def list_member_teams(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return list_teams_user_is_in(db, user_id=current_user.id)

@router.post("/teams/{team_id}/accept-invite")
def accept_team_invite_route(
    team_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        updated = accept_team_invite(
            db=db,
            team_id=team_id,
            user_id=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"team_id": updated.team_id, "status": updated.status}

@router.post("/teams/{team_id}/invite", status_code=status.HTTP_201_CREATED)
def invite_user_to_team_route(
    team_id: int,
    data: TeamInviteRequest,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # Verificar que el equipo exista
    team = get_team_by_id(db, team_id=team_id)
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    # Opcional pero recomendable: solo el owner puede invitar
    if team.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only team owner can invite members",
        )

    # Evitar invitarnos múltiples veces / al owner
    if data.user_id == team.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot invite the team owner",
        )

    try:
        member = invite_user_to_team(
            db=db,
            team_id=team_id,
            user_id=data.user_id,
            role="member",
        )
    except ValueError as e:
        # p.ej. "User already invited or already in the team"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return {
        "id": member.id,
        "team_id": member.team_id,
        "user_id": member.user_id,
        "role": member.role,
        "status": member.status,
    }

@router.get("/teams/invitations", response_model=list[TeamInvitationOut])
def list_team_invitations(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    rows = list_pending_team_invites(db, current_user.id)
    results: list[TeamInvitationOut] = []

    for tm in rows:
        team = db.query(Team).filter(Team.id == tm.team_id).first()
        if not team:
            continue

        team_out = TeamOut.model_validate(team, from_attributes=True)

        results.append(
            TeamInvitationOut(
                team_id=tm.team_id,
                role=tm.role,
                status=tm.status,
                team=team_out,
            )
        )

    return results

@router.delete("/teams/{team_id}/members/me")
def leave_or_remove_myself(
    team_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return remove_user_from_team(db, team_id, current_user.id)



@router.delete("/teams/{team_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_team_member_route(
    team_id: int,
    user_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    team = get_team_by_id(db, team_id=team_id)
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    is_owner = current_user.id == team.owner_id
    is_self  = current_user.id == user_id

    if not is_owner and not is_self:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to remove this member",
        )

    if is_self and is_owner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El creador debe eliminar el equipo para salir",
        )

    membership = (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        .first()
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in team",
        )

    db.delete(membership)
    db.flush()
    return


@router.get("/teams/{team_id}/members", response_model=list[TeamMemberOut])
def get_team_members_route(
    team_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    team = get_team_by_id(db, team_id=team_id)
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    members = list_team_members(db, team_id=team_id)

    results: list[TeamMemberOut] = []
    for m in members:
        user = get_user_by_id(db, m.user_id)
        if not user:
            continue

        user_out = SimpleUserOut.model_validate(user, from_attributes=True)

        results.append(
            TeamMemberOut(
                id=m.id,
                team_id=m.team_id,
                role=m.role,
                status=m.status,
                user=user_out,
            )
        )

    return results



@router.post("/teams/{team_id}/reject-invite")
def reject_team_invite_route(
    team_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        reject_team_invite(
            db=db,
            team_id=team_id,
            user_id=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"team_id": team_id, "status": "rejected"}


@router.patch("/teams/{team_id}", response_model=TeamOut)
def update_team_route(
    team_id: int,
    data: TeamUpdate,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    team = get_team_by_id(db, team_id=team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    if team.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

    try:
        updated = update_team(
            db=db,
            team_id=team_id,
            name=data.name,
            description=data.description,
        )
        return updated
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team_route(
    team_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    team = get_team_by_id(db, team_id=team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    if team.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

    try:
        delete_team(db=db, team_id=team_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    
@router.get("/users/search", response_model=UserSearchOut)
def search_user_by_email(
    email: str,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.email == email).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


@router.post("/friend-requests", status_code=status.HTTP_201_CREATED)
def create_friend_request(
    data: FriendRequestCreate,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        req = send_contact_request(
            db=db,
            user_id=current_user.id,
            contact_id=data.target_user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "id": req.id,
        "status": req.status,
        "user_id": req.user_id,
        "contact_id": req.contact_id,
    }


@auth_router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register_user(
    data: RegisterRequest,
    db: Session = Depends(get_session),
):
    try:
        user = create_user(db, name=data.name, email=data.email, password=data.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return user


@auth_router.post("/login", response_model=UserOut)
def login(
    data: LoginRequest,
    request: Request,
    db: Session = Depends(get_session),
):
    try:
        user = verify_user(db, data.email, data.password)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid email or password")

    # guardar user_id en la sesión (cookie firmada)
    request.session["user_id"] = user.id

    return user


@auth_router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@auth_router.get("/me", response_model=UserOut)
def read_me(current_user: User = Depends(get_current_user)):
    return current_user
@router.get("/my-events", response_model=List[EventOut])
def get_my_events(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve todos los eventos creados por el usuario actual,
    incluyendo todos los invitados (excepto el owner) en un solo query.
    """

    # Hacemos un LEFT JOIN de eventos -> invitaciones -> usuario invitado
    rows = (
        db.query(Event, EventInvitation, User)
        .outerjoin(EventInvitation, EventInvitation.event_id == Event.id)
        .outerjoin(User, User.id == EventInvitation.user_id)
        .filter(Event.owner_id == current_user.id)
        .order_by(Event.date.asc(), Event.time.asc())
        .all()
    )

    # Agrupamos por evento, construyendo EventOut con invitees embebidos
    events_out_by_id: dict[int, EventOut] = {}

    for ev, inv, invited_user in rows:
        # Crear el EventOut la primera vez que vemos este evento
        if ev.id not in events_out_by_id:
            events_out_by_id[ev.id] = EventOut(
                id=ev.id,
                title=ev.title,
                date=ev.date,
                time=ev.time,
                endtime=ev.endtime,
                location=ev.location,
                description=ev.description,
                event_url=ev.event_url,
                invitees=[],
            )

        if inv is None or invited_user is None:
            continue

        # Excluir al owner de la lista de invitados
        if invited_user.id == ev.owner_id:
            continue

        events_out_by_id[ev.id].invitees.append(
            {
                "name": invited_user.name,
                "email": invited_user.email,
                "rsvp": inv.status,  # "pending" | "accepted" | "rejected"
            }
        )

    return list(events_out_by_id.values())


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event_route(
    event_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    event = get_event_by_id(db, event_id)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    if event.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to delete this event",
        )

    try:
        delete_event(db, event_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return 


@router.get("/contacts/search", response_model=list[SimpleUserOut])
def search_contacts_route(
    q: str,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if not q or len(q.strip()) < 1:
        return []

    users = search_user_contacts_by_query(db, current_user.id, q.strip())
    return [
        SimpleUserOut.model_validate(u, from_attributes=True)
        for u in users
    ]


@router.get("/teams/search", response_model=list[TeamOut])
def search_teams_route(
    q: str,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if not q or len(q.strip()) < 1:
        return []

    teams = search_user_teams_by_query(db, current_user.id, q.strip())
    return [
        TeamOut.model_validate(t, from_attributes=True)
        for t in teams
    ]


@router.get("/my-invitations", response_model=List[InvitationOut])
def get_my_invitations(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(
            EventInvitation.id.label("invitation_id"),
            EventInvitation.status.label("inv_status"),
            Event.title.label("ev_title"),
            Event.date.label("ev_date"),
            Event.time.label("ev_time"),
            Event.endtime.label("ev_endtime"),
            Event.location.label("ev_location"),
            User.name.label("host_name"),
        )
        .join(Event, Event.id == EventInvitation.event_id)
        .join(User, User.id == Event.owner_id)
        .filter(EventInvitation.user_id == current_user.id)
        .order_by(Event.date.asc(), Event.time.asc())
        .all()
    )

    result: list[InvitationOut] = []

    for row in rows:
        result.append(
            InvitationOut(
                id=row.invitation_id,
                title=row.ev_title,
                date=row.ev_date,
                time=row.ev_time,
                endtime=row.ev_endtime,
                location=row.ev_location,
                host=row.host_name,
                rsvp=row.inv_status,
            )
        )

    return result



@router.post("/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event_route(
    data: EventCreate,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        ev = create_event_db(
            db=db,
            owner_id=current_user.id,
            title=data.title,
            description=data.description,
            location=data.location,
            date=data.date,
            time=data.time,
            endtime=data.endtime,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    invited_summary: list[dict] = []

    # 2) Invitar contactos individuales
    for uid in data.contact_ids or []:
        try:
            inv = invite_user_to_event(db=db, event_id=ev.id, user_id=uid)
        except ValueError:
            continue


        user = get_user_by_id(db, inv.user_id)
        if not user:
            continue

        invited_summary.append(
            {
                "name": user.name,
                "email": user.email,
                "rsvp": inv.status,  
            }
        )

    # 3) Invitar equipos y auto-invitar miembros aceptados
    for tid in data.team_ids or []:
        try:
            invite_team_to_event(db, event_id=ev.id, team_id=tid)
            created_invites = auto_invite_team_members(db, event_id=ev.id, team_id=tid)
        except ValueError:
            continue

        # created_invites son EventInvitation ya recién creadas, status = "pending"
        for inv in created_invites:
            if inv.user_id == ev.owner_id:
                continue

            user = get_user_by_id(db, inv.user_id)
            if not user:
                continue

            invited_summary.append(
                {
                    "name": user.name,
                    "email": user.email,
                    "rsvp": inv.status, 
                }
            )

    return EventOut(
        id=ev.id,
        title=ev.title,
        date=ev.date,
        time=ev.time,
        endtime=ev.endtime,
        location=ev.location,
        description=ev.description,
        event_url=ev.event_url,
        invitees=invited_summary,
    )


@router.post("/events/{event_id}/invite-user", status_code=status.HTTP_201_CREATED)
def invite_user_to_event_route(
    event_id: int,
    data: EventInviteUserRequest,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # 1) Verificar que el evento exista
    event = get_event_by_id(db, event_id)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # 2) Solo el dueño del evento puede invitar
    if event.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only event owner can invite users",
        )

    if data.user_id == current_user.id:
         raise HTTPException(
             status_code=status.HTTP_400_BAD_REQUEST,
             detail="Owner is already part of the event",
        )

    try:
        inv = invite_user_to_event(
            db=db,
            event_id=event_id,
            user_id=data.user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return {
        "id": inv.id,
        "event_id": inv.event_id,
        "user_id": inv.user_id,
        "status": inv.status,
    }


@router.get(
    "/friend-requests/received",
    response_model=list[IncomingFriendRequestOut],
)
def list_received_friend_requests(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # Usa tu helper existente:
    pending = list_pending_received_requests(db, current_user.id)
    results = []

    for c in pending:
        # c.user_id = quien envió la solicitud
        from_user = db.query(User).filter(User.id == c.user_id).first()
        if not from_user:
            continue

        results.append(
            IncomingFriendRequestOut(
                id=c.id,
                status=c.status,
                from_user=from_user, 
            )
        )

    return results

@router.post("/friend-requests/{request_id}/accept")
def accept_friend_request_route(
    request_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    contact = (
        db.query(Contact)
        .filter(Contact.id == request_id, Contact.status == "pending")
        .first()
    )

    if contact is None or contact.contact_id != current_user.id:
        raise HTTPException(status_code=404, detail="Request not found")

    try:
        updated = accept_contact_request(
            db=db,
            user_id=contact.user_id, 
            contact_id=contact.contact_id, 
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "id": updated.id,
        "status": updated.status,
    }


@router.post("/friend-requests/{request_id}/reject")
def reject_friend_request_route(
    request_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    contact = (
        db.query(Contact)
        .filter(Contact.id == request_id, Contact.status == "pending")
        .first()
    )

    if contact is None or contact.contact_id != current_user.id:
        raise HTTPException(status_code=404, detail="Request not found")

    try:
        reject_contact_request(
            db=db,
            user_id=contact.user_id,
            contact_id=contact.contact_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "id": request_id,
        "status": "rejected",
    }

@router.get("/contacts", response_model=list[ContactOut])
def list_my_contacts(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    rows = list_contacts(db, current_user.id)  
    results = []

    for c in rows:
        friend = db.query(User).filter(User.id == c.contact_id).first()
        if not friend:
            continue

        results.append(
            ContactOut(
                id=c.id,
                status=c.status,
                friend=friend,
            )
        )

    return results


@router.delete("/contacts/{contact_user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact_route(
    contact_user_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):

    entry = (
        db.query(Contact)
        .filter(
            Contact.user_id == current_user.id,
            Contact.contact_id == contact_user_id,
        )
        .first()
    )

    if entry is None:
        raise HTTPException(status_code=404, detail="Contact not found")

    try:
        remove_contact(db, user_id=current_user.id, contact_id=contact_user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    return


@router.on_event("startup")
def startup_event():
    try:
        seed_demo_data()
        print("Database seeded successfully!")
    except Exception as e:
        print(f"Seed skipped or failed: {e}")

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

domain = os.getenv("DOMAIN")
secret = os.getenv("SECRET_KEY")

origins = [
    domain,
]
app = FastAPI()

app.add_middleware(SessionMiddleware, secret_key=secret)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(router)

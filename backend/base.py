from datetime import datetime, date, time, timezone
from zoneinfo import ZoneInfo
from datetime import datetime, date, time, timezone,tzinfo
from typing import List
from contextlib import contextmanager
import bcrypt
from secrets import token_urlsafe
import os
from pathlib import Path
from dotenv import load_dotenv

from sqlalchemy import (
    create_engine,
    Column,
    DateTime,
    Date,
    Time,
    ForeignKey,
    Integer,
    String,
    LargeBinary,
    UniqueConstraint,
    or_, 
    and_,
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# -----------------------------------------------------------------------
# DATABASE CONFIG
# -----------------------------------------------------------------------

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

DATABASE_URL = (
    f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

engine = create_engine(DATABASE_URL, echo=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

Base = declarative_base()

# -----------------------------------------------------------------------
# MODELS
# -----------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    password_hash = Column(LargeBinary(60), nullable=False)

    calendar_token = Column(String(64), unique=True, nullable=True)

    timezone = Column(String(64), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(512), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    __table_args__ = (
        UniqueConstraint("owner_id", "name", name="uq_team_owner_name"),
    )


class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True)
    team_id = Column(
        Integer,
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,  
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True, 
    )
    role = Column(String(50), nullable=False, default="member")

    status = Column(String(20), nullable=False, default="pending")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_team_members_team_user"),
    )


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True)
    owner_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title = Column(String(200), nullable=False)
    description = Column(String, nullable=True)
    location = Column(String(255), nullable=True)
    event_url = Column(String(500), nullable=True)

    date = Column(Date, nullable=False)
    time = Column(Time, nullable=False)
    endtime = Column(Time, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class EventInvitation(Base):
    __tablename__ = "event_invitations"

    id = Column(Integer, primary_key=True)
    event_id = Column(
        Integer,
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status = Column(String(20), nullable=False, default="pending")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_event_invitations_event_user"),
    )


class EventInvitesTeam(Base):
    __tablename__ = "event_teams"

    id = Column(Integer, primary_key=True)
    event_id = Column(
        Integer,
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,           
    )
    team_id = Column(
        Integer,
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,          
    )

    status = Column(String(20), nullable=False, default="pending")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("event_id", "team_id", name="uq_event_teams_event_team"),
    )


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,        
    )
    contact_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,        
    )

    status = Column(String(20), nullable=False, default="pending")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "contact_id", name="uq_user_contacts_user_contact"),
    )

# -----------------------------------------------------------------------
# SESSION HANDLING
# -----------------------------------------------------------------------

def get_session():
    db = SessionLocal()
    try:
        yield db
        db.commit()       
    except:
        db.rollback()
        raise
    finally:
        db.close()



@contextmanager
def get_session_cm():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except:
        db.rollback()
        raise
    finally:
        db.close()


# -----------------------------------------------------------------------
# DB CONTROL
# -----------------------------------------------------------------------

def init_db():
    Base.metadata.create_all(bind=engine)

def reset_db():
    Base.metadata.drop_all(bind=engine)  



# -----------------------------------------------------------------------
# CALENDAR TOKEN & EVENTS FOR CALENDAR
# -----------------------------------------------------------------------

def get_or_create_calendar_token(db: Session, user_id: int) -> str:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise ValueError("User not found")

    if user.calendar_token:
        return user.calendar_token

    user.calendar_token = token_urlsafe(32)
    db.add(user)
    db.flush()
    db.refresh(user)
    return user.calendar_token


def get_user_by_calendar_token(db: Session, token: str) -> User | None:
    return db.query(User).filter(User.calendar_token == token).first()


def list_events_for_calendar(db: Session, user_id: int) -> list[Event]:
    events = (
        db.query(Event)
        .outerjoin(EventInvitation, Event.id == EventInvitation.event_id)
        .filter(
            or_(
                Event.owner_id == user_id,
                and_(
                    EventInvitation.user_id == user_id,
                    EventInvitation.status == "accepted"
                )
            )
        )
        .distinct()
        .all()
    )
    return events

# -----------------------------------------------------------------------
# ICS GENERATION
# -----------------------------------------------------------------------

def _combine_date_time(d: date, t: time | None, tz: tzinfo) -> datetime:
    if t is None:
        t = time(0, 0)
    # interpretamos date+time como hora local del usuario
    return datetime(d.year, d.month, d.day, t.hour, t.minute, t.second, tzinfo=tz)


def _format_dt_utc(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt_utc = dt.astimezone(timezone.utc)
    return dt_utc.strftime("%Y%m%dT%H%M%SZ")


def _escape_ics(text: str | None) -> str:
    if not text:
        return ""
    return (
        text.replace("\\", "\\\\")
            .replace(";", "\\;")
            .replace(",", "\\,")
            .replace("\n", "\\n")
    )


def generate_ics_for_events(
    events: list[Event],
    timezone_name: str | None = None,
) -> str:
    # 1) Resolver la zona horaria del usuario
    if timezone_name:
        try:
            local_tz = ZoneInfo(timezone_name)
        except Exception:
            local_tz = timezone.utc
    else:
        local_tz = timezone.utc

    # 2) DTSTAMP siempre en UTC
    now_str = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    lines: list[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//EventEase//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-TIMEZONE:{timezone_name or 'UTC'}",
    ]

    for ev in events:
        start_dt = _combine_date_time(ev.date, ev.time, local_tz)

        if ev.endtime is not None:
            end_dt = _combine_date_time(ev.date, ev.endtime, local_tz)
        else:
            end_dt = start_dt.replace(hour=start_dt.hour + 1)

        uid = f"eventease-{ev.id}@eventease"

        lines.append("BEGIN:VEVENT")
        lines.append(f"UID:{uid}")
        lines.append(f"DTSTAMP:{now_str}")
        lines.append(f"DTSTART:{_format_dt_utc(start_dt)}")
        lines.append(f"DTEND:{_format_dt_utc(end_dt)}")
        lines.append(f"SUMMARY:{_escape_ics(ev.title)}")

        if ev.description:
            lines.append(f"DESCRIPTION:{_escape_ics(ev.description)}")
        if ev.location:
            lines.append(f"LOCATION:{_escape_ics(ev.location)}")

        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"

# -----------------------------------------------------------------------
# HELPERS
# -----------------------------------------------------------------------

def hash_password(plain_password: str) -> bytes:
    """Hash a plain password using bcrypt."""
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt())

def _generate_event_url() -> str:
    token = token_urlsafe(16)
    return f"/invite/{token}"


def search_user_contacts_by_query(db: Session, user_id: int, query: str) -> list[User]:
    if not query:
        return []

    q_like = f"%{query.lower()}%"

    rows = (
        db.query(User)
        .join(Contact, Contact.contact_id == User.id)
        .filter(
            Contact.user_id == user_id,
            Contact.status == "accepted",
            or_(
                User.name.ilike(q_like),
                User.email.ilike(q_like),
            ),
        )
        .limit(20)
        .all()
    )
    return rows


def search_user_teams_by_query(db: Session, user_id: int, query: str) -> list[Team]:
    if not query: return []
    q_like = f"%{query.lower()}%"

    return (
        db.query(Team)
        .outerjoin(TeamMember, Team.id == TeamMember.team_id)
        .filter(
            Team.name.ilike(q_like),
            or_(
                Team.owner_id == user_id,
                and_(TeamMember.user_id == user_id, TeamMember.status == "accepted")
            )
        )
        .distinct()
        .all()
    )


def invite_team_and_members_to_event(db: Session, event_id: int, team_id: int):
    evt_team = invite_team_to_event(db, event_id=event_id, team_id=team_id)

    created_invites = auto_invite_team_members(db, event_id=event_id, team_id=team_id)

    return evt_team, created_invites

# -----------------------------------------------------------------------
# USER FUNCTIONS
# -----------------------------------------------------------------------
def create_user(db: Session, name: str, email: str, password: str) -> User:

    existing = db.query(User).filter(User.email == email).first()
    if existing is not None:
        raise ValueError("Email is already registered")

    password_hash = hash_password(password)

    user = User(
        name=name,
        email=email,
        password_hash=password_hash,
        calendar_token=token_urlsafe(32), 
    )

    db.add(user)
    db.flush()  
    db.refresh(user)

    return user

def verify_user(db: Session, email: str, password: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise ValueError("Invalid email or password")

    if not bcrypt.checkpw(password.encode("utf-8"), user.password_hash):
        raise ValueError("Invalid email or password")

    return user

def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


# -----------------------------------------------------------------------
# TEAM FUNCTIONS
# -----------------------------------------------------------------------

def create_team(db: Session, owner_id: int, name: str, description: str | None = None) -> Team:
    # Ensure owner exists
    owner = db.query(User).filter(User.id == owner_id).first()
    if owner is None:
        raise ValueError("Owner user does not exist")

    existing = db.query(Team).filter(
        Team.owner_id == owner_id,
        Team.name == name
    ).first()

    if existing:
        raise ValueError("Team name already exists")

    team = Team(
        owner_id=owner_id,
        name=name,
        description=description,
    )

    db.add(team)
    db.flush()
    db.refresh(team)

    owner_membership = TeamMember(
        team_id=team.id,
        user_id=owner_id,
        role="owner",     
        status="accepted",
    )
    db.add(owner_membership)
    db.flush()

    return team

def get_team_by_id(db: Session, team_id: int) -> Team | None:
    return db.query(Team).filter(Team.id == team_id).first()

def update_team(db: Session, team_id: int, name: str | None = None, description: str | None = None) -> Team:
    team = db.query(Team).filter(Team.id == team_id).first()
    if team is None:
        raise ValueError("Team not found")

    if name is not None:
        existing = db.query(Team).filter(
        Team.owner_id == team.owner_id,
        Team.name == name,
        Team.id != team_id
        ).first()

        if existing:
            raise ValueError("Team name already exists")
        team.name = name

    if description is not None:
        team.description = description

    db.flush()
    db.refresh(team)
    return team

def delete_team(db: Session, team_id: int) -> None:
    team = db.query(Team).filter(Team.id == team_id).first()
    if team is None:
        raise ValueError("Team not found")

    db.delete(team)

# -----------------------------------------------------------------------
# TEAM MEMBERS FUNCTIONS
# -----------------------------------------------------------------------

def list_pending_team_invites(db: Session, user_id: int):
    return db.query(TeamMember).filter(
        TeamMember.user_id == user_id,
        TeamMember.status == "pending",
    ).all()


def invite_user_to_team(db: Session, team_id: int, user_id: int, role: str = "member") -> TeamMember:
    existing = db.query(TeamMember).filter(
        TeamMember.team_id == team_id,
        TeamMember.user_id == user_id
    ).first()
    if existing:
        raise ValueError("User already invited or already in the team")

    member = TeamMember(
        team_id=team_id,
        user_id=user_id,
        role=role,
        status="pending",
    )

    db.add(member)
    db.flush()
    db.refresh(member)

    return member

def accept_team_invite(db: Session, team_id: int, user_id: int) -> TeamMember:
    member = db.query(TeamMember).filter(
        TeamMember.team_id == team_id,
        TeamMember.user_id == user_id
    ).first()

    if member is None or member.status != "pending":
        raise ValueError("No pending invitation found")

    member.status = "accepted"

    db.flush()
    db.refresh(member)
    return member

def reject_team_invite(db: Session, team_id: int, user_id: int) -> None:
    member = db.query(TeamMember).filter(
        TeamMember.team_id == team_id,
        TeamMember.user_id == user_id
    ).first()

    if member is None or member.status != "pending":
        raise ValueError("No pending invitation found")

    member.status = "rejected"

    db.flush()

def remove_user_from_team(db: Session, team_id: int, user_id: int) -> None:
    member = db.query(TeamMember).filter(
        TeamMember.team_id == team_id,
        TeamMember.user_id == user_id
    ).first()

    if member is None:
        raise ValueError("User is not in this team")

    db.delete(member)

def list_teams_created_by_user(db: Session, owner_id: int) -> list[Team]:
    return (
        db.query(Team)
        .filter(Team.owner_id == owner_id)
        .all()
    )


def list_teams_user_is_in(db: Session, user_id: int) -> list[Team]:
    return (
        db.query(Team)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(
            TeamMember.user_id == user_id,
            TeamMember.status == "accepted",
        )
        .all()
    )

def list_team_members(db: Session, team_id: int):
    return db.query(TeamMember).filter(
        TeamMember.team_id == team_id,
        TeamMember.status == "accepted"
    ).all()

# -----------------------------------------------------------------------
# EVENT FUNCTIONS
# -----------------------------------------------------------------------
def create_event(
    db: Session,
    owner_id: int,
    title: str,
    description: str | None,
    location: str | None,
    date: Date,
    time: Time,
    endtime: Time | None,
    event_url: str | None = None,   
) -> Event:
    owner = db.query(User).filter(User.id == owner_id).first()
    if owner is None:
        raise ValueError("Owner user does not exist")

    if event_url is None:
        event_url = _generate_event_url()

    event = Event(
        owner_id=owner_id,
        title=title,
        description=description,
        location=location,
        event_url=event_url,
        date=date,
        time=time,
        endtime=endtime,
    )

    db.add(event)
    db.flush()
    db.refresh(event)

    return event


def get_event_by_id(db: Session, event_id: int) -> Event | None:
    return db.query(Event).filter(Event.id == event_id).first()

def update_event(
    db: Session,
    event_id: int,
    title: str | None = None,
    description: str | None = None,
    location: str | None = None,
    event_url: str | None = None,
    date: Date | None = None,
    time: Time | None = None,
    endtime: Time | None = None,
) -> Event:
    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise ValueError("Event not found")

    if title is not None:
        event.title = title

    if description is not None:
        event.description = description

    if location is not None:
        event.location = location

    if event_url is not None:
        event.event_url = event_url

    if date is not None:
        event.date = date

    if time is not None:
        event.time = time

    if endtime is not None:
        event.endtime = endtime

    db.flush()
    db.refresh(event)
    return event

def delete_event(db: Session, event_id: int) -> None:
    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise ValueError("Event not found")

    db.delete(event)


def list_events_by_owner(db: Session, owner_id: int):
    return db.query(Event).filter(Event.owner_id == owner_id).all()

def get_event_url(db: Session, event_id: int) -> str | None:
    """
    Return the event URL if it exists.
    """
    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise ValueError("Event not found")

    return event.event_url

# -----------------------------------------------------------------------
# EVENT INVITATION FUNCTIONS
# -----------------------------------------------------------------------

def invite_user_to_event(db: Session, event_id: int, user_id: int) -> EventInvitation:
    existing = db.query(EventInvitation).filter(
        EventInvitation.event_id == event_id,
        EventInvitation.user_id == user_id
    ).first()

    if existing:
        raise ValueError("User already invited to this event")

    invitation = EventInvitation(
        event_id=event_id,
        user_id=user_id,
        status="pending",
    )

    db.add(invitation)
    db.flush()
    db.refresh(invitation)

    return invitation

def accept_event_invite(db: Session, event_id: int, user_id: int) -> EventInvitation:
    invitation = db.query(EventInvitation).filter(
        EventInvitation.event_id == event_id,
        EventInvitation.user_id == user_id
    ).first()

    if invitation is None or invitation.status != "pending":
        raise ValueError("No pending invitation found")

    invitation.status = "accepted"

    db.flush()
    db.refresh(invitation)
    return invitation

def reject_event_invite(db: Session, event_id: int, user_id: int) -> None:
    invitation = db.query(EventInvitation).filter(
        EventInvitation.event_id == event_id,
        EventInvitation.user_id == user_id
    ).first()

    if invitation is None or invitation.status != "pending":
        raise ValueError("No pending invitation found")

    invitation.status = "rejected"

    db.flush()

def list_events_user_is_invited_to(db: Session, user_id: int):
    return db.query(EventInvitation).filter(
        EventInvitation.user_id == user_id
    ).all()

def list_all_invited_users_for_event(db: Session, event_id: int):
    return db.query(EventInvitation).filter(
        EventInvitation.event_id == event_id
    ).all()

# -----------------------------------------------------------------------
# EVENT TEAM INVITATION FUNCTIONS
# -----------------------------------------------------------------------

def invite_team_to_event(db: Session, event_id: int, team_id: int) -> EventInvitesTeam:
    existing = db.query(EventInvitesTeam).filter(
        EventInvitesTeam.event_id == event_id,
        EventInvitesTeam.team_id == team_id
    ).first()

    if existing:
        raise ValueError("Team already invited to this event")

    invite = EventInvitesTeam(
        event_id=event_id,
        team_id=team_id,
        status="pending"
    )

    db.add(invite)
    db.flush()
    db.refresh(invite)

    return invite

def accept_team_event_invite(db: Session, event_id: int, team_id: int) -> EventInvitesTeam:
    invite = db.query(EventInvitesTeam).filter(
        EventInvitesTeam.event_id == event_id,
        EventInvitesTeam.team_id == team_id
    ).first()

    if invite is None or invite.status != "pending":
        raise ValueError("No pending invite found")

    invite.status = "accepted"

    db.flush()
    db.refresh(invite)

    return invite

def reject_team_event_invite(db: Session, event_id: int, team_id: int) -> None:
    invite = db.query(EventInvitesTeam).filter(
        EventInvitesTeam.event_id == event_id,
        EventInvitesTeam.team_id == team_id
    ).first()

    if invite is None or invite.status != "pending":
        raise ValueError("No pending invite found")

    invite.status = "rejected"

    db.flush()

def cancel_team_event_invite(db: Session, event_id: int, team_id: int) -> None:
    invite = db.query(EventInvitesTeam).filter(
        EventInvitesTeam.event_id == event_id,
        EventInvitesTeam.team_id == team_id
    ).first()

    if invite is None:
        raise ValueError("Team is not invited to this event")

    db.delete(invite)

def list_teams_invited_to_event(db: Session, event_id: int):
    return db.query(EventInvitesTeam).filter(
        EventInvitesTeam.event_id == event_id
    ).all()

def auto_invite_team_members(db: Session, event_id: int, team_id: int) -> List[EventInvitation]:
    existing_invitee_ids = {
        row[0] for row in db.query(EventInvitation.user_id)
        .filter(EventInvitation.event_id == event_id).all()
    }

    event = get_event_by_id(db, event_id)
    members_to_invite = (
        db.query(TeamMember.user_id)
        .filter(
            TeamMember.team_id == team_id,
            TeamMember.status == "accepted",
            TeamMember.user_id != event.owner_id,
            TeamMember.user_id.notin_(existing_invitee_ids)
        ).all()
    )

    new_invitations = [
        EventInvitation(event_id=event_id, user_id=m.user_id, status="pending")
        for m in members_to_invite
    ]
    
    db.add_all(new_invitations)
    db.flush()
    return new_invitations

# -----------------------------------------------------------------------
# CONTACT FUNCTIONS
# -----------------------------------------------------------------------


def send_contact_request(db: Session, user_id: int, contact_id: int) -> Contact:
    if user_id == contact_id:
        raise ValueError("Cannot add yourself as a contact")

    existing = db.query(Contact).filter(
        or_(
            and_(Contact.user_id == user_id, Contact.contact_id == contact_id),
            and_(Contact.user_id == contact_id, Contact.contact_id == user_id),
        )
    ).first()

    if existing:
        raise ValueError("Contact request already exists")

    request = Contact(
        user_id=user_id,
        contact_id=contact_id,
        status="pending",
    )

    db.add(request)
    db.flush()
    db.refresh(request)

    return request


def accept_contact_request(db: Session, user_id: int, contact_id: int) -> Contact:
    request = db.query(Contact).filter(
        Contact.user_id == user_id,
        Contact.contact_id == contact_id,
        Contact.status == "pending",
    ).first()

    if request is None:
        raise ValueError("No pending request found")

    request.status = "accepted"

    reverse = db.query(Contact).filter(
        Contact.user_id == contact_id,
        Contact.contact_id == user_id,
    ).first()

    if reverse is None:
        reverse = Contact(
            user_id=contact_id,
            contact_id=user_id,
            status="accepted",
        )
        db.add(reverse)

    db.flush()
    db.refresh(request)

    return request


def reject_contact_request(db: Session, user_id: int, contact_id: int) -> None:
    request = db.query(Contact).filter(
        Contact.user_id == user_id,
        Contact.contact_id == contact_id,
        Contact.status == "pending",
    ).first()

    if request is None:
        raise ValueError("No pending request found")

    request.status = "rejected"
    db.flush()


def remove_contact(db: Session, user_id: int, contact_id: int) -> None:
    entries = db.query(Contact).filter(
        or_(
            and_(Contact.user_id == user_id, Contact.contact_id == contact_id),
            and_(Contact.user_id == contact_id, Contact.contact_id == user_id),
        )
    ).all()

    if not entries:
        raise ValueError("Contact relationship does not exist")

    for entry in entries:
        db.delete(entry)


def list_contacts(db: Session, user_id: int):
    return db.query(Contact).filter(
        Contact.user_id == user_id,
        Contact.status == "accepted",
    ).all()


def list_pending_received_requests(db: Session, user_id: int):
    return db.query(Contact).filter(
        Contact.contact_id == user_id,
        Contact.status == "pending",
    ).all()


# -----------------------------------------------------------------------
# DB MAIN
# -----------------------------------------------------------------------
# -----------------------------------------------------------------------
# DEMO SEED DATA (traducción de initialEvents / initialInvites)
# -----------------------------------------------------------------------

RSVP_TO_STATUS = {
    "pending": "pending",
    "confirmed": "accepted",
    "rejected": "rejected",
}

# -----------------------------------------------------------------------
# DEMO SEED DATA (Abril 2026 - 2028)
# -----------------------------------------------------------------------

initial_events = [
    # --- 2026 ---
    {
        "title": "Lanzamiento Proyecto EventEase",
        "date": "2026-04-20",
        "time": "10:00",
        "location": "Auditorio Principal",
        "description": "Presentación oficial de la plataforma a la facultad.",
        "invitees": [{"name": "Ana", "email": "ana@ejemplo.com", "rsvp": "confirmed"}, {"name": "Luis", "email": "luis@ejemplo.com", "rsvp": "confirmed"}]
    },
    {
        "title": "Examen Final de Redes",
        "date": "2026-05-15",
        "time": "08:00",
        "location": "Laboratorio 4",
        "description": "Evaluación teórica y práctica sobre protocolos de capa de transporte.",
        "invitees": [{"name": "Carlos", "email": "carlos@ejemplo.com", "rsvp": "pending"}]
    },
    {
        "title": "Fiesta de Fin de Semestre",
        "date": "2026-06-12",
        "time": "21:00",
        "location": "Terraza Club",
        "description": "Celebración tras terminar el 8vo semestre. ¡No faltes!",
        "invitees": [{"name": "Valeria", "email": "valeria@ejemplo.com", "rsvp": "confirmed"}, {"name": "Sofía", "email": "sofia@ejemplo.com", "rsvp": "confirmed"}]
    },
    {
        "title": "Curso de Verano: Rust Intermedio",
        "date": "2026-07-05",
        "time": "09:00",
        "location": "Online - Zoom",
        "description": "Profundizando en Lifetimes y Macros.",
        "invitees": [{"name": "Mateo", "email": "mateo@ejemplo.com", "rsvp": "confirmed"}]
    },
    {
        "title": "Hackathon Regional 2026",
        "date": "2026-08-20",
        "time": "18:00",
        "location": "Centro de Convenciones",
        "description": "48 horas de código ininterrumpido.",
        "invitees": [{"name": "Ricardo", "email": "ricardo@ejemplo.com", "rsvp": "confirmed"}]
    },
    {
        "title": "Inicio de Prácticas Profesionales",
        "date": "2026-09-01",
        "time": "08:30",
        "location": "Tech Solutions HQ",
        "description": "Inducción al equipo de desarrollo backend.",
        "invitees": [{"name": "Diana", "email": "diana@ejemplo.com", "rsvp": "confirmed"}]
    },
    {
        "title": "Conferencia DevDays",
        "date": "2026-10-15",
        "time": "14:00",
        "location": "Teatro Municipal",
        "description": "Charlas sobre microservicios y arquitectura limpia.",
        "invitees": [{"name": "Hugo", "email": "hugo@ejemplo.com", "rsvp": "pending"}]
    },
    {
        "title": "Planificación de Tesis",
        "date": "2026-11-10",
        "time": "16:00",
        "location": "Biblioteca Central",
        "description": "Primera reunión con el tutor para definir el alcance.",
        "invitees": [{"name": "Laura", "email": "laura@ejemplo.com", "rsvp": "confirmed"}]
    },
    {
        "title": "Cena de Navidad IT",
        "date": "2026-12-20",
        "time": "20:30",
        "location": "Restaurante El Faro",
        "description": "Cierre de año con los colegas de la oficina.",
        "invitees": [{"name": "Ana", "email": "ana@ejemplo.com", "rsvp": "confirmed"}]
    },
    # --- 2027 ---
    {
        "title": "Entrega de Primer Avance Tesis",
        "date": "2027-01-25",
        "time": "23:59",
        "location": "Plataforma Académica",
        "description": "Capítulos 1 y 2 terminados.",
        "invitees": [{"name": "Profesor Ríos", "email": "rios@ejemplo.com", "rsvp": "pending"}]
    },
    {
        "title": "Carnavales / Descanso",
        "date": "2027-02-15",
        "time": "10:00",
        "location": "Costa Azul",
        "description": "Desconexión total antes del semestre final.",
        "invitees": [{"name": "Andrés", "email": "andres@ejemplo.com", "rsvp": "confirmed"}]
    },
    {
        "title": "Workshop: Kubernetes en Producción",
        "date": "2027-03-22",
        "time": "15:00",
        "location": "Lab de Innovación",
        "description": "Despliegue de clusters escalables.",
        "invitees": [{"name": "Miguel", "email": "miguel@ejemplo.com", "rsvp": "confirmed"}]
    },
    {
        "title": "Simposio de Ciberseguridad",
        "date": "2027-04-12",
        "time": "09:00",
        "location": "Hotel Plaza",
        "description": "Nuevas amenazas en sistemas embebidos.",
        "invitees": [{"name": "Lucía", "email": "lucia@ejemplo.com", "rsvp": "pending"}]
    },
    {
        "title": "Sustentación de Tesis",
        "date": "2027-05-30",
        "time": "11:00",
        "location": "Sala de Grados",
        "description": "Presentación final frente al jurado. ¡Día clave!",
        "invitees": [{"name": "Familia", "email": "familia@ejemplo.com", "rsvp": "confirmed"}]
    },
    {
        "title": "Ceremonia de Graduación",
        "date": "2027-06-25",
        "time": "18:00",
        "location": "Coliseo Universitario",
        "description": "Entrega de diplomas de Ingeniero de Sistemas.",
        "invitees": [{"name": "Ana", "email": "ana@ejemplo.com", "rsvp": "confirmed"}, {"name": "Luis", "email": "luis@ejemplo.com", "rsvp": "confirmed"}]
    },
    {
        "title": "Viaje de Graduados",
        "date": "2027-07-10",
        "time": "06:00",
        "location": "Aeropuerto Int.",
        "description": "Destino: Europa. 20 días recorriendo capitales.",
        "invitees": [{"name": "Pablo", "email": "pablo@ejemplo.com", "rsvp": "confirmed"}]
    },
    {
        "title": "Inicio Master en IA",
        "date": "2027-08-15",
        "time": "19:00",
        "location": "Campus Virtual",
        "description": "Primeras clases de Machine Learning avanzado.",
        "invitees": [{"name": "Mónica", "email": "monica@ejemplo.com", "rsvp": "confirmed"}]
    },
    {
        "title": "Lanzamiento de Startup Personal",
        "date": "2027-09-12",
        "time": "12:00",
        "location": "Coworking Space",
        "description": "Presentación del MVP a inversionistas.",
        "invitees": [{"name": "Julián", "email": "julian@ejemplo.com", "rsvp": "pending"}]
    },
    {
        "title": "Cumpleaños Demo 2027",
        "date": "2027-10-18",
        "time": "20:00",
        "location": "Casa",
        "description": "Celebración íntima con amigos cercanos.",
        "invitees": [{"name": "Tania", "email": "tania@ejemplo.com", "rsvp": "confirmed"}]
    },
    {
        "title": "DevFest 2027",
        "date": "2027-11-05",
        "time": "09:00",
        "location": "Arena Digital",
        "description": "El evento más grande de tecnología del año.",
        "invitees": [{"name": "Elena", "email": "elena@ejemplo.com", "rsvp": "confirmed"}]
    },
    {
        "title": "Retiro de Fin de Año",
        "date": "2027-12-15",
        "time": "08:00",
        "location": "Cabañas de la Montaña",
        "description": "Reflexión sobre el año y metas para 2028.",
        "invitees": [{"name": "Santiago", "email": "santiago@ejemplo.com", "rsvp": "confirmed"}]
    },
    # --- 2028 ---
    {
        "title": "Primer Aniversario de Startup",
        "date": "2028-09-12",
        "time": "19:00",
        "location": "Restaurante Vista",
        "description": "Celebrando un año de operaciones y éxito.",
        "invitees": [{"name": "Todo el equipo", "email": "team@startup.com", "rsvp": "pending"}]
    }
]

initial_invites = [
    {
        "title": "Boda de Ana y Luis",
        "date": "2026-08-28",
        "time": "17:00",
        "location": "Catedral Metropolitana",
        "host": "Ana",
        "rsvp": "pending",
    },
    {
        "title": "Reunión de Ex-alumnos 8vo Sem",
        "date": "2027-04-15",
        "time": "19:00",
        "location": "Bar El Recuerdo",
        "host": "Carlos",
        "rsvp": "confirmed",
    },
    {
        "title": "Lanzamiento Nuevo Producto Apple",
        "date": "2027-09-10",
        "time": "12:00",
        "location": "Online - Watch Party",
        "host": "Tech Community",
        "rsvp": "confirmed",
    },
    {
        "title": "Cena de Gala de Egresados",
        "date": "2028-06-20",
        "time": "21:00",
        "location": "Grand Hotel",
        "host": "Asociación Alumni",
        "rsvp": "pending",
    }
]

def get_or_create_user(db: Session, name: str, email: str, password: str = "demo1234") -> User:
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user
    return create_user(db, name=name, email=email, password=password)


def seed_demo_data():
    """Resetea la DB y la llena con eventos, contactos, equipos e invitaciones de prueba."""
    print("⚠️  Reseteando base de datos...")
    reset_db()
    init_db()

    with get_session_cm() as db:
        # Usuario "actual" (el que verás al loguearte en el frontend)
        current_user = create_user(
            db,
            name="Demo User",
            email="demo@example.com",
            password="demo1234",
        )
        print("👤 Usuario demo:", current_user.id, current_user.email)

        # ---------------------------------------------------------------
        # 1) Eventos creados por el usuario actual (equivalente a initialEvents)
        # ---------------------------------------------------------------
        events_by_title: dict[str, Event] = {}

        for ev in initial_events:
            event = create_event(
                db=db,
                owner_id=current_user.id,
                title=ev["title"],
                description=ev["description"],
                location=ev["location"],
                date=date.fromisoformat(ev["date"]),
                time=time.fromisoformat(ev["time"]),
                endtime=None,
            )

            events_by_title[event.title] = event
            print("📅 Evento creado:", event.id, event.title)

            # Invitados para ese evento
            for inv in ev["invitees"]:
                invited_user = get_or_create_user(
                    db,
                    name=inv["name"],
                    email=inv["email"],
                )

                status_str = RSVP_TO_STATUS[inv["rsvp"]]
                invitation = invite_user_to_event(db, event.id, invited_user.id)
                invitation.status = status_str  # ajustar de pending/accepted/rejected
                print(
                    "  ↳ Invitación:",
                    invited_user.email,
                    "=>",
                    status_str,
                )

        # ---------------------------------------------------------------
        # 2) Eventos donde el usuario actual está invitado (initialInvites)
        #   (ahora sí usando host_user como dueño y los datos correctos)
        # ---------------------------------------------------------------
        for inv_ev in initial_invites:
            # Crea un "host" para cada evento, si no existe
            host_email = f"{inv_ev['host'].lower().replace(' ', '_')}@ejemplo.com"
            host_user = get_or_create_user(
                db,
                name=inv_ev["host"],
                email=host_email,
            )

            event = create_event(
                db=db,
                owner_id=host_user.id,
                title=inv_ev["title"],
                description=f"Invitación de {inv_ev['host']} a {inv_ev['title']}.",
                location=inv_ev["location"],
                date=date.fromisoformat(inv_ev["date"]),
                time=time.fromisoformat(inv_ev["time"]),
                endtime=None,
            )

            status_str = RSVP_TO_STATUS[inv_ev["rsvp"]]
            invitation = invite_user_to_event(db, event.id, current_user.id)
            invitation.status = status_str

            print(
                "📨 Invitación para demo:",
                event.title,
                "host:",
                host_user.email,
                "status:",
                status_str,
            )

        # ---------------------------------------------------------------
        # 3) Contactos: aceptados, pendientes recibidos y pendientes enviados
        #    (para que la pestaña Personas tenga de todo)
        # ---------------------------------------------------------------
        ana = get_or_create_user(db, "Ana", "ana@ejemplo.com")
        luis = get_or_create_user(db, "Luis", "luis@ejemplo.com")
        sofia = get_or_create_user(db, "Sofía", "sofia@ejemplo.com")
        hector = get_or_create_user(db, "Héctor", "hector@ejemplo.com")
        camila = get_or_create_user(db, "Camila", "camila@ejemplo.com")
        maria = get_or_create_user(db, "María", "maria@ejemplo.com")

        # Aceptados: Ana, Luis, Sofía
        for u in (ana, luis, sofia):
            try:
                req = send_contact_request(db, user_id=current_user.id, contact_id=u.id)
                accept_contact_request(db, user_id=current_user.id, contact_id=u.id)
                print("🤝 Contacto aceptado:", current_user.email, "<->", u.email)
            except ValueError as e:
                print("Contact already exists / error:", e)

        # Pendientes recibidos: Héctor -> demo, Camila -> demo
        for u in (hector, camila):
            try:
                send_contact_request(db, user_id=u.id, contact_id=current_user.id)
                print("📥 Solicitud recibida de:", u.email)
            except ValueError as e:
                print("Error creando solicitud recibida:", e)

        # Pendiente enviado: demo -> María
        try:
            send_contact_request(db, user_id=current_user.id, contact_id=maria.id)
            print("📤 Solicitud enviada a:", maria.email)
        except ValueError as e:
            print("Error creando solicitud enviada:", e)

        # ---------------------------------------------------------------
        # 4) Equipos: algunos creados por demo, otros donde demo es miembro
        # ---------------------------------------------------------------
        # Equipo creado por demo para proyectos/universidad
        team_proj = create_team(
            db,
            owner_id=current_user.id,
            name="Equipo Proyecto Sistemas",
            description="Team para coordinar entregas, reuniones y revisiones de proyecto de Sistemas.",
        )
        print("👥 Equipo creado por demo:", team_proj.id, team_proj.name)

        # Miembros de ese equipo (aceptados)
        laura = get_or_create_user(db, "Laura", "laura@ejemplo.com")
        ricardo = get_or_create_user(db, "Ricardo", "ricardo@ejemplo.com")
        diana = get_or_create_user(db, "Diana", "diana@ejemplo.com")

        for member_user in (laura, ricardo, diana):
            try:
                tm = invite_user_to_team(db, team_id=team_proj.id, user_id=member_user.id, role="member")
                tm.status = "accepted"
                print("  ↳ Miembro aceptado en", team_proj.name, ":", member_user.email)
            except ValueError as e:
                print("  ↳ Error agregando miembro:", e)

        # Team donde demo es sólo miembro (no owner) – por ejemplo de observación astronómica
        team_obs_owner = get_or_create_user(db, "María", "maria@ejemplo.com")
        team_obs = create_team(
            db,
            owner_id=team_obs_owner.id,
            name="Astrofoto Crew",
            description="Grupo para coordinar salidas de observación astronómica y fotografía nocturna.",
        )
        print("👥 Equipo externo:", team_obs.id, team_obs.name)

        # Demo invitado y aceptado
        try:
            tm_demo = invite_user_to_team(db, team_id=team_obs.id, user_id=current_user.id, role="member")
            tm_demo.status = "accepted"
            print("  ↳ Demo agregado como miembro a", team_obs.name)
        except ValueError as e:
            print("  ↳ Error invitando demo a", team_obs.name, ":", e)

        # Otros miembros del equipo de astrofoto
        lucia = get_or_create_user(db, "Lucía", "lucia@ejemplo.com")
        hector = get_or_create_user(db, "Héctor", "hector@ejemplo.com")

        for member_user in (lucia, hector):
            try:
                tm = invite_user_to_team(db, team_id=team_obs.id, user_id=member_user.id, role="member")
                tm.status = "accepted"
                print("  ↳ Miembro aceptado en", team_obs.name, ":", member_user.email)
            except ValueError as e:
                print("  ↳ Error agregando miembro:", e)

        # Pendiente de invitación de equipo para demo (para que la pestaña de invites de equipo tenga algo)
        team_hack_owner = get_or_create_user(db, "Andrés", "andres@ejemplo.com")
        team_hack = create_team(
            db,
            owner_id=team_hack_owner.id,
            name="Hacknight Squad",
            description="Equipo para hacknights, mini-hackathons y retos de programación nocturnos.",
        )
        print("👥 Equipo externo (hacknight):", team_hack.id, team_hack.name)

        # Demo con invitación pendiente a Hacknight Squad
        try:
            invite_user_to_team(db, team_id=team_hack.id, user_id=current_user.id, role="member")
            print("  ↳ Invitación pendiente a demo en", team_hack.name)
        except ValueError as e:
            print("  ↳ Error invitando demo a", team_hack.name, ":", e)

        # ---------------------------------------------------------------
        # 5) Invitar equipos a eventos (para probar EventInvitesTeam + auto_invite_team_members)
        # ---------------------------------------------------------------
        hack_event = events_by_title.get("Hacknight universitaria")
        astro_event = events_by_title.get("Observación astronómica")

        if hack_event:
            try:
                evt_team, created_invites = invite_team_and_members_to_event(
                    db,
                    event_id=hack_event.id,
                    team_id=team_proj.id,  # equipo de proyecto demo
                )
                print(
                    f"📌 Equipo '{team_proj.name}' invitado a '{hack_event.title}', "
                    f"{len(created_invites)} invitaciones a miembros generadas."
                )
                # Marcamos la invitación de equipo como aceptada para que luzca más completa
                accept_team_event_invite(db, event_id=hack_event.id, team_id=team_proj.id)
            except ValueError as e:
                print("Error invitando equipo a Hacknight:", e)

        if astro_event:
            try:
                evt_team, created_invites = invite_team_and_members_to_event(
                    db,
                    event_id=astro_event.id,
                    team_id=team_obs.id,  # equipo de astrofoto
                )
                print(
                    f"📌 Equipo '{team_obs.name}' invitado a '{astro_event.title}', "
                    f"{len(created_invites)} invitaciones a miembros generadas."
                )
                # Dejamos esta invitación de equipo como pending para que también se vea ese estado
            except ValueError as e:
                print("Error invitando equipo a Observación astronómica:", e)

        print("✅ Seed de datos demo completado.")



def main():
    seed_demo_data()

if __name__ == "__main__":
    main()

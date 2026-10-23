"""JWT auth: login + current-user + verify + reset endpoints."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend import models
from backend.database import get_db
from backend.schemas import (
    LoginRequest, RegisterRequest, TokenResponse, VerifyEmailRequest,
    ResendVerificationRequest, ForgotPasswordRequest, ResetPasswordRequest,
)
from backend.utils.security import (
    create_access_token, decode_token, verify_password,
    generate_secure_token, hash_token, verify_token, hash_password,
)
from backend.services.email_service import EmailService
from backend.config import get_settings

router = APIRouter()
_bearer = HTTPBearer(auto_error=False)

settings = get_settings()
email_service = EmailService(provider=settings.ENVIRONMENT)

# Rate limits from config
LOGIN_LIMIT = settings.RATE_LIMIT_LOGIN
REFRESH_LIMIT = settings.RATE_LIMIT_REFRESH
RESET_LIMIT = settings.RATE_LIMIT_PASSWORD_RESET
VERIFY_LIMIT = settings.RATE_LIMIT_EMAIL_VERIFICATION



@router.post("/register")
async def register(body: RegisterRequest, db: Session = Depends(get_db)):
    from backend.utils.validators import sanitize_identifier, sanitize_string
    # Strict validation + sanitization
    username = sanitize_identifier(body.username)
    email = sanitize_string(body.email, 255)
    # Check for existing user by username or email (prevent duplicates / user enumeration via generic on one condition only; here both checked)
    existing = db.query(models.User).filter(
        (models.User.username == username) | (models.User.email == email)
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")
    user = models.User(
        username=username,
        email=email,
        password_hash=hash_password(body.password),
        email_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    # Send verification (development console only; marked NOT REAL EMAIL)
    token = generate_secure_token()
    user.email_verification_token_hash = hash_token(token)
    user.email_verification_expires_at = datetime.utcnow() + timedelta(hours=24)
    db.commit()
    email_service.send_verification_email(user.email or user.username, token)
    return {"created": True, "user_id": user.id, "email_verified": False}

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    # Rate limit handled by slowapi dependency injection (see main.py limiter on router)
    user = db.query(models.User).filter(models.User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    if not user.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified")
    token, expires_in = create_access_token(str(user.id))
    return TokenResponse(access_token=token, token_type="bearer", expires_in=expires_in)


@router.post("/refresh")
async def refresh(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)):
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        subject = decode_token(credentials.credentials)
        user_id = int(subject)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    token, expires_in = create_access_token(str(user.id))
    return TokenResponse(access_token=token, token_type="bearer", expires_in=expires_in)


@router.post("/verify-email")
async def verify_email(body: VerifyEmailRequest, db: Session = Depends(get_db)):
    # Find by token hash comparison (secure)
    submitted_hash = hash_token(body.token)
    user = db.query(models.User).filter(
        models.User.email_verification_token_hash == submitted_hash
    ).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    if user.email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already verified")
    if user.email_verification_expires_at and user.email_verification_expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token expired")
    user.email_verified = True
    user.email_verification_token_hash = None
    user.email_verification_expires_at = None
    db.commit()
    return {"verified": True}


@router.post("/resend-verification")
async def resend_verification(body: ResendVerificationRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        (models.User.username == body.identifier) | (models.User.email == body.identifier)
    ).first()
    if not user:
        # Do not reveal existence
        return {"sent": True}
    if user.email_verified:
        return {"sent": True}
    token = generate_secure_token()
    user.email_verification_token_hash = hash_token(token)
    user.email_verification_expires_at = datetime.utcnow() + timedelta(hours=24)
    db.commit()
    email_service.send_verification_email(user.email or user.username, token)
    return {"sent": True}


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        (models.User.username == body.identifier) | (models.User.email == body.identifier)
    ).first()
    if user:
        # Invalidate previous reset tokens for this user
        for old in db.query(models.PasswordResetToken).filter(
            models.PasswordResetToken.user_id == user.id,
            models.PasswordResetToken.used_at == None,
        ).all():
            old.used_at = datetime.now(timezone.utc)
        token = generate_secure_token()
        db.add(models.PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        ))
        db.commit()
        email_service.send_password_reset_email(user.email or user.username, token)
    # Generic response — never reveal existence
    return {"sent": True}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    submitted_hash = hash_token(body.token)
    reset_token = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token_hash == submitted_hash,
        models.PasswordResetToken.used_at == None,
        models.PasswordResetToken.expires_at > datetime.utcnow(),
    ).first()
    if not reset_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    user = db.query(models.User).filter(models.User.id == reset_token.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    user.password_hash = hash_password(body.new_password)
    reset_token.used_at = datetime.now(timezone.utc)
    # Invalidate all existing JWTs by updating a token_version if implemented; here just clear reset
    db.commit()
    return {"reset": True}


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
                     db: Session = Depends(get_db)) -> models.User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        subject = decode_token(credentials.credentials)
        user_id = int(subject)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return user

# Rate-limit decorators applied via router (injected in router definition or per-endpoint)
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)


# Apply rate limits via decorator; use limiter from main.py injection
# Note: slowapi decorator applied to endpoint functions requires limiter instance;
# full integration uses limiter decorated routes in main. Here endpoints reference config.

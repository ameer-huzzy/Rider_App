from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordRequestForm

from . import crud, models
from .database import SessionLocal, engine
from .auth import create_access_token, create_refresh_token, get_current_user

# ================================
# Database init
# ================================
models.Base.metadata.create_all(bind=engine)

app = FastAPI()

# ================================
# CORS
# ================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500"],  # frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================================
# Password hashing
# ================================
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# ================================
# DB Session Dependency
# ================================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ================================
# Rider Endpoints (Open)
# ================================
@app.get("/riders")
def read_riders(db: Session = Depends(get_db)):
    return crud.get_all_riders(db)

@app.get("/riders/search")
def search_riders(query: str, db: Session = Depends(get_db)):
    return crud.search_riders(db, query)

@app.get("/riders/date-range")
def riders_by_date(start: str, end: str, db: Session = Depends(get_db)):
    start_date = datetime.strptime(start, "%Y-%m-%d")
    end_date = datetime.strptime(end, "%Y-%m-%d")
    return crud.get_riders_by_date(db, start_date, end_date)

@app.get("/riders/stats")
def get_rider_stats(db: Session = Depends(get_db)):
    stats = crud.get_payment_stats(db)
    return {
        "total_riders": stats.total_riders or 0,
        "total_hours": stats.total_hours or 0,
        "avg_hours": stats.avg_hours or 0
    }

# ================================
# Auth Routes
# ================================
@app.post("/register")
def register_user(username: str, password: str, role: str, db: Session = Depends(get_db)):
    existing_user = db.query(models.User).filter(models.User.username == username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")

    hashed_pw = hash_password(password)
    new_user = models.User(username=username, password=hashed_pw, role=role)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"message": "User registered successfully", "user_id": new_user.id}

# ✅ Fixed login with role included in JWT
@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()

    if not user or not verify_password(form_data.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    access_token_expires = timedelta(minutes=60)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=access_token_expires
    )

    refresh_token = create_refresh_token(
        data={"sub": user.username, "role": user.role}
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "role": user.role
    }

# ================================
# Protected Routes (Require Login)
# ================================
@app.get("/admin/riders")
def get_all_riders_admin(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    return db.query(models.Riderpayment).all()

@app.get("/my/payments")
def get_my_payments(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(models.Riderpayment).filter(
        models.User.username == current_user["username"]
    ).all()

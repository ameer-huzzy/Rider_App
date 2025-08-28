from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import asc, desc
from sqlalchemy import func
from datetime import datetime, timedelta
from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordRequestForm
import imaplib, email, os
import pandas as pd
import numpy as np

blacklisted_access_tokens = set()
blacklisted_refresh_tokens = set()
from fastapi import Body
from typing import Optional

from . import models
from .database import SessionLocal, engine
from jose import jwt, JWTError
from .auth import JWT_SECRET_KEY,JWT_REFRESH_SECRET_KEY,ALGORITHM, require_role,create_access_token, create_refresh_token, get_current_user

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
    allow_origins=["https://rider-web-app.onrender.com"],
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
    log_action(db, user.username, "login")
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
   current_user: dict = Depends(require_role("admin")),
   order: str = "asc", 
   start_date: str = None,
   end_date: str = None, 
   db: Session = Depends(get_db)
):
    query = db.query(models.Riderpayment)
     # 📅 Date Range
    if start_date and end_date:
        try:
            start = datetime.strptime(start_date, "%Y-%m-%d")
            end = datetime.strptime(end_date, "%Y-%m-%d")
            query = query.filter(models.Riderpayment.imported_at.between(start, end))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")

    if order == "asc":
        query = query.order_by(asc(models.Riderpayment.sno))
    elif order == "desc":
        query = query.order_by(desc(models.Riderpayment.sno))
    else:
        raise HTTPException(status_code=400, detail="Invalid order parameter")

    return query.all()

@app.get("/my/payments")
def get_my_payments(
    current_user: dict = Depends(require_role("user")),
    db: Session = Depends(get_db)
):
    return db.query(models.Riderpayment).filter(
        models.Riderpayment.name.ilike(f"%{current_user['username']}%")
    ).all()


@app.post("/logout")
def logout(
    access_token: str = Body(..., embed=True),
    refresh_token: str = Body(..., embed=True),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Blacklist tokens
    blacklisted_access_tokens.add(access_token)
    blacklisted_refresh_tokens.add(refresh_token)

    # Save audit log
    new_log = models.AuditLog(
        username=current_user["username"],
        action="logout"
    )
    db.add(new_log)
    db.commit()

    return {"message": f"User {current_user['username']} logged out successfully"}


@app.post("/refresh")
def refresh_token(
    refresh_token: str = Body(..., embed=True),
    db: Session = Depends(get_db)
):

    if refresh_token in blacklisted_refresh_tokens:
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")


    try:
        payload = jwt.decode(refresh_token, JWT_REFRESH_SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")

        if username is None or role is None:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        # create new access token
        access_token_expires = timedelta(minutes=60)
        new_access_token = create_access_token(
            data={"sub": username, "role": role},
            expires_delta=access_token_expires
        )

        return {
            "access_token": new_access_token,
            "token_type": "bearer",
            "role": role   # ✅ Added role in response
        }

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    


@app.post("/reset-password")
def reset_password(
    token: str = Body(..., embed=True),
    new_password: str = Body(..., embed=True),
    db: Session = Depends(get_db)
):
    try:
        # Decode reset token
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")

        if username is None:
            raise HTTPException(status_code=401, detail="Invalid reset token")

        # Find user in DB
        user = db.query(models.User).filter(models.User.username == username).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Hash & update new password
        hashed_pw = hash_password(new_password)
        user.password = hashed_pw
        db.commit()
        log_action(db, user.username, "reset_password")
        return {"message": "Password reset successful"}

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired reset token")


@app.post("/generate-reset-token")
def generate_reset_token(username: str = Body(..., embed=True), db: Session = Depends(get_db)):
    # Check if user exists
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Create a short-lived reset token (e.g., 15 minutes)
    from .auth import create_access_token
    reset_token = create_access_token(
        data={"sub": user.username},
        expires_delta=timedelta(minutes=15)
    )

    return {"reset_token": reset_token}


@app.get("/profile")
def get_profile(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == current_user["username"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "created_at": user.created_at if hasattr(user, "created_at") else None
    }


@app.put("/profile/update-password")
def update_password(
    request: models.UpdatePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.username == current_user["username"]).first()
    if not user or not verify_password(request.old_password, user.password):
        raise HTTPException(status_code=401, detail="Old password is incorrect")

    user.password = hash_password(request.new_password)
    db.commit()
     # Log this action in AuditLog
    log = models.AuditLog(
        username=current_user["username"],
        action=f"Updated password for user {current_user['username']}"
    )
    db.add(log)
    db.commit()
    return {"message": "Password updated successfully"}


@app.put("/admin/update-user")
def admin_update_user(
    request: models.AdminUpdateUserRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    user = db.query(models.User).filter(models.User.username == request.username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = request.role
    db.commit()
     # Log this action in AuditLog
    log = models.AuditLog(
        username=current_user["username"],
        action=f"User {request.username} updated to role {request.role}"
    )
    db.add(log)
    db.commit()
    return {"message": f"User {request.username} updated to role {request.role}"}


@app.delete("/admin/delete-user/{username}")
def delete_user(
    username: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):  
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()
     # Log this action in AuditLog
    log = models.AuditLog(
        username=current_user["username"],
        action=f"User {username} deleted by admin"
    )
    db.add(log)
    db.commit()
    return {"message": f"User {username} deleted successfully"}


@app.get("/admin/users")
def list_all_users(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):  
     # Log this action in AuditLog
    log = models.AuditLog(
        username=current_user["username"],
        action="Viewed Admin Panel"
    )
    db.add(log)
    db.commit()
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    users = db.query(models.User).all()
    return [{"id": u.id, "username": u.username, "role": u.role , "created_at": u.created_at} for u in users]


def log_action(db: Session, username: str, action: str):
    log = models.AuditLog(username=username, action=action)
    db.add(log)
    db.commit()

@app.get("/admin/logs")
def get_audit_logs(
    username: Optional[str] = None,
    action: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    skip: int = 0,          # 🔹 offset
    limit: int = 10,        # 🔹 number of logs per page
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    query = db.query(models.AuditLog)

# 🔹 Apply filters
    if username:
        query = query.filter(models.AuditLog.username.ilike(f"%{username}%"))
    if action:
        query = query.filter(models.AuditLog.action.ilike(f"%{action}%"))
    if start_date and end_date:
        query = query.filter(
            models.AuditLog.timestamp.between(start_date, end_date)
        )

       # 🔹 Apply pagination
    logs = query.order_by(models.AuditLog.timestamp.desc()).offset(skip).limit(limit).all()

    return {
        "skip": skip,
        "limit": limit,
        "logs": logs
    }


@app.get("/me")
def read_current_user(current_user: dict = Depends(get_current_user)):
    return {
        "username": current_user["username"],
        "role": current_user["role"]
    }


@app.get("/dashboard/stats")
def dashboard_stats(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Log this action in AuditLog
    log = models.AuditLog(
        username=current_user["username"],
        action="Viewed Dashboard Stats"
    )
    db.add(log)
    db.commit()

    if current_user["role"] == "admin":
        # 📊 Admin sees global stats
        total_riders = db.query(func.count(models.Riderpayment.sno)).scalar()
        total_hours = db.query(func.sum(models.Riderpayment.total_working_hours)).scalar() or 0
        avg_hours = db.query(func.avg(models.Riderpayment.total_working_hours)).scalar() or 0

        return {
            "role": "admin",
            "total_riders": total_riders,
            "total_hours": total_hours,
            "avg_hours": avg_hours
        }

    else:
        # 👤 User sees only their own stats
        total_hours = db.query(func.sum(models.Riderpayment.total_working_hours)).filter(
            models.Riderpayment.name.ilike(f"%{current_user['username']}%")
        ).scalar() or 0

        avg_hours = db.query(func.avg(models.Riderpayment.total_working_hours)).filter(
            models.Riderpayment.name.ilike(f"%{current_user['username']}%")
        ).scalar() or 0

        return {
            "role": "user",
            "username": current_user["username"],
            "total_hours": total_hours,
            "avg_hours": avg_hours
        }

@app.post("/import-data")
def import_data(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    try:
        # 1. Connect to Gmail IMAP
        mail = imaplib.IMAP4_SSL("imap.gmail.com")
        mail.login("riderapp10@gmail.com", "bkeu cddl qrns dnwg")
        mail.select("inbox")

        # 2. Get latest email with attachment
        result, data = mail.search(None, "ALL")
        if result != "OK" or not data[0]:
            raise HTTPException(status_code=404, detail="No emails found")

        mail_ids = data[0].split()
        latest_email_id = mail_ids[-1]

        result, data = mail.fetch(latest_email_id, "(RFC822)")
        raw_email = data[0][1]
        msg = email.message_from_bytes(raw_email)

        # 3. Extract Excel attachment
        file_path = None
        for part in msg.walk():
            if part.get_content_maintype() == "multipart":
                continue
            if part.get("Content-Disposition") is None:
                continue
            filename = part.get_filename()
            if filename and filename.endswith(".xlsx"):
                file_path = filename
                with open(file_path, "wb") as f:
                    f.write(part.get_payload(decode=True))
                break

        if not file_path:
            raise HTTPException(status_code=404, detail="No Excel attachment found")

        # 4. Check if this file has already been imported
        existing = db.query(models.Riderpayment).filter(
            models.Riderpayment.filename == file_path
        ).first()

        if existing:
            # print("Already imported file:", file_path)
            return {"message": f"⚠️ File '{file_path}' was already imported."}
        

        # 5. Read Excel
        df = pd.read_excel(
            file_path,
            header=1,
            dtype={
                "Person Code": str,
                "Careem Captain ID.": str,
                "Card No": str
            }
        )

        # Clean headers
        df.columns = (
            df.columns.astype(str)
                      .str.replace("\n", " ", regex=True)
                      .str.replace("\r", " ", regex=True)
                      .str.replace("\xa0", " ", regex=True)
                      .str.strip()
                      .str.replace(" +", " ", regex=True)
        )

        df = df.dropna(how="all")
        if "Name" in df.columns:
            df = df[df["Name"].astype(str) != "Grand Total"]

        # Add timestamp
        import_timestamp = datetime.utcnow()
        df["imported_at"] = import_timestamp

        # Rename columns
        column_mapping = {
            "Careem Captain ID.": "careem_captain_id",
            "Person Code": "person_code",
            "Card No": "card_no",
            "Designation": "designation",
            "DOJ": "doj",
            "Name": "name",
            "Total Working Hours": "total_working_hours",
            "No. of days": "no_of_days",
            "Total orders": "total_orders",
            "Actual Order pay": "actual_order_pay",
            "Total Excess pay (Bonus & Dist. pay)": "total_excess_pay_bonus_and_dist_pay",
            "Gross Pay": "gross_pay",
            "Total COD {Cash on Delivery}": "total_cod_cash_on_delivery",
            "Vendor Fee": "vendor_fee",
            "Traffic fine": "traffic_fine",
            "Loan, Sal.Adv, OS fine": "loan_saladv_os_fine",
            "Training Fee": "training_fee",
            "Net Salary": "net_salary",
            "Remarks": "remarks"
        }
        df = df.rename(columns=column_mapping)

        if "sno" in df.columns:
            df = df.drop(columns=["sno"])

        if "doj" in df.columns:
            df["doj"] = pd.to_datetime(df["doj"], errors="coerce")
            df["doj"] = df["doj"].where(df["doj"].notna(), None)

        for col in ["careem_captain_id", "person_code"]:
            if col in df.columns:
                df[col] = df[col].apply(
                    lambda x: str(int(x)) if pd.notnull(x) and str(x).endswith(".0")
                    else (str(x).strip() if pd.notnull(x) else None)
                )

        df = df[df["name"].notna()]
        df = df.replace([pd.NA, pd.NaT, np.nan, np.inf, -np.inf], None)

        # 6. Insert rows
        inserted_rows = 0
        for _, row in df.iterrows():
            record = models.Riderpayment(
                careem_captain_id=row.get("careem_captain_id"),
                person_code=row.get("person_code"),
                card_no=row.get("card_no"),
                designation=row.get("designation"),
                doj=row.get("doj") if row.get("doj") else None,
                name=row.get("name"),
                total_working_hours=row.get("total_working_hours"),
                no_of_days=row.get("no_of_days"),
                total_orders=row.get("total_orders"),
                actual_order_pay=row.get("actual_order_pay"),
                total_excess_pay_bonus_and_dist_pay=row.get("total_excess_pay_bonus_and_dist_pay"),
                gross_pay=row.get("gross_pay"),
                total_cod_cash_on_delivery=row.get("total_cod_cash_on_delivery"),
                vendor_fee=row.get("vendor_fee"),
                traffic_fine=row.get("traffic_fine"),
                loan_saladv_os_fine=row.get("loan_saladv_os_fine"),
                training_fee=row.get("training_fee"),
                net_salary=row.get("net_salary"),
                remarks=row.get("remarks"),
                imported_at=import_timestamp,
                filename=file_path  # ✅ store filename
            )
            db.add(record)
            inserted_rows += 1

        db.commit()
        return {"message": f"✅ Imported {inserted_rows} rows from '{file_path}' at {import_timestamp}"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from sqlalchemy import Column, Integer, String, Float, DateTime,func
from .database import Base
from pydantic import BaseModel

class Riderpayment(Base):
    __tablename__ = "payroll_june_2025"  # same table

    sno = Column(Integer, primary_key=True, index=True, autoincrement=True)
    careem_captain_id = Column(String, index=True)
    person_code = Column(String)
    card_no = Column(String)
    designation = Column(String)
    doj = Column(DateTime)
    name = Column(String)
    total_working_hours = Column(Integer)
    no_of_days = Column(Integer)
    total_orders = Column(Integer)
    actual_order_pay = Column(Float)
    total_excess_pay_bonus_and_dist_pay = Column(Float)
    gross_pay = Column(Float)
    total_cod_cash_on_delivery = Column(Integer)
    vendor_fee = Column(Float)
    traffic_fine = Column(Float)
    loan_saladv_os_fine = Column(Float)  # fixed name (no commas in Python vars)
    training_fee = Column(Float)
    net_salary = Column(Float)
    remarks = Column(String)
    filename = Column(String, unique=True, index=True, nullable=True)


    # ✅ New column for tracking imports
    imported_at = Column(DateTime, default=func.now())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=False)  # Will store hashed password later
    role = Column(String, nullable=False)      # 'admin' or 'regular'
    created_at = Column(DateTime, default=func.now())

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True)
    action = Column(String, index=True)
    timestamp = Column(DateTime, default=func.now())


class UpdatePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class AdminUpdateUserRequest(BaseModel):
    username: str
    role: str



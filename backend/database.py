from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# ⚡ Best practice: use environment variables instead of hardcoding
DB_USER = "careem"
DB_PASSWORD = "4mfv9P5bDJNjcLgPPM9apZugbnbdUO2g"  # put real password here
DB_HOST = "dpg-d3eb46hr0fns73b8j1d0-a"
DB_PORT = "5432"
DB_NAME = "careem_payroll"

DATABASE_URL = "postgresql://careem:4mfv9P5bDJNjcLgPPM9apZugbnbdUO2g@dpg-d3eb46hr0fns73b8j1d0-a.singapore-postgres.render.com/careem_payroll_2025_0nzn"

engine = create_engine(
    DATABASE_URL,
    pool_size=10,        # good for Supabase pooling
    max_overflow=20,     # allow extra connections
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

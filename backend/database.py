from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Replace these with your actual PostgreSQL credentials
DB_NAME = "careem_payroll"
DB_USER = "careem"
DB_PASSWORD = "EkJt9wHkwbAuE8ju34GiNEz8t9QNdqaW"
DB_HOST = "dpg-d2nj2g0dl3ps73cq0550-a.singapore-postgres.render.com"
DB_PORT = "5432"

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

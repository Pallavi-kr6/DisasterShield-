import os
from sqlalchemy import create_engine, Column, Integer, Float, String, Boolean, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

# -----------------------------
# Database Path
# -----------------------------

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, "disastershield.db")

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

# -----------------------------
# Engine & Session
# -----------------------------

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# -----------------------------
# Database Table
# -----------------------------

class PayoutRecord(Base):
    __tablename__ = "payout_records"

    id          = Column(Integer, primary_key=True, index=True)
    worker_id   = Column(String)
    city        = Column(String)
    risk_score  = Column(Float)
    income_loss = Column(Float)
    fraud_flag  = Column(Boolean)
    payout      = Column(Float)
    status      = Column(String)
    created_at  = Column(DateTime, default=datetime.utcnow)

# -----------------------------
# Initialize DB
# -----------------------------

def init_db():
    Base.metadata.create_all(bind=engine)

# -----------------------------
# Save Prediction (called from main.py)
# -----------------------------

def save_prediction(worker_id, city, risk_score, income_loss, payout, status):
    db = SessionLocal()
    try:
        record = PayoutRecord(
            worker_id   = worker_id,
            city        = city,
            risk_score  = risk_score,
            income_loss = income_loss,
            fraud_flag  = (status == "rejected"),
            payout      = payout,
            status      = status,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()

# -----------------------------
# Get All Records (for Dashboard)
# -----------------------------

def get_all_records():
    db = SessionLocal()
    try:
        return db.query(PayoutRecord).order_by(PayoutRecord.id.desc()).all()
    finally:
        db.close()
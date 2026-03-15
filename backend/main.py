from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from model_loader import (
    predict_risk,
    predict_income_loss,
    detect_fraud,
    detect_anomaly,
    encode_city
)

from database import save_prediction, get_all_records, init_db

# ----------------------------
# Environment Config
# ----------------------------

SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key")
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 60 * 8

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173"
).split(",")

# ----------------------------
# App Init
# ----------------------------

app = FastAPI(title="DisasterShield API")

init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# ----------------------------
# Auth Helpers
# ----------------------------

def create_token(username: str):
    expire = datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES)

    payload = {
        "sub": username,
        "exp": expire
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        username = payload.get("sub")

        if username != ADMIN_USERNAME:
            raise HTTPException(status_code=401, detail="Invalid token")

        return username

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ----------------------------
# Request Schema
# ----------------------------

class WorkerData(BaseModel):
    worker_id: str
    city: str
    daily_income: float
    disaster_severity: float
    days_affected: int


# ----------------------------
# Routes
# ----------------------------

@app.get("/")
def home():
    return {"message": "DisasterShield API Running"}


# ----------------------------
# Login
# ----------------------------

@app.post("/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends()):

    if form.username != ADMIN_USERNAME or form.password != ADMIN_PASSWORD:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    token = create_token(form.username)

    return {
        "access_token": token,
        "token_type": "bearer"
    }


# ----------------------------
# Get Records
# ----------------------------

@app.get("/records")
def get_records(user: str = Depends(get_current_user)):
    return get_all_records()


# ----------------------------
# Predict Payout
# ----------------------------

@app.post("/predict-payout")
def predict_payout(data: WorkerData, user: str = Depends(get_current_user)):

    try:
        city_encoded = encode_city(data.city)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="City not supported by model"
        )

    base_features = [
        city_encoded,
        data.daily_income,
        data.disaster_severity,
        data.days_affected
    ]

    try:
        risk_score = float(predict_risk(base_features))
        income_loss = float(predict_income_loss(base_features))
        fraud_flag = int(detect_fraud(base_features))
        anomaly_flag = int(detect_anomaly(base_features))

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Model prediction error: {str(e)}"
        )

    # Fraud / anomaly detection
    if fraud_flag == 1 or anomaly_flag == -1:

        save_prediction(
            data.worker_id,
            data.city,
            risk_score,
            income_loss,
            0,
            "rejected"
        )

        return {
            "worker_id": data.worker_id,
            "status": "rejected",
            "reason": "Fraud or anomaly detected"
        }

    payout = income_loss * risk_score

    save_prediction(
        data.worker_id,
        data.city,
        risk_score,
        income_loss,
        payout,
        "approved"
    )

    return {
        "worker_id": data.worker_id,
        "city": data.city,
        "risk_score": round(risk_score, 3),
        "predicted_income_loss": round(income_loss, 2),
        "payout_amount": round(payout, 2),
        "status": "approved"
    }
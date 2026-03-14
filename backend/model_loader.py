import joblib
import os
import numpy as np

# -----------------------------
# Get project root directory
# -----------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Path to models folder
MODEL_PATH = os.path.join(BASE_DIR, "models")

print("Loading ML models...")

# -----------------------------
# Load ML Models
# -----------------------------
risk_model       = joblib.load(os.path.join(MODEL_PATH, "risk_model.pkl"))
income_loss_model = joblib.load(os.path.join(MODEL_PATH, "income_loss_model.pkl"))
fraud_model      = joblib.load(os.path.join(MODEL_PATH, "fraud_model.pkl"))
isolation_model  = joblib.load(os.path.join(MODEL_PATH, "isolation_forest.pkl"))

# -----------------------------
# Load Scalers
# -----------------------------
anomaly_scaler = joblib.load(os.path.join(MODEL_PATH, "anomaly_scaler.pkl"))
fraud_scaler   = joblib.load(os.path.join(MODEL_PATH, "fraud_scaler.pkl"))

# -----------------------------
# Load Encoders
# -----------------------------
city_label_encoder = joblib.load(os.path.join(MODEL_PATH, "city_label_encoder.pkl"))
city_income_encoder = joblib.load(os.path.join(MODEL_PATH, "city_le_income.pkl"))

print("All models loaded successfully!")

# Print supported cities so you know what to enter
try:
    print("Supported cities:", list(city_label_encoder.classes_))
except:
    pass


# -----------------------------
# Helper Function
# -----------------------------
def prepare_features(base_features, model):
    required = model.n_features_in_
    features = base_features.copy()
    if len(features) < required:
        features += [0] * (required - len(features))
    if len(features) > required:
        features = features[:required]
    return np.array([features])


# -----------------------------
# Prediction Functions
# -----------------------------
def predict_risk(base_features):
    features = prepare_features(base_features, risk_model)
    return risk_model.predict(features)[0]


def predict_income_loss(base_features):
    features = prepare_features(base_features, income_loss_model)
    return income_loss_model.predict(features)[0]


def detect_fraud(base_features):
    # ✅ Scale features before fraud detection
    features = prepare_features(base_features, fraud_model)
    try:
        n = fraud_scaler.n_features_in_
        f = base_features.copy()
        if len(f) < n:
            f += [0] * (n - len(f))
        f = f[:n]
        scaled = fraud_scaler.transform([f])
        return fraud_model.predict(scaled)[0]
    except:
        return fraud_model.predict(features)[0]


def detect_anomaly(base_features):
    # ✅ Scale features before anomaly detection
    features = prepare_features(base_features, isolation_model)
    try:
        n = anomaly_scaler.n_features_in_
        f = base_features.copy()
        if len(f) < n:
            f += [0] * (n - len(f))
        f = f[:n]
        scaled = anomaly_scaler.transform([f])
        return isolation_model.predict(scaled)[0]
    except:
        return isolation_model.predict(features)[0]


# -----------------------------
# Encode City
# -----------------------------
def encode_city(city_name):
    return city_label_encoder.transform([city_name])[0]
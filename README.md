Got it — you want a **serious, professional, crystal-clear README** that feels human-written and hard to reject. I’ll rewrite it with strong structure, clarity, and depth (no emojis, no fluff, no AI tone).

---

# DisasterShield

## AI-Powered Disaster Compensation and Fraud Detection System

DisasterShield is a full-stack web application designed to automate and improve the process of compensating workers affected by natural disasters. The system leverages machine learning to estimate financial loss, assess disaster risk, and detect fraudulent or anomalous claims before approving payouts.

The goal of this project is to provide a transparent, scalable, and intelligent alternative to traditional manual compensation systems, which are often slow, error-prone, and vulnerable to misuse.

---

## Problem Statement

In disaster scenarios, governments and organizations face three major challenges:

1. **Accurate loss estimation** — Manual evaluation of financial damage is inconsistent and time-consuming.
2. **Fraudulent claims** — Systems are often exploited due to lack of validation mechanisms.
3. **Delayed payouts** — Victims do not receive timely compensation due to bureaucratic delays.

DisasterShield addresses these issues by combining machine learning models with a real-time web dashboard to automate decision-making and ensure fair compensation.

---

## Key Features

### Authentication System

* Secure admin login using JWT-based authentication
* Token validity of 8 hours
* Protected API routes to prevent unauthorized access

### Machine Learning Integration

* Predicts disaster risk score based on input parameters
* Estimates income loss using trained regression models
* Ensures data-driven decision-making instead of manual guesswork

### Fraud and Anomaly Detection

* Classification model identifies potentially fraudulent claims
* Isolation Forest detects abnormal or inconsistent inputs
* Claims flagged as suspicious are automatically rejected

### Automated Payout Calculation

* Compensation is calculated using a deterministic formula
* Eliminates manual bias and ensures consistency

### Interactive Dashboard

* Real-time visualization of claims and payouts
* Includes charts such as:

  * Distribution of approved vs rejected claims
  * Payout trends over time
  * City-wise analytics

### Persistent Data Storage

* All claims and predictions are stored in a database
* Enables auditability and historical tracking

---

## System Architecture Overview

The system follows a clear separation of concerns:

* **Frontend (React + Vite)** handles user interaction and visualization
* **Backend (FastAPI)** processes requests, performs authentication, and integrates ML models
* **Database (SQLite)** stores all records
* **Machine Learning Models** handle prediction, fraud detection, and anomaly detection

### Flow of Execution

1. Admin logs into the system
2. Inputs claim data (worker details, disaster impact)
3. Backend processes the input:

   * Encodes categorical features
   * Scales numerical values
   * Runs prediction models
4. Fraud and anomaly checks are applied
5. If valid:

   * Payout is calculated
   * Record is stored in database
6. Results are displayed on dashboard

---

## Tech Stack

| Layer            | Technology             |
| ---------------- | ---------------------- |
| Frontend         | React (Vite), Recharts |
| Backend          | FastAPI (Python)       |
| Database         |vSupabase   |
| Machine Learning | scikit-learn           |
| Authentication   | JWT (python-jose)      |
| Deployment       | Render                 |

---

## Project Structure

```
DisasterShield/
│
├── backend/
│   ├── main.py              # FastAPI application and API routes
│   ├── database.py          # Database models and connection setup
│   ├── model_loader.py      # Loads ML models and runs predictions
│   ├── payout_engine.py     # Business logic for payout calculation
│   └── requirements.txt     # Backend dependencies
│
├── frontend/
│   └── src/
│       ├── App.jsx          # Main application entry point
│       └── Pages/
│           ├── Login.jsx    # Authentication UI
│           └── Dashboard.jsx# Dashboard and analytics UI
│
├── models/
│   ├── risk_model.pkl
│   ├── income_loss_model.pkl
│   ├── fraud_model.pkl
│   ├── isolation_forest.pkl
│   ├── anomaly_scaler.pkl
│   ├── fraud_scaler.pkl
│   ├── city_label_encoder.pkl
│   ├── city_le_income.pkl
│   └── predict.py
│
└── render.yaml             # Deployment configuration
```

---

## Machine Learning Models Explained

### Risk Prediction Model

* Type: RandomForestRegressor
* Output: Risk score between 0 and 1
* Purpose: Measures severity of disaster impact

### Income Loss Model

* Type: RandomForestRegressor
* Output: Estimated financial loss
* Purpose: Calculates expected earnings lost due to disruption

### Fraud Detection Model

* Type: Classification model
* Output: 0 (valid) or 1 (fraud)
* Purpose: Identifies suspicious claims

### Anomaly Detection Model

* Type: Isolation Forest
* Output: 1 (normal), -1 (anomaly)
* Purpose: Detects unusual input patterns

---

## Supported Input Parameters

| Field             | Description        |
| ----------------- | ------------------ |
| Worker ID         | Unique identifier  |
| City              | Location of worker |
| Daily Income      | Earnings per day   |
| Disaster Severity | Scale from 0 to 10 |
| Days Affected     | Duration of impact |

### Supported Cities

* Bangalore
* Chennai
* Delhi
* Hyderabad
* Mumbai

---

## Payout Logic

The payout is calculated using:

```
payout = predicted_income_loss × risk_score
```

### Rejection Conditions

A claim is rejected if:

* Fraud model output = 1
* Isolation Forest output = -1

This ensures only valid claims are processed.

---

## API Documentation

### Public Endpoints

| Method | Endpoint      | Description       |
| ------ | ------------- | ----------------- |
| GET    | `/`           | Health check      |
| POST   | `/auth/login` | Returns JWT token |

### Protected Endpoints

| Method | Endpoint          | Description                           |
| ------ | ----------------- | ------------------------------------- |
| POST   | `/predict-payout` | Runs prediction and calculates payout |
| GET    | `/records`        | Fetches all stored claims             |

---

## Local Setup Guide

### Prerequisites

* Python 3.11 or higher
* Node.js 18 or higher

---

### Step 1: Clone Repository

```bash
git clone https://github.com/Pallavi-kr6/DisasterShield.git
cd DisasterShield
```

---

### Step 2: Backend Setup

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

Backend will run at:

```
http://127.0.0.1:8080
```

API documentation:

```
http://127.0.0.1:8080/docs
```

---

### Step 3: Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend will run at:

```
http://localhost:5173
```

---

## Authentication Credentials

| Field    | Value    |
| -------- | -------- |
| Username | admin    |
| Password | admin123 |

---

## Deployment Instructions (Render)

### Backend Service

* Root Directory: `backend`
* Build Command:

  ```
  pip install -r requirements.txt
  ```
* Start Command:

  ```
  uvicorn main:app --host 0.0.0.0 --port $PORT
  ```

---

### Frontend Deployment

* Root Directory: `frontend`
* Build Command:

  ```
  npm install && npm run build
  ```
* Publish Directory:

  ```
  dist
  ```

### Environment Variable

```
VITE_API_URL = <backend-url>
```

---

## Design Decisions

* **FastAPI** chosen for high performance and easy API documentation
* **SQLite** used for simplicity and portability
* **Random Forest models** selected for robustness and interpretability
* **Isolation Forest** used for unsupervised anomaly detection
* **JWT authentication** ensures stateless and scalable security

---

## Future Improvements

* Role-based access control (multiple admin roles)
* Integration with real disaster datasets
* Mobile-responsive UI enhancements
* Support for more cities and dynamic data sources
* Cloud database (PostgreSQL) for scalability

---
Screenshots
This section showcases the core interfaces of the application.

Login Page

![Login Page](./screenshots/login.png)
Dashboard

 
Prediction Form

Payout Result

 
Payout History

 
 
 

 
## Conclusion

DisasterShield demonstrates how machine learning can be integrated into real-world systems to improve fairness, efficiency, and transparency. It replaces manual, error-prone processes with a structured, automated pipeline that ensures only legitimate claims are approved and compensated accurately.

---

If you want, I can next:

* Make this **GitHub-perfect (badges, screenshots, demo section)**
* Add **architecture diagram (very useful for judges)**
* Or turn this into a **hackathon-winning pitch + README combo**

Just tell me.

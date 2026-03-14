
import pickle
import pandas as pd
import numpy as np
import os
import warnings
warnings.filterwarnings('ignore')



def load_models(folder_path):
    global risk_model, income_model, fraud_model
    global le, fraud_scaler

    with open(os.path.join(folder_path, 'risk_model.pkl'), 'rb') as f:
        risk_model = pickle.load(f)
    with open(os.path.join(folder_path, 'income_loss_model.pkl'), 'rb') as f:
        income_model = pickle.load(f)
    with open(os.path.join(folder_path, 'fraud_model.pkl'), 'rb') as f:
        fraud_model = pickle.load(f)
    with open(os.path.join(folder_path, 'city_label_encoder.pkl'), 'rb') as f:
        le = pickle.load(f)
    with open(os.path.join(folder_path, 'fraud_scaler.pkl'), 'rb') as f:
        fraud_scaler = pickle.load(f)

    print("All models loaded ✅")




def predict_all_api(city, rainfall, temperature,
                    aqi, delivery_drop, expected_inc):

    # Model 1
    weather_severity = (
        (rainfall    / 150) * 0.40 +
        (aqi         / 300) * 0.35 +
        ((temperature - 25) / 20) * 0.25
    )
    city_encoded = le.transform([city])[0]

    risk_input = pd.DataFrame([{
        'rainfall_mm'        : rainfall,
        'temperature_c'      : temperature,
        'aqi'                : aqi,
        'delivery_drop_ratio': delivery_drop,
        'weather_severity'   : weather_severity,
        'city_encoded'       : city_encoded
    }])
    risk_pred  = risk_model.predict(risk_input)[0]
    risk_proba = risk_model.predict_proba(risk_input)[0]
    risk_map   = {0: 'Low', 1: 'Medium', 2: 'High'}

    # Model 2
    actual_income      = expected_inc * (1 - delivery_drop)
    expected_vs_actual = actual_income / expected_inc

    income_input = pd.DataFrame([{
        'rainfall_mm'             : rainfall,
        'temperature_c'           : temperature,
        'aqi'                     : aqi,
        'delivery_drop_ratio'     : delivery_drop,
        'weather_severity'        : weather_severity,
        'expected_income'         : expected_inc,
        'actual_income'           : actual_income,
        'expected_vs_actual_ratio': expected_vs_actual,
        'city_encoded'            : city_encoded
    }])
    predicted_loss = income_model.predict(income_input)[0]
    payout_amount  = predicted_loss * 0.70

    # Model 3
    reasons = []
    score   = 0
    if rainfall > 120:         score += 3; reasons.append("EXTREME_RAIN")
    elif rainfall > 90:        score += 2; reasons.append("HEAVY_RAIN")
    if aqi > 270:              score += 3; reasons.append("SEVERE_POLLUTION")
    elif aqi > 230:            score += 2; reasons.append("HIGH_AQI")
    if temperature > 40:       score += 2; reasons.append("EXTREME_HEAT")
    if delivery_drop > 0.60:   score += 3; reasons.append("HIGH_DELIVERY_DROP")
    elif delivery_drop > 0.45: score += 2; reasons.append("MODERATE_DELIVERY_DROP")
    if risk_proba[2] > 0.80:   score += 2; reasons.append("HIGH_RISK_SCORE")
    is_triggered = score >= 5

    # Model 4
    income_loss_ratio      = predicted_loss / expected_inc
    loss_drop_mismatch     = income_loss_ratio - delivery_drop
    claim_weather_mismatch = income_loss_ratio - weather_severity
    claim_without_trigger  = 0 if is_triggered else (
                             1 if predicted_loss > 1000 else 0)

    fraud_input = fraud_scaler.transform([[
        income_loss_ratio, delivery_drop, 1.0,
        loss_drop_mismatch, claim_weather_mismatch,
        claim_without_trigger, weather_severity,
        int(is_triggered), score
    ]])
    fraud_raw   = fraud_model.score_samples(fraud_input)[0]
    fraud_score = max(0, min(1, (abs(fraud_raw) - 0.3) / 0.5))

    return {
        "risk_level"      : risk_map[risk_pred],
        "risk_prob_low"   : round(float(risk_proba[0]), 4),
        "risk_prob_med"   : round(float(risk_proba[1]), 4),
        "risk_prob_high"  : round(float(risk_proba[2]), 4),
        "predicted_loss"  : round(float(predicted_loss), 2),
        "payout_amount"   : round(float(payout_amount), 2),
        "triggered"       : bool(is_triggered),
        "trigger_score"   : int(score),
        "trigger_reasons" : reasons,
        "fraud_score"     : round(float(fraud_score), 4),
        "fraud_flagged"   : bool(fraud_score > 0.50)
    }




# example usage

if __name__ == "__main__":
    load_models(".")  
    
    result = predict_all_api('Delhi', 5, 34, 295, 0.55, 4800)
    print(result)
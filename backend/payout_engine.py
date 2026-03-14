def calculate_payout(risk_score, income_loss):
    payout = 0.0
    alert = 'No payout: conditions not met.'

    try:
        risk_score = float(risk_score)
        income_loss = float(income_loss)
    except Exception:
        return 0.0, 'Invalid numeric inputs for payout calculation.'

    if risk_score > 0.7 and income_loss > 1000:
        payout = income_loss * 0.7
        alert = 'Automatic payout triggered. Please review claim details.'
    elif risk_score > 0.7:
        alert = 'Risk high but income loss below threshold; monitoring continues.'
    elif income_loss > 1000:
        alert = 'Income loss high but risk below threshold; no payout for now.'

    payout = float(round(payout, 2))
    return payout, alert

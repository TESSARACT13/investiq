from typing import Dict


def calculate_score(
    price: float,
    previous_close: float,
    change_percent: float,
) -> Dict:
    """
    INVESTIQ transparent stock scoring engine.

    Score:
        0-39   -> SELL
        40-61  -> HOLD
        62-100 -> BUY
    """

    # This is deliberately a conservative, explainable rules score. One
    # session of price data cannot support a trustworthy probability forecast.
    score = 50.0
    reasons = []

    # Momentum
    if change_percent >= 2:
        score += 15
        reasons.append("Strong positive one-day momentum")
    elif change_percent >= 1:
        score += 10
        reasons.append("Positive one-day momentum")
    elif change_percent >= 0.25:
        score += 6
        reasons.append("Slight positive momentum")
    elif change_percent <= -2:
        score -= 15
        reasons.append("Strong negative one-day momentum")
    elif change_percent <= -1:
        score -= 12
        reasons.append("Negative momentum")
    elif change_percent <= -0.25:
        score -= 6
        reasons.append("Slight negative momentum")

    # Price vs previous close is already reflected by the return. Keep its
    # contribution small so it explains direction without double counting it.
    if price > previous_close:
        reasons.append("Trading above previous close")
    elif price < previous_close:
        reasons.append("Trading below previous close")

    # Keep score within 0-100
    score = max(0, min(100, round(score)))

    if score >= 62:
        signal = "BUY"
    elif score >= 40:
        signal = "HOLD"
    else:
        signal = "SELL"

    # This measures signal strength from the size of the observed daily move,
    # not the probability of a profitable trade.
    signal_strength = round(min(65, 50 + abs(change_percent) * 3))

    if not reasons:
        reasons.append("Market conditions are relatively neutral")

    explanation = ". ".join(reasons) + "."

    return {
        "score": score,
        "signal": signal,
        "confidence": signal_strength,
        "signal_strength": signal_strength,
        "explanation": explanation,
    }

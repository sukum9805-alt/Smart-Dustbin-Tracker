import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
import joblib
import os

def generate_waste_data(num_samples=4000, random_state=42):
    np.random.seed(random_state)
    
    # 1. Current Fill Level (%)
    current_fill = np.random.uniform(5.0, 95.0, num_samples)
    
    # 2. Base Fill Rate (% per hour)
    base_fill_rate = np.random.uniform(2.5, 12.0, num_samples)
    
    # 3. Hour of Day (0 to 23)
    hour_of_day = np.random.randint(0, 24, num_samples)
    
    # 4. Day of Week (0 = Monday, 6 = Sunday)
    day_of_week = np.random.randint(0, 7, num_samples)
    
    # 5. Zone Activity Level (1: Residential, 2: Institutional, 3: Commercial, 4: High-traffic Transit/Mall)
    zone_activity = np.random.choice([1, 2, 3, 4], size=num_samples, p=[0.25, 0.25, 0.3, 0.2])
    
    # Hour multiplier: peak waste generation during lunch (12-14) and evening (18-21)
    hour_multiplier = np.where(
        (hour_of_day >= 11) & (hour_of_day <= 14), 1.45,
        np.where(
            (hour_of_day >= 17) & (hour_of_day <= 21), 1.6,
            np.where((hour_of_day >= 0) & (hour_of_day <= 5), 0.25, 0.85)
        )
    )
    
    # Day multiplier: weekends are busier in commercial and recreation zones
    day_multiplier = np.where(day_of_week >= 5, 1.25, 1.0)
    
    # Zone factor
    zone_multiplier = 0.7 + (zone_activity * 0.3)
    
    # Effective fill rate (%/hour)
    effective_rate = base_fill_rate * hour_multiplier * day_multiplier * zone_multiplier
    # Add slight realistic noise
    noise = np.random.normal(1.0, 0.05, num_samples)
    effective_rate = np.maximum(0.5, effective_rate * noise)
    
    # Remaining capacity to reach 100%
    remaining_capacity = np.maximum(1.0, 100.0 - current_fill)
    
    # Target: Hours until dustbin is 100% full
    hours_until_full = remaining_capacity / effective_rate
    # Bound to reasonable positive values
    hours_until_full = np.clip(hours_until_full, 0.1, 72.0)
    
    df = pd.DataFrame({
        'current_fill': np.round(current_fill, 1),
        'base_fill_rate': np.round(base_fill_rate, 2),
        'hour_of_day': hour_of_day,
        'day_of_week': day_of_week,
        'zone_activity': zone_activity,
        'hours_until_full': np.round(hours_until_full, 2)
    })
    
    return df

def train_and_save_model(model_path='backend/model.pkl'):
    print("Generating synthetic waste accumulation dataset...")
    df = generate_waste_data()
    
    X = df[['current_fill', 'base_fill_rate', 'hour_of_day', 'day_of_week', 'zone_activity']]
    y = df['hours_until_full']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print("Training RandomForestRegressor model...")
    model = RandomForestRegressor(n_estimators=100, max_depth=14, random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)
    
    predictions = model.predict(X_test)
    mae = mean_absolute_error(y_test, predictions)
    r2 = r2_score(y_test, predictions)
    
    print(f"Model Training Completed:")
    print(f" - Mean Absolute Error (MAE): {mae:.3f} hours")
    print(f" - R-squared (R2) Score:     {r2:.4f}")
    
    model_bundle = {
        'model': model,
        'features': ['current_fill', 'base_fill_rate', 'hour_of_day', 'day_of_week', 'zone_activity'],
        'metrics': {'mae': round(float(mae), 3), 'r2': round(float(r2), 4)},
        'version': '1.0.0'
    }
    
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    joblib.dump(model_bundle, model_path)
    print(f"Model saved successfully to '{model_path}'!")
    return model_bundle

if __name__ == '__main__':
    train_and_save_model()


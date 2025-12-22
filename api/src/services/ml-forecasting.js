/**
 * ML Forecasting Service
 *
 * TensorFlow.js-based machine learning for call volume forecasting,
 * agent demand prediction, and trend analysis
 */

import { query } from '../db/connection.js';
import * as tf from '@tensorflow/tfjs-node';

// Model types
const MODEL_TYPES = {
  CALL_VOLUME: 'call_volume',
  AGENT_DEMAND: 'agent_demand',
  WAIT_TIME: 'wait_time',
  ABANDONMENT: 'abandonment',
  COST: 'cost',
  QUALITY: 'quality'
};

// Forecast intervals
const FORECAST_INTERVALS = {
  HOURLY: 'hourly',
  DAILY: 'daily',
  WEEKLY: 'weekly'
};

/**
 * ML Forecasting Service
 */
class MLForecastingService {
  constructor() {
    this.models = new Map();
    this.scalers = new Map();
    this.modelConfig = {
      lookbackWindow: 168, // 7 days of hourly data
      forecastHorizon: 24, // Predict next 24 hours
      hiddenUnits: 64,
      learningRate: 0.001,
      epochs: 50,
      batchSize: 32
    };
  }

  // ============================================
  // Data Preparation
  // ============================================

  /**
   * Fetch historical data for training
   */
  async fetchHistoricalData(tenantId, modelType, options = {}) {
    const { days = 90, interval = 'hour' } = options;

    let dataQuery;
    switch (modelType) {
      case MODEL_TYPES.CALL_VOLUME:
        dataQuery = `
          SELECT
            date_trunc('${interval}', created_at) as timestamp,
            COUNT(*) as value,
            EXTRACT(DOW FROM created_at) as day_of_week,
            EXTRACT(HOUR FROM created_at) as hour_of_day,
            EXTRACT(MONTH FROM created_at) as month
          FROM calls
          WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
          GROUP BY date_trunc('${interval}', created_at),
                   EXTRACT(DOW FROM created_at),
                   EXTRACT(HOUR FROM created_at),
                   EXTRACT(MONTH FROM created_at)
          ORDER BY timestamp
        `;
        break;

      case MODEL_TYPES.AGENT_DEMAND:
        dataQuery = `
          SELECT
            date_trunc('${interval}', created_at) as timestamp,
            COUNT(DISTINCT agent_id) as value,
            EXTRACT(DOW FROM created_at) as day_of_week,
            EXTRACT(HOUR FROM created_at) as hour_of_day
          FROM calls
          WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${days} days' AND agent_id IS NOT NULL
          GROUP BY date_trunc('${interval}', created_at),
                   EXTRACT(DOW FROM created_at),
                   EXTRACT(HOUR FROM created_at)
          ORDER BY timestamp
        `;
        break;

      case MODEL_TYPES.WAIT_TIME:
        dataQuery = `
          SELECT
            date_trunc('${interval}', created_at) as timestamp,
            AVG(wait_time_seconds) as value,
            EXTRACT(DOW FROM created_at) as day_of_week,
            EXTRACT(HOUR FROM created_at) as hour_of_day
          FROM queue_entries
          WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
          GROUP BY date_trunc('${interval}', created_at),
                   EXTRACT(DOW FROM created_at),
                   EXTRACT(HOUR FROM created_at)
          ORDER BY timestamp
        `;
        break;

      case MODEL_TYPES.ABANDONMENT:
        dataQuery = `
          SELECT
            date_trunc('${interval}', created_at) as timestamp,
            (COUNT(CASE WHEN status = 'abandoned' THEN 1 END)::float / NULLIF(COUNT(*), 0)) * 100 as value,
            EXTRACT(DOW FROM created_at) as day_of_week,
            EXTRACT(HOUR FROM created_at) as hour_of_day
          FROM queue_entries
          WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
          GROUP BY date_trunc('${interval}', created_at),
                   EXTRACT(DOW FROM created_at),
                   EXTRACT(HOUR FROM created_at)
          ORDER BY timestamp
        `;
        break;

      default:
        throw new Error(`Unknown model type: ${modelType}`);
    }

    const result = await query(dataQuery, [tenantId]);
    return result.rows;
  }

  /**
   * Prepare data for model training
   */
  prepareTrainingData(rawData, lookbackWindow) {
    const values = rawData.map(d => parseFloat(d.value) || 0);
    const features = rawData.map(d => [
      parseFloat(d.day_of_week) / 6, // Normalize day of week
      parseFloat(d.hour_of_day) / 23, // Normalize hour
      Math.sin(2 * Math.PI * parseFloat(d.hour_of_day) / 24), // Cyclical hour encoding
      Math.cos(2 * Math.PI * parseFloat(d.hour_of_day) / 24)
    ]);

    // Normalize values
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const normalizedValues = values.map(v => (v - min) / range);

    // Create sequences
    const X = [];
    const y = [];

    for (let i = lookbackWindow; i < normalizedValues.length; i++) {
      const sequence = [];
      for (let j = i - lookbackWindow; j < i; j++) {
        sequence.push([normalizedValues[j], ...features[j]]);
      }
      X.push(sequence);
      y.push(normalizedValues[i]);
    }

    return {
      X: tf.tensor3d(X),
      y: tf.tensor2d(y, [y.length, 1]),
      scaler: { min, max, range }
    };
  }

  // ============================================
  // Model Building
  // ============================================

  /**
   * Build LSTM model for time series forecasting
   */
  buildModel(inputShape) {
    const model = tf.sequential();

    // LSTM layer
    model.add(tf.layers.lstm({
      units: this.modelConfig.hiddenUnits,
      returnSequences: true,
      inputShape: inputShape
    }));

    model.add(tf.layers.dropout({ rate: 0.2 }));

    // Second LSTM layer
    model.add(tf.layers.lstm({
      units: Math.floor(this.modelConfig.hiddenUnits / 2),
      returnSequences: false
    }));

    model.add(tf.layers.dropout({ rate: 0.2 }));

    // Dense layers
    model.add(tf.layers.dense({
      units: 32,
      activation: 'relu'
    }));

    model.add(tf.layers.dense({
      units: 1,
      activation: 'linear'
    }));

    // Compile
    model.compile({
      optimizer: tf.train.adam(this.modelConfig.learningRate),
      loss: 'meanSquaredError',
      metrics: ['mse', 'mae']
    });

    return model;
  }

  /**
   * Train model
   */
  async trainModel(tenantId, modelType, options = {}) {
    const { epochs = this.modelConfig.epochs, verbose = 1 } = options;

    // Fetch and prepare data
    const rawData = await this.fetchHistoricalData(tenantId, modelType);

    if (rawData.length < this.modelConfig.lookbackWindow + 10) {
      throw new Error(`Insufficient data for training. Need at least ${this.modelConfig.lookbackWindow + 10} data points.`);
    }

    const { X, y, scaler } = this.prepareTrainingData(rawData, this.modelConfig.lookbackWindow);

    // Split data (80% train, 20% validation)
    const splitIndex = Math.floor(X.shape[0] * 0.8);

    const XTrain = X.slice([0, 0, 0], [splitIndex, -1, -1]);
    const yTrain = y.slice([0, 0], [splitIndex, -1]);
    const XVal = X.slice([splitIndex, 0, 0], [-1, -1, -1]);
    const yVal = y.slice([splitIndex, 0], [-1, -1]);

    // Build model
    const inputShape = [this.modelConfig.lookbackWindow, X.shape[2]];
    const model = this.buildModel(inputShape);

    // Train
    const history = await model.fit(XTrain, yTrain, {
      epochs,
      batchSize: this.modelConfig.batchSize,
      validationData: [XVal, yVal],
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          if (verbose) {
            console.log(`Epoch ${epoch + 1}: loss = ${logs.loss.toFixed(4)}, val_loss = ${logs.val_loss.toFixed(4)}`);
          }
        }
      }
    });

    // Store model and scaler
    const modelKey = `${tenantId}_${modelType}`;
    this.models.set(modelKey, model);
    this.scalers.set(modelKey, scaler);

    // Save model info to database
    await this.saveModelMetadata(tenantId, modelType, {
      trainedAt: new Date(),
      dataPoints: rawData.length,
      finalLoss: history.history.loss[history.history.loss.length - 1],
      finalValLoss: history.history.val_loss[history.history.val_loss.length - 1],
      epochs
    });

    // Cleanup tensors
    X.dispose();
    y.dispose();
    XTrain.dispose();
    yTrain.dispose();
    XVal.dispose();
    yVal.dispose();

    return {
      modelType,
      trainedAt: new Date(),
      dataPoints: rawData.length,
      epochs,
      finalLoss: history.history.loss[history.history.loss.length - 1],
      finalValLoss: history.history.val_loss[history.history.val_loss.length - 1]
    };
  }

  // ============================================
  // Forecasting
  // ============================================

  /**
   * Generate forecast
   */
  async forecast(tenantId, modelType, options = {}) {
    const { horizon = this.modelConfig.forecastHorizon } = options;

    const modelKey = `${tenantId}_${modelType}`;
    let model = this.models.get(modelKey);
    let scaler = this.scalers.get(modelKey);

    // Load model if not in memory
    if (!model) {
      const metadata = await this.loadModelMetadata(tenantId, modelType);
      if (!metadata) {
        throw new Error(`No trained model found for ${modelType}. Please train the model first.`);
      }
      // For simplicity, we'll retrain if model not in memory
      // In production, you'd save/load model weights
      await this.trainModel(tenantId, modelType, { verbose: 0 });
      model = this.models.get(modelKey);
      scaler = this.scalers.get(modelKey);
    }

    // Get recent data for prediction
    const rawData = await this.fetchHistoricalData(tenantId, modelType, { days: 14 });

    if (rawData.length < this.modelConfig.lookbackWindow) {
      throw new Error('Insufficient recent data for forecasting');
    }

    // Prepare last sequence
    const values = rawData.slice(-this.modelConfig.lookbackWindow).map(d => parseFloat(d.value) || 0);
    const normalizedValues = values.map(v => (v - scaler.min) / scaler.range);

    const lastTimestamp = new Date(rawData[rawData.length - 1].timestamp);
    const predictions = [];

    // Generate features for future timestamps
    let currentSequence = normalizedValues.map((v, i) => {
      const data = rawData[rawData.length - this.modelConfig.lookbackWindow + i];
      return [
        v,
        parseFloat(data.day_of_week) / 6,
        parseFloat(data.hour_of_day) / 23,
        Math.sin(2 * Math.PI * parseFloat(data.hour_of_day) / 24),
        Math.cos(2 * Math.PI * parseFloat(data.hour_of_day) / 24)
      ];
    });

    // Predict step by step
    for (let i = 0; i < horizon; i++) {
      const inputTensor = tf.tensor3d([currentSequence]);
      const predNormalized = model.predict(inputTensor).dataSync()[0];
      inputTensor.dispose();

      // Denormalize
      const predValue = predNormalized * scaler.range + scaler.min;

      // Calculate future timestamp
      const futureTimestamp = new Date(lastTimestamp.getTime() + (i + 1) * 60 * 60 * 1000);
      const hour = futureTimestamp.getHours();
      const dayOfWeek = futureTimestamp.getDay();

      predictions.push({
        timestamp: futureTimestamp,
        value: Math.max(0, predValue),
        hour,
        dayOfWeek
      });

      // Update sequence for next prediction
      currentSequence.shift();
      currentSequence.push([
        predNormalized,
        dayOfWeek / 6,
        hour / 23,
        Math.sin(2 * Math.PI * hour / 24),
        Math.cos(2 * Math.PI * hour / 24)
      ]);
    }

    return {
      modelType,
      generatedAt: new Date(),
      horizon,
      predictions
    };
  }

  /**
   * Get forecast with confidence intervals
   */
  async forecastWithConfidence(tenantId, modelType, options = {}) {
    const { horizon = 24, confidenceLevel = 0.95 } = options;

    // Get base forecast
    const baseForecast = await this.forecast(tenantId, modelType, { horizon });

    // Calculate historical error for confidence intervals
    const rawData = await this.fetchHistoricalData(tenantId, modelType, { days: 30 });
    const values = rawData.map(d => parseFloat(d.value) || 0);

    // Calculate standard deviation of recent values
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Z-score for confidence level
    const zScore = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.99 ? 2.576 : 1.645;

    // Add confidence intervals
    const predictionsWithCI = baseForecast.predictions.map((pred, i) => {
      // Uncertainty grows with forecast horizon
      const uncertaintyFactor = 1 + (i * 0.05);
      const margin = zScore * stdDev * uncertaintyFactor;

      return {
        ...pred,
        confidenceLow: Math.max(0, pred.value - margin),
        confidenceHigh: pred.value + margin,
        confidence: confidenceLevel
      };
    });

    return {
      ...baseForecast,
      predictions: predictionsWithCI,
      confidenceLevel
    };
  }

  // ============================================
  // Specific Forecasts
  // ============================================

  /**
   * Forecast call volume
   */
  async forecastCallVolume(tenantId, options = {}) {
    return this.forecastWithConfidence(tenantId, MODEL_TYPES.CALL_VOLUME, options);
  }

  /**
   * Forecast agent demand
   */
  async forecastAgentDemand(tenantId, options = {}) {
    const forecast = await this.forecastWithConfidence(tenantId, MODEL_TYPES.AGENT_DEMAND, options);

    // Add staffing recommendations
    forecast.predictions = forecast.predictions.map(pred => ({
      ...pred,
      recommendedAgents: Math.ceil(pred.value * 1.1), // 10% buffer
      minimumAgents: Math.ceil(pred.confidenceLow),
      maximumAgents: Math.ceil(pred.confidenceHigh)
    }));

    return forecast;
  }

  /**
   * Forecast wait times
   */
  async forecastWaitTime(tenantId, options = {}) {
    return this.forecastWithConfidence(tenantId, MODEL_TYPES.WAIT_TIME, options);
  }

  /**
   * Forecast abandonment rate
   */
  async forecastAbandonment(tenantId, options = {}) {
    return this.forecastWithConfidence(tenantId, MODEL_TYPES.ABANDONMENT, options);
  }

  // ============================================
  // Model Management
  // ============================================

  /**
   * Save model metadata to database
   */
  async saveModelMetadata(tenantId, modelType, metadata) {
    await query(`
      INSERT INTO ml_models (
        id, tenant_id, model_type, metadata, trained_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (tenant_id, model_type) DO UPDATE SET
        metadata = $4,
        trained_at = $5,
        updated_at = NOW()
    `, [
      `${tenantId}_${modelType}`,
      tenantId,
      modelType,
      JSON.stringify(metadata),
      metadata.trainedAt
    ]);
  }

  /**
   * Load model metadata from database
   */
  async loadModelMetadata(tenantId, modelType) {
    const result = await query(
      'SELECT * FROM ml_models WHERE tenant_id = $1 AND model_type = $2',
      [tenantId, modelType]
    );
    return result.rows[0];
  }

  /**
   * Get available models for tenant
   */
  async getAvailableModels(tenantId) {
    const result = await query(
      'SELECT * FROM ml_models WHERE tenant_id = $1 ORDER BY trained_at DESC',
      [tenantId]
    );

    return result.rows.map(row => ({
      modelType: row.model_type,
      trainedAt: row.trained_at,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
    }));
  }

  /**
   * Delete model
   */
  async deleteModel(tenantId, modelType) {
    const modelKey = `${tenantId}_${modelType}`;

    // Remove from memory
    const model = this.models.get(modelKey);
    if (model) {
      model.dispose();
      this.models.delete(modelKey);
      this.scalers.delete(modelKey);
    }

    // Remove from database
    await query(
      'DELETE FROM ml_models WHERE tenant_id = $1 AND model_type = $2',
      [tenantId, modelType]
    );

    return { deleted: true };
  }

  // ============================================
  // Analysis & Insights
  // ============================================

  /**
   * Detect trends in data
   */
  async detectTrends(tenantId, metric, options = {}) {
    const { days = 30 } = options;

    const data = await this.fetchHistoricalData(tenantId, metric, { days, interval: 'day' });
    const values = data.map(d => parseFloat(d.value) || 0);

    if (values.length < 7) {
      return { error: 'Insufficient data for trend analysis' };
    }

    // Calculate linear regression
    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Determine trend direction
    const trendDirection = slope > 0.01 ? 'increasing' :
                          slope < -0.01 ? 'decreasing' : 'stable';

    // Calculate R-squared
    const yMean = sumY / n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) {
      const yPred = slope * i + intercept;
      ssTot += Math.pow(values[i] - yMean, 2);
      ssRes += Math.pow(values[i] - yPred, 2);
    }
    const rSquared = 1 - (ssRes / ssTot);

    // Calculate growth rate
    const startValue = values[0];
    const endValue = values[values.length - 1];
    const growthRate = startValue !== 0 ? ((endValue - startValue) / startValue) * 100 : 0;

    return {
      metric,
      period: `${days} days`,
      trend: trendDirection,
      slope,
      rSquared,
      growthRate,
      startValue,
      endValue,
      average: yMean,
      dataPoints: n
    };
  }

  /**
   * Detect anomalies in data
   */
  async detectAnomalies(tenantId, metric, options = {}) {
    const { days = 30, threshold = 2 } = options;

    const data = await this.fetchHistoricalData(tenantId, metric, { days });
    const values = data.map(d => parseFloat(d.value) || 0);

    // Calculate mean and standard deviation
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length
    );

    // Detect anomalies using z-score
    const anomalies = data.filter((d, i) => {
      const zScore = Math.abs((values[i] - mean) / stdDev);
      return zScore > threshold;
    }).map((d, i) => ({
      timestamp: d.timestamp,
      value: parseFloat(d.value),
      zScore: Math.abs((parseFloat(d.value) - mean) / stdDev),
      direction: parseFloat(d.value) > mean ? 'high' : 'low'
    }));

    return {
      metric,
      period: `${days} days`,
      mean,
      stdDev,
      threshold,
      anomalyCount: anomalies.length,
      anomalies
    };
  }

  /**
   * Generate staffing recommendations
   */
  async getStaffingRecommendations(tenantId, options = {}) {
    const { horizon = 24 } = options;

    // Get forecasts
    const callForecast = await this.forecastCallVolume(tenantId, { horizon });
    const waitTimeForecast = await this.forecastWaitTime(tenantId, { horizon });

    // Calculate recommendations
    const recommendations = callForecast.predictions.map((pred, i) => {
      // Assume 10 calls per agent per hour
      const baseAgents = Math.ceil(pred.value / 10);

      // Adjust based on wait time forecast
      const waitTime = waitTimeForecast.predictions[i]?.value || 0;
      const waitTimeMultiplier = waitTime > 120 ? 1.2 : waitTime > 60 ? 1.1 : 1;

      const recommendedAgents = Math.ceil(baseAgents * waitTimeMultiplier);

      return {
        timestamp: pred.timestamp,
        predictedCalls: Math.round(pred.value),
        predictedWaitTime: Math.round(waitTime),
        recommendedAgents,
        minimumAgents: Math.max(1, Math.ceil(recommendedAgents * 0.8)),
        maximumAgents: Math.ceil(recommendedAgents * 1.2)
      };
    });

    return {
      generatedAt: new Date(),
      horizon,
      recommendations
    };
  }
}

// Singleton instance
const mlForecastingService = new MLForecastingService();

export default mlForecastingService;
export { MODEL_TYPES, FORECAST_INTERVALS };

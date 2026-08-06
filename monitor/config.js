/**
 * Scalping Monitor Configuration
 * 
 * Configure symbols, conditions, and exit strategy.
 * All indicators calculated LOCALLY from OHLCV bars — no premium TV required.
 * 
 * When symbol is NIFTY, automatically analyzes NIFTY options chain
 * for current week, next week, and next-next week expiries.
 * 
 * Targets are ATR-BASED (points, not percentages) for realistic scalping.
 * NIFTY at 24500: ATR ≈ 20-30 points on 1m chart.
 * Option targets: 50% of premium (e.g., premium 100, target 150, SL 50)
 * Max hold: 10 minutes.
 */

const config = {
  // ─── Symbol to monitor ───
  symbol: 'NIFTY',          // Change to BTCUSD, AAPL, etc.
  timeframe: '1',              // 1 = 1 minute chart for fastest signals

  // ─── Polling ───
  poll_interval_ms: 5000,      // Check every 5 seconds

  // ─── Trigger Conditions ───
  conditions: {
    ema9_cross: true,
    vwap_cross: true,
    supertrend_flip: true,
    rsi_overbought_oversold: true,
    bollinger_breakout: true,
    breakout_1min_high: true,
    breakout_1min_low: true,
    round_number: true,
    volume_spike: true,
    price_move_0_2_pct: true,
    always_analyze: false,
  },

  // ─── Thresholds ───
  thresholds: {
    volume_spike_multiplier: 1.5,
    min_price_move_pct: 0.2,
    round_number_range: 5,
    rsi_overbought: 70,
    rsi_oversold: 30,
    bollinger_period: 20,
    bollinger_std: 2,
  },

  // ─── Analysis Settings ───
  analysis: {
    ohlcv_bars: 50,
    include_options: true,      // For NIFTY: analyze options chain
    max_strikes: 5,             // ATM-2 to ATM+2
    
    // ─── Cross-Verification Requirements ───
    min_confirming_signals: 3,
    require_trend_alignment: true,
    require_momentum_alignment: true,
    min_confidence_pct: 50,
  },

  // ─── Options Analysis ───
  options: {
    enabled: true,              // Auto-analyze NIFTY options
    expiries: ['current', 'next', 'next_next'],  // Which expiries to scan
    atm_range: 2,               // ATM ±2 strikes
    min_premium: 20,            // Minimum premium to consider
    max_premium: 200,           // Maximum premium to consider
    target_multiplier: 1.25,    // Target = premium * 1.25 (25% profit — achievable in 5-10 min)
    stop_loss_multiplier: 0.85, // SL = premium * 0.85 (15% loss) → R:R = 1:1.67
    min_liquidity_volume: 100,  // Minimum volume for liquidity
    min_score: 50,              // Minimum score (out of 100) to recommend
  },

  // ─── Exit Strategy (after trade entry) ───
  exit: {
    target1_multiplier: 0.5,   // T1 = 0.5 * ATR
    target2_multiplier: 1.0,   // T2 = 1.0 * ATR
    stop_loss_multiplier: 0.3, // SL = 0.3 * ATR
    
    trailing_stop: true,
    trailing_activation_multiplier: 0.3,
    trailing_distance_multiplier: 0.15,
    
    max_hold_seconds: 600,
    exit_on_reversal: true,
    exit_poll_ms: 3000,
  },

  // ─── Notifications ───
  notifications: {
    sound: true,
    show_analysis: true,
    show_recommendation: true,
  },

  // ─── Context Enrichment (Phase 1) ───
  enrichment: {
    enabled: true,              // Master switch
    market_regime: true,        // Detect trending/ranging/volatile
    volatility: true,           // ATR%, realized vol, IV context
    include_options: true,      // Use options chain for IV context
    openbb: {
      enabled: true,            // Fetch fundamentals/sentiment from OpenBB
      base_url: 'http://localhost:8000',
      cache_ttl_ms: 60000,      // Cache fundamentals for 60s
    },
    kronos: {
      enabled: true,            // AI price forecast from Kronos
      base_url: 'http://localhost:8001',
      pred_len: 5,              // Forecast 5 bars ahead
      lookback: 200,            // Use 200 bars of context
      cache_ttl_ms: 300000,     // Cache forecast for 5min
    },
  },
};

export default config;
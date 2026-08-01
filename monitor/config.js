/**
 * Scalping Monitor Configuration
 * 
 * Configure symbols, conditions, and exit strategy.
 * All indicators calculated LOCALLY from OHLCV bars — no premium TV required.
 * 
 * Targets are set for meaningful scalping: minimum 5% potential profit.
 * Recommendations require MULTIPLE cross-verified signals before triggering.
 */

const config = {
  // ─── Symbol to monitor ───
  symbol: 'BTCUSD',          // Change to NSE:NIFTY, BTCUSD, AAPL, etc.
  timeframe: '1',              // 1 = 1 minute chart for fastest signals

  // ─── Polling ───
  poll_interval_ms: 5000,      // Check every 5 seconds

  // ─── Trigger Conditions ───
  // Set any condition to true to enable it.
  // Multiple conditions = OR logic (any one triggers analysis).
  conditions: {
    // --- Trend triggers (locally calculated) ---
    ema9_cross: true,           // Price crosses above/below EMA 9
    vwap_cross: true,           // Price crosses above/below VWAP
    supertrend_flip: true,      // Supertrend changes direction
    
    // --- Momentum triggers (locally calculated) ---
    rsi_overbought_oversold: true,  // RSI crosses above 70 (overbought) or below 30 (oversold)
    bollinger_breakout: true,       // Price breaks above/below Bollinger Bands
    
    // --- Price action triggers ---
    breakout_1min_high: true,   // Price breaks above previous 1m candle high
    breakout_1min_low: true,    // Price breaks below previous 1m candle low
    round_number: true,         // Price crosses a round number (e.g., 4050, 24400)
    
    // --- Momentum triggers ---
    volume_spike: true,         // Volume > 1.5x average on current bar
    price_move_0_2_pct: true,   // Price moves >0.2% in one 1m candle
    
    // --- Always-on ---
    always_analyze: false,      // If true, runs analysis every cycle (debug)
  },

  // ─── Thresholds ───
  thresholds: {
    volume_spike_multiplier: 1.5,  // Trigger when volume > 1.5x MA
    min_price_move_pct: 0.2,       // Trigger on 0.2% price move
    round_number_range: 5,         // Round number detection range (e.g., ±5 for 4050)
    rsi_overbought: 70,            // RSI overbought threshold
    rsi_oversold: 30,              // RSI oversold threshold
    bollinger_period: 20,          // Bollinger Bands period
    bollinger_std: 2,              // Bollinger Bands standard deviations
  },

  // ─── Analysis Settings ───
  analysis: {
    ohlcv_bars: 50,            // Bars to fetch for analysis (need 20+ for Bollinger/RSI)
    include_options: false,     // Set true for NSE:NIFTY to read options chain
    max_strikes: 5,            // ATM-2 to ATM+2
    
    // ─── Cross-Verification Requirements ───
    // A trade recommendation requires MULTIPLE confirming signals
    min_confirming_signals: 3,     // At least 3 indicators must agree
    require_trend_alignment: true, // Trend must align with trade direction
    require_momentum_alignment: true, // Momentum must align with trade direction
    min_confidence_pct: 50,        // Minimum 50% confidence to recommend
  },

  // ─── Exit Strategy (after trade entry) ───
  exit: {
    // Profit targets (in PERCENTAGE)
    // Minimum 5% potential profit for meaningful scalping
    target1_pct: 3.0,          // T1 = 3% profit
    target2_pct: 5.0,          // T2 = 5% profit (minimum viable)
    stop_loss_pct: 1.5,        // SL = 1.5% loss
    
    // Trailing stop (in percentage)
    trailing_stop: true,       // Enable trailing stop
    trailing_activation_pct: 2.0,  // Activate trail after 2% profit
    trailing_distance_pct: 1.0,    // Trail distance = 1%
    
    // Time-based exit
    max_hold_seconds: 600,     // Max 10 minutes in trade
    exit_on_reversal: true,    // Exit if conditions reverse
    
    // Polling during trade
    exit_poll_ms: 3000,        // Check exit every 3 seconds
  },

  // ─── Notifications ───
  notifications: {
    sound: true,               // Terminal bell on trigger
    show_analysis: true,       // Show full analysis on trigger
    show_recommendation: true, // Show buy/sell recommendation
  },
};

export default config;
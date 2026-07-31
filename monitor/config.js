/**
 * Scalping Monitor Configuration
 * 
 * Configure symbols, conditions, and exit strategy.
 * Conditions are designed to trigger frequently (every 2-5 min) for scalping.
 */

const config = {
  // ─── Symbol to monitor ───
  symbol: 'TVC:GOLD',          // Change to NSE:NIFTY, BTCUSD, AAPL, etc.
  timeframe: '1',              // 1 = 1 minute chart for fastest signals

  // ─── Polling ───
  poll_interval_ms: 5000,      // Check every 5 seconds

  // ─── Trigger Conditions ───
  // Set any condition to true to enable it.
  // Multiple conditions = OR logic (any one triggers analysis).
  conditions: {
    // --- Frequent triggers (every 2-5 min) ---
    ema9_cross: true,           // Price crosses above/below EMA 9
    vwap_cross: true,           // Price crosses above/below VWAP
    supertrend_flip: true,      // Supertrend changes direction
    utbot_signal: true,         // UT Bot buy/sell signal appears
    
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
  },

  // ─── Analysis Settings ───
  analysis: {
    ohlcv_bars: 20,            // Bars to fetch for analysis
    include_options: false,     // Set true for NSE:NIFTY to read options chain
    max_strikes: 5,            // ATM-2 to ATM+2
  },

  // ─── Exit Strategy (after trade entry) ───
  exit: {
    // Profit targets (in price points, not %)
    target1_points: null,      // Auto-calculated from ATR if null
    target2_points: null,      // Auto-calculated from ATR if null
    target1_multiplier: 0.5,   // T1 = 0.5 * ATR
    target2_multiplier: 1.0,   // T2 = 1.0 * ATR
    
    // Stop loss
    stop_loss_points: null,    // Auto-calculated from ATR if null
    stop_loss_multiplier: 0.3, // SL = 0.3 * ATR
    
    // Trailing stop
    trailing_stop: true,       // Enable trailing stop
    trailing_activation: 0.3,  // Activate trail after profit > 0.3 * ATR
    trailing_distance: 0.15,   // Trail distance = 0.15 * ATR
    
    // Time-based exit
    max_hold_seconds: 300,     // Max 5 minutes in trade
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
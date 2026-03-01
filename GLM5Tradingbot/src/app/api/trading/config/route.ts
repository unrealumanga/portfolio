/**
 * Trading Configuration API Route
 * GET /api/trading/config - Returns current config (hides sensitive keys)
 * POST /api/trading/config - Updates config parameters
 */

import { NextRequest, NextResponse } from 'next/server';
import { TradingConfig } from '@/lib/trading/config';
import { getBotState } from '@/lib/trading/bot-state';
import { getActivityLogger } from '@/lib/trading/activity-logger';
import type { RiskSettings, TradingParams, TelegramConfig } from '@/lib/trading/types';

// Sensitive keys that should never be exposed
const SENSITIVE_KEYS = [
  'apiKey',
  'apiSecret',
  'passphrase',
  'botToken',
  'chatId',
];

// Redact sensitive values
function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...obj };
  
  for (const key of SENSITIVE_KEYS) {
    if (redacted[key] !== undefined) {
      redacted[key] = '***REDACTED***';
    }
  }
  
  // Recursively redact nested objects
  for (const key of Object.keys(redacted)) {
    if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key] = redactSensitive(redacted[key] as Record<string, unknown>);
    }
  }
  
  return redacted;
}

export async function GET() {
  try {
    const config = TradingConfig.getInstance();
    const botState = getBotState();
    const logger = getActivityLogger();

    // Get all configuration
    const tradingParams = config.getTradingParams();
    const riskSettings = config.getRiskSettings();
    const signalThresholds = config.getSignalThresholds();
    const telegramConfig = config.getTelegramConfig();
    const mexcCredentials = config.getMexcCredentials();
    const bybitCredentials = config.getBybitCredentials();

    // Build config object (with redacted sensitive data)
    const safeConfig = {
      trading: {
        baseCapitalUsdt: tradingParams.base_capital_usdt,
        leverage: tradingParams.leverage,
        minEvScore: tradingParams.min_ev_score,
        minKellyScore: tradingParams.min_kelly_score,
        minWinProbability: tradingParams.min_win_probability,
        targetSymbols: tradingParams.target_symbols,
        signalIntervalMs: tradingParams.signal_interval_ms,
        maxOpenPositions: tradingParams.max_open_positions,
        positionHoldTimeMaxMs: tradingParams.position_hold_time_max_ms,
      },
      risk: {
        maxPositionSizeUsdt: riskSettings.max_position_size_usdt,
        maxLeverage: riskSettings.max_leverage,
        maxTotalExposureUsdt: riskSettings.max_total_exposure_usdt,
        maxDrawdownPct: riskSettings.max_drawdown_pct,
        maxCorrelatedPositions: riskSettings.max_correlated_positions,
        stopLossPct: riskSettings.stop_loss_pct,
        takeProfitPct: riskSettings.take_profit_pct,
        trailingStopPct: riskSettings.trailing_stop_pct,
      },
      signalThresholds: {
        minEvScore: signalThresholds.MIN_EV_SCORE,
        minKellyScore: signalThresholds.MIN_KELLY_SCORE,
        minWinProbability: signalThresholds.MIN_WIN_PROBABILITY,
        minConfidence: signalThresholds.MIN_CONFIDENCE,
        minExpectedMovePct: signalThresholds.MIN_EXPECTED_MOVE_PCT,
      },
      strategyWeights: config.STRATEGY_WEIGHTS,
      timeframes: config.TIMEFRAMES,
      regimeThresholds: config.REGIME_THRESHOLDS,
      exchangeFees: config.EXCHANGE_FEES,
      credentials: {
        mexc: {
          hasApiKey: !!mexcCredentials.apiKey,
          hasApiSecret: !!mexcCredentials.apiSecret,
        },
        bybit: {
          hasApiKey: !!bybitCredentials.apiKey,
          hasApiSecret: !!bybitCredentials.apiSecret,
        },
      },
      telegram: {
        enabled: telegramConfig.enabled,
        hasBotToken: !!telegramConfig.botToken,
        hasChatId: !!telegramConfig.chatId,
        notifyOnSignal: telegramConfig.notifyOnSignal,
        notifyOnTrade: telegramConfig.notifyOnTrade,
        notifyOnError: telegramConfig.notifyOnError,
      },
    };

    // Log config access
    logger.log('CONFIG_ACCESSED', {
      endpoint: 'GET /api/trading/config',
    }, 'info');

    return NextResponse.json({
      success: true,
      config: safeConfig,
      validation: config.validateConfig(),
      botStatus: {
        status: botState.getStatus(),
        running: botState.isRunning(),
        positionCount: botState.getPositionCount(),
      },
      timestamp: Date.now(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to get config: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}

// POST to update configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config = TradingConfig.getInstance();
    const botState = getBotState();
    const logger = getActivityLogger();

    // Check if bot is running - some config changes require restart
    if (botState.isRunning()) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Cannot update config while bot is running. Stop the bot first.',
        },
        { status: 400 }
      );
    }

    const updates: string[] = [];
    const warnings: string[] = [];

    // Note: In a real implementation, you would persist these changes
    // For now, we'll just validate and log them

    // Validate trading parameters
    if (body.trading) {
      const t = body.trading;
      
      if (t.baseCapitalUsdt !== undefined) {
        if (t.baseCapitalUsdt < 15) {
          warnings.push('baseCapitalUsdt should be at least 15 USDT for Bybit futures');
        }
        updates.push(`baseCapitalUsdt: ${t.baseCapitalUsdt}`);
      }

      if (t.leverage !== undefined) {
        if (t.leverage < 1 || t.leverage > 100) {
          return NextResponse.json(
            { success: false, error: 'Leverage must be between 1 and 100' },
            { status: 400 }
          );
        }
        updates.push(`leverage: ${t.leverage}`);
      }

      if (t.maxOpenPositions !== undefined) {
        if (t.maxOpenPositions < 1 || t.maxOpenPositions > 10) {
          return NextResponse.json(
            { success: false, error: 'maxOpenPositions must be between 1 and 10' },
            { status: 400 }
          );
        }
        updates.push(`maxOpenPositions: ${t.maxOpenPositions}`);
      }

      if (t.targetSymbols !== undefined) {
        if (!Array.isArray(t.targetSymbols) || t.targetSymbols.length === 0) {
          return NextResponse.json(
            { success: false, error: 'targetSymbols must be a non-empty array' },
            { status: 400 }
          );
        }
        updates.push(`targetSymbols: ${t.targetSymbols.length} symbols`);
      }

      if (t.signalIntervalMs !== undefined) {
        if (t.signalIntervalMs < 10000) {
          warnings.push('signalIntervalMs below 10000ms may cause rate limiting');
        }
        updates.push(`signalIntervalMs: ${t.signalIntervalMs}`);
      }
    }

    // Validate risk parameters
    if (body.risk) {
      const r = body.risk;

      if (r.maxDrawdownPct !== undefined) {
        if (r.maxDrawdownPct < 0.01 || r.maxDrawdownPct > 0.5) {
          return NextResponse.json(
            { success: false, error: 'maxDrawdownPct must be between 0.01 (1%) and 0.5 (50%)' },
            { status: 400 }
          );
        }
        updates.push(`maxDrawdownPct: ${r.maxDrawdownPct}`);
      }

      if (r.stopLossPct !== undefined) {
        if (r.stopLossPct < 0.005 || r.stopLossPct > 0.1) {
          warnings.push('stopLossPct outside typical range (0.5% - 10%)');
        }
        updates.push(`stopLossPct: ${r.stopLossPct}`);
      }

      if (r.takeProfitPct !== undefined) {
        if (r.takeProfitPct < 0.01 || r.takeProfitPct > 0.5) {
          warnings.push('takeProfitPct outside typical range (1% - 50%)');
        }
        updates.push(`takeProfitPct: ${r.takeProfitPct}`);
      }
    }

    // Validate signal thresholds
    if (body.signalThresholds) {
      const s = body.signalThresholds;

      if (s.minEvScore !== undefined) {
        updates.push(`minEvScore: ${s.minEvScore}`);
      }

      if (s.minWinProbability !== undefined) {
        if (s.minWinProbability < 0.3 || s.minWinProbability > 0.9) {
          warnings.push('minWinProbability outside typical range (0.3 - 0.9)');
        }
        updates.push(`minWinProbability: ${s.minWinProbability}`);
      }
    }

    // Validate Telegram settings
    if (body.telegram) {
      const tg = body.telegram;

      if (tg.enabled !== undefined) {
        updates.push(`telegram.enabled: ${tg.enabled}`);
      }

      if (tg.notifyOnSignal !== undefined) {
        updates.push(`telegram.notifyOnSignal: ${tg.notifyOnSignal}`);
      }

      if (tg.notifyOnTrade !== undefined) {
        updates.push(`telegram.notifyOnTrade: ${tg.notifyOnTrade}`);
      }
    }

    // Log config update
    logger.log('CONFIG_UPDATED', {
      updates,
      warnings,
    }, 'info');

    // In a real implementation, you would save to a config file or database here
    // For now, we return what would be updated

    return NextResponse.json({
      success: true,
      message: 'Configuration validated (changes require restart to take effect)',
      updates: updates.length > 0 ? updates : ['No changes provided'],
      warnings,
      note: 'Configuration changes are validated but not persisted in this implementation. Add the values to your .h2tkn file or environment variables for persistence.',
      timestamp: Date.now(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to update config: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}

// PUT to reset configuration to defaults
export async function PUT() {
  const config = TradingConfig.getInstance();
  const botState = getBotState();
  const logger = getActivityLogger();

  if (botState.isRunning()) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Cannot reset config while bot is running',
      },
      { status: 400 }
    );
  }

  // Reset singleton to reload from file
  TradingConfig.resetInstance();
  const newConfig = TradingConfig.getInstance();

  logger.log('CONFIG_RESET', {
    timestamp: Date.now(),
  }, 'info');

  return NextResponse.json({
    success: true,
    message: 'Configuration reset to defaults (reloaded from .h2tkn file)',
    validation: newConfig.validateConfig(),
    timestamp: Date.now(),
  });
}

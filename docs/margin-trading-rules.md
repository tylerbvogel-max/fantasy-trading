# Margin Trading Rules

## Overview
Margin trading is an optional season setting that allows players to borrow funds to buy more stock than their cash balance allows. It adds risk/reward depth — leveraged gains are amplified, but so are losses, and borrowed money accrues daily interest.

Margin-enabled seasons are labeled with a warning icon and marked as "advanced" in the UI.

## Season-Level Settings

These are configured by the season creator during setup:

| Setting | Default | Description |
|---------|---------|-------------|
| `margin_enabled` | `false` | Toggle to enable margin for the season |
| `leverage_multiplier` | `2.0` | Max leverage (2.0 = 2:1, borrow up to 100% of holdings value) |
| `margin_interest_rate` | `0.08` | Annual interest rate on borrowed funds (8%) |
| `maintenance_margin_pct` | `0.30` | Equity must stay above 30% of holdings value |

The initial margin requirement is derived: `initial_margin_requirement = 1 / leverage_multiplier` (e.g., 2x leverage = 50% initial margin).

## Player-Level Fields (per player_season)

| Field | Default | Description |
|-------|---------|-------------|
| `margin_loan_balance` | `0` | Current amount borrowed |
| `margin_call_active` | `false` | Whether player is in margin call state |
| `margin_call_issued_at` | `null` | Timestamp when margin call was triggered |

Cash balance already exists on `player_season`. It always floors at 0 — any excess rolls into the loan balance.

## Buying Power

```
buying_power = cash + (portfolio_market_value * (leverage_multiplier - 1))
```

For 2x leverage with $50K cash and $50K holdings:
`buying_power = $50K + ($50K * 1) = $100K`

A player with $100K cash and no holdings has buying power of $100K (no collateral to borrow against — you need holdings to leverage).

## Trade Execution

### Buying

When a player places a buy order for `order_value`:

```
if order_value > buying_power:
    REJECT — insufficient buying power

if order_value <= cash:
    # Fully covered by cash
    cash -= order_value
else:
    # Borrow the shortfall
    margin_needed = order_value - cash
    margin_loan_balance += margin_needed
    cash = 0
```

When an order would use margin, show a confirmation before executing:

> "This trade uses $X in margin (borrowed funds). You'll be charged Y% annual interest on the borrowed amount. Proceed?"

### Selling

Proceeds from a sell auto-repay the margin loan first:

```
proceeds = shares_sold * current_price

if margin_loan_balance > 0:
    repayment = min(proceeds, margin_loan_balance)
    margin_loan_balance -= repayment
    remaining = proceeds - repayment
    cash += remaining
else:
    cash += proceeds
```

### Blocked During Margin Call

If a player has an active margin call, new margin trades (buys that would increase margin_loan_balance) are blocked. Cash-only buys and all sells are still allowed.

## Daily Interest Accrual

Runs once daily at market close:

```
if margin_loan_balance > 0:
    daily_interest = margin_loan_balance * (margin_interest_rate / 365)
    margin_loan_balance += daily_interest
```

Interest compounds into the loan balance (since cash floors at 0, interest can't reduce cash below zero — it just grows the loan).

## Margin Call System

Checked once daily at market close, after interest accrual.

### Equity Calculation

```
equity = cash + portfolio_market_value - margin_loan_balance
maintenance_required = portfolio_market_value * maintenance_margin_pct
```

### Three-Tier Warning System

| Tier | Trigger | Action |
|------|---------|--------|
| **Warning** | Equity < 40% of holdings value | Yellow notification: "Your margin is getting thin" |
| **Margin Call** | Equity < 30% of holdings value (maintenance) | Red notification + 24-hour grace period |
| **Ruthless Liquidation** | Still below 30% after grace period | Auto-sell worst performers until equity reaches 35% |

### Grace Period Rules

- **Clock starts** at market close when equity drops below maintenance
- **During grace period** (next trading day): player can sell positions to improve margin. Sells auto-repay loan. If equity rises back above 30%, the margin call cancels automatically
- **Clock expires** at the *next* market close (~24 hours later). If still below 30%, ruthless liquidation fires
- **New margin trades blocked** while margin call is active — no digging deeper while in the hole

### Ruthless Liquidation

When auto-liquidation triggers:

1. Sort player's holdings by unrealized P&L (worst performers first)
2. Sell positions one at a time (full position each), starting with the biggest loser
3. Stop when equity reaches 35% of remaining holdings value (5% buffer above maintenance)
4. Log each forced sale as a "MARGIN_LIQUIDATION" transaction type
5. Notify player: "The market was ruthless. X positions were liquidated to cover your margin."

## Edge Cases

- **All positions liquidated**: If selling all holdings still doesn't cover the loan, the remaining loan balance stays. Player's total value is negative (cash=0, holdings=0, loan>0). They're effectively bankrupt for the season.
- **Stock becomes untradeable**: If a held stock is removed from the season's allowed list, it still counts toward portfolio value and can still be force-liquidated.
- **Season ends with open margin**: On season end, all margin loans are settled. Final portfolio value = cash + holdings_value - margin_loan_balance.

## Not Eligible for Margin

- Stocks priced under $3.00 (penny stocks) — cannot be purchased on margin
- Any stock the season creator excludes via allowed_stocks filtering

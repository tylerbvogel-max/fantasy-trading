"""
Education seed script: Creates topics, facts, and quiz questions.
Run: python -m app.seed_education
"""
import asyncio
from app.database import engine, async_session, Base
from app.models.education import EducationTopic, EducationFact, QuizQuestion
from sqlalchemy import select


# Each topic: (id, name, description, icon, order)
TOPICS = [
    ("stock-basics", "Stock Market Basics", "Learn what stocks are, how exchanges work, and key market concepts.", "trending-up-outline", 1),
    ("trading-101", "Trading 101", "Understand order types, bid-ask spreads, and how trades execute.", "swap-horizontal-outline", 2),
    ("portfolio-mgmt", "Portfolio Management", "Diversification, asset allocation, and portfolio strategy.", "briefcase-outline", 3),
    ("risk-reward", "Risk & Reward", "Volatility, risk tolerance, and the relationship between risk and return.", "shield-outline", 4),
    ("financial-stmts", "Financial Statements", "Income statements, balance sheets, and cash flow basics.", "document-text-outline", 5),
    ("valuation", "Valuation Metrics", "P/E ratio, market cap, EPS, and how to value a company.", "calculator-outline", 6),
    ("etfs-funds", "ETFs & Funds", "Index funds, ETFs, mutual funds, and passive investing.", "layers-outline", 7),
    ("market-psych", "Market Psychology", "Fear, greed, herd behavior, and behavioral finance.", "brain-outline", 8),
    ("econ-indicators", "Economic Indicators", "GDP, inflation, interest rates, and their impact on markets.", "stats-chart-outline", 9),
]

# Each fact: (id, topic_id, title, explanation, order, question_text, A, B, C, D, correct)
FACTS = [
    # ── Stock Market Basics ──
    ("sb-1", "stock-basics", "What Is a Stock?",
     "A stock represents a share of ownership in a company. When you buy a stock, you become a partial owner (shareholder) of that company. Companies sell stock to raise money to grow their business.",
     1, "What does owning a stock represent?",
     "A loan to the company", "Partial ownership of the company", "A guarantee of profit", "A bond from the company", "B"),

    ("sb-2", "stock-basics", "Stock Exchanges",
     "Stocks are bought and sold on exchanges like the New York Stock Exchange (NYSE) and NASDAQ. Think of an exchange like a marketplace where buyers and sellers meet. The exchange ensures trades are fair and orderly.",
     2, "What is the role of a stock exchange?",
     "To set stock prices by law", "To guarantee investors make money", "To provide a marketplace for buying and selling stocks", "To create new companies", "C"),

    ("sb-3", "stock-basics", "Ticker Symbols",
     "Every publicly traded stock has a unique ticker symbol — a short abbreviation used to identify it. For example, Apple is AAPL, Microsoft is MSFT, and Tesla is TSLA. These symbols make it easy to look up and trade stocks.",
     3, "What is a ticker symbol?",
     "The stock's price", "A unique abbreviation identifying a stock", "The company's stock rating", "A tax identification number", "B"),

    ("sb-4", "stock-basics", "Bull vs Bear Markets",
     "A bull market means prices are rising and investors are optimistic. A bear market means prices are falling and investors are pessimistic. The terms come from how each animal attacks — bulls thrust up, bears swipe down.",
     4, "What characterizes a bull market?",
     "Falling stock prices", "Rising stock prices and optimism", "No trading activity", "Only tech stocks go up", "B"),

    ("sb-5", "stock-basics", "Market Capitalization",
     "Market cap is the total value of a company's outstanding shares. It's calculated by multiplying the stock price by the total number of shares. A company with 1 million shares at $100 each has a market cap of $100 million.",
     5, "How is market capitalization calculated?",
     "Revenue minus expenses", "Total assets minus liabilities", "Stock price times total shares outstanding", "Annual profit times 10", "C"),

    ("sb-6", "stock-basics", "Dividends",
     "Some companies share their profits with shareholders by paying dividends — regular cash payments per share. Not all companies pay dividends; many growth companies reinvest profits instead. Dividends provide income even when the stock price doesn't rise.",
     6, "What is a dividend?",
     "A fee charged by brokers", "A cash payment from a company to its shareholders", "A type of stock split", "The difference between buy and sell price", "B"),

    ("sb-7", "stock-basics", "IPO — Initial Public Offering",
     "An IPO is when a private company first sells shares to the public. Before an IPO, only private investors can own shares. Going public raises capital and gives early investors a chance to sell their shares on the open market.",
     7, "What happens during an IPO?",
     "A company goes bankrupt", "A private company sells shares to the public for the first time", "Existing shares are split in half", "The government buys company stock", "B"),

    ("sb-8", "stock-basics", "Market Hours",
     "US stock markets are open Monday through Friday, 9:30 AM to 4:00 PM Eastern Time. There's no trading on weekends or major holidays. Some brokers offer pre-market (4-9:30 AM) and after-hours (4-8 PM) trading with limited volume.",
     8, "When are US stock markets open for regular trading?",
     "24 hours a day, 7 days a week", "Monday-Friday, 9:30 AM - 4:00 PM ET", "Monday-Saturday, 8 AM - 6 PM ET", "Only during business days, 10 AM - 3 PM ET", "B"),

    ("sb-9", "stock-basics", "Indexes",
     "A stock index tracks the performance of a group of stocks. The S&P 500 tracks 500 large US companies. The Dow Jones tracks 30 major companies. The NASDAQ Composite focuses on tech-heavy stocks. Indexes help measure overall market performance.",
     9, "What does the S&P 500 track?",
     "The 500 cheapest stocks", "500 large US companies", "All stocks on the NYSE", "Only technology companies", "B"),

    ("sb-10", "stock-basics", "Why Prices Move",
     "Stock prices are driven by supply and demand. If more people want to buy a stock than sell it, the price goes up. If more people want to sell, the price drops. Earnings reports, news, and economic data all influence demand.",
     10, "What primarily drives stock price changes?",
     "Government regulations only", "Supply and demand", "The company's CEO's salary", "The number of employees", "B"),

    # ── Trading 101 ──
    ("t-1", "trading-101", "Market Orders",
     "A market order buys or sells immediately at the best available price. It guarantees execution but not the exact price. Market orders are the simplest and most common type of trade order.",
     1, "What does a market order guarantee?",
     "The exact price you want", "Immediate execution at the best available price", "No fees on the trade", "A profit on the trade", "B"),

    ("t-2", "trading-101", "Limit Orders",
     "A limit order lets you set the maximum price you'll pay (for buying) or the minimum you'll accept (for selling). The trade only executes if the market reaches your price. This gives you price control but doesn't guarantee execution.",
     2, "What is the key advantage of a limit order?",
     "It always executes immediately", "You control the price at which the trade executes", "It guarantees a profit", "It has lower fees than market orders", "B"),

    ("t-3", "trading-101", "Bid-Ask Spread",
     "The bid price is what buyers are willing to pay; the ask price is what sellers want. The difference is the spread. A tight spread (small gap) means high liquidity. You buy at the ask and sell at the bid.",
     3, "What is the bid-ask spread?",
     "The daily price range of a stock", "The difference between the highest and lowest price ever", "The gap between what buyers will pay and sellers will accept", "The broker's commission fee", "C"),

    ("t-4", "trading-101", "Volume",
     "Volume is the number of shares traded during a given period. High volume means lots of activity and usually tighter spreads. Low volume can mean wider spreads and harder-to-execute trades. Volume spikes often accompany big news.",
     4, "What does high trading volume typically indicate?",
     "The stock price is too high", "Lots of trading activity and usually better liquidity", "The company is in trouble", "The market is about to close", "B"),

    ("t-5", "trading-101", "Going Long vs Short",
     "Going long means buying a stock expecting it to rise. Going short means borrowing shares and selling them, hoping to buy them back cheaper later. Most individual investors go long. Short selling is riskier because losses are theoretically unlimited.",
     5, "What does 'going long' on a stock mean?",
     "Holding the stock for over a year", "Buying the stock expecting it to increase in value", "Borrowing shares to sell them", "Investing in long-term bonds", "B"),

    ("t-6", "trading-101", "Stop-Loss Orders",
     "A stop-loss order automatically sells your stock if it drops to a certain price. It's a safety net to limit losses. For example, if you buy at $100 and set a stop-loss at $90, your shares sell automatically if the price hits $90.",
     6, "What is the purpose of a stop-loss order?",
     "To guarantee a profit on every trade", "To automatically sell a stock if it drops to a set price", "To buy more shares when the price drops", "To prevent others from trading the same stock", "B"),

    ("t-7", "trading-101", "Day Trading vs Investing",
     "Day trading means buying and selling stocks within the same day to profit from short-term price swings. Investing means holding stocks for months or years for long-term growth. Day trading requires more time, skill, and involves higher risk.",
     7, "What is the main difference between day trading and investing?",
     "Day traders only use limit orders", "Day trading involves same-day trades; investing is long-term holding", "Investing has no risk", "Day trading is only for professionals", "B"),

    ("t-8", "trading-101", "Commission-Free Trading",
     "Many modern brokerages offer commission-free stock trading, meaning you don't pay a fee per trade. They make money through other means like payment for order flow, interest on cash balances, and premium subscriptions.",
     8, "How do commission-free brokerages make money?",
     "They charge hidden fees on every trade", "Through payment for order flow, interest, and premium services", "They don't make any money", "By taking a percentage of your profits", "B"),

    ("t-9", "trading-101", "After-Hours Trading",
     "After-hours trading happens outside regular market hours (4 PM - 8 PM ET). Volume is lower, spreads are wider, and prices can be more volatile. Not all stocks are available for after-hours trading.",
     9, "What is a characteristic of after-hours trading?",
     "Higher volume than regular hours", "Lower volume and wider bid-ask spreads", "It's only available to institutional investors", "Prices are fixed until the next market open", "B"),

    ("t-10", "trading-101", "Paper Trading",
     "Paper trading is practicing trades with fake money in a simulated environment — just like this app! It lets you learn strategies and make mistakes without risking real money. It's the best way to build skills before trading with real cash.",
     10, "What is paper trading?",
     "Trading physical stock certificates", "Practicing with simulated money to learn without risk", "A special type of options trading", "Trading only penny stocks", "B"),

    # ── Portfolio Management ──
    ("pm-1", "portfolio-mgmt", "Diversification",
     "Diversification means spreading your money across different investments to reduce risk. If one stock drops, others may hold steady or rise. The saying 'don't put all your eggs in one basket' perfectly describes diversification.",
     1, "What is the main purpose of diversification?",
     "To maximize returns on a single stock", "To reduce risk by spreading investments across different assets", "To avoid paying taxes", "To focus only on one sector", "B"),

    ("pm-2", "portfolio-mgmt", "Asset Allocation",
     "Asset allocation is how you divide your portfolio between stocks, bonds, cash, and other investments. A common rule of thumb: subtract your age from 110 to get the percentage to put in stocks. The rest goes in safer investments like bonds.",
     2, "What is asset allocation?",
     "Buying only tech stocks", "Dividing investments across different asset types like stocks, bonds, and cash", "Putting all money in the safest investment", "Timing when to buy and sell", "B"),

    ("pm-3", "portfolio-mgmt", "Rebalancing",
     "Over time, some investments grow faster than others, shifting your allocation away from your target. Rebalancing means selling some winners and buying more of the underweighted assets to get back to your target mix.",
     3, "What is portfolio rebalancing?",
     "Selling all your stocks at once", "Adjusting your portfolio back to your target allocation", "Only buying new stocks", "Switching to a new broker", "B"),

    ("pm-4", "portfolio-mgmt", "Dollar-Cost Averaging",
     "Dollar-cost averaging (DCA) means investing a fixed amount at regular intervals, regardless of market conditions. When prices are low, you buy more shares; when high, fewer shares. This smooths out the impact of market volatility over time.",
     4, "How does dollar-cost averaging work?",
     "You invest a lump sum when the market dips", "You invest a fixed amount at regular intervals regardless of price", "You only buy stocks below their average price", "You sell stocks that cost more than average", "B"),

    ("pm-5", "portfolio-mgmt", "Portfolio Weight",
     "Portfolio weight is the percentage each holding represents of your total portfolio value. If your portfolio is worth $10,000 and you own $2,000 of Apple stock, Apple's weight is 20%. Monitoring weights helps ensure proper diversification.",
     5, "If your $10,000 portfolio has $3,000 in Tesla, what is Tesla's portfolio weight?",
     "10%", "20%", "30%", "50%", "C"),

    ("pm-6", "portfolio-mgmt", "Sector Diversification",
     "Investing across different sectors (technology, healthcare, energy, finance, etc.) reduces sector-specific risk. If the tech sector crashes, your healthcare and energy holdings may offset the losses.",
     6, "Why is sector diversification important?",
     "To guarantee profits in every sector", "To reduce the impact of a downturn in any single sector", "Because the government requires it", "To make your portfolio look more impressive", "B"),

    ("pm-7", "portfolio-mgmt", "Cash Position",
     "Your cash position is the uninvested cash in your portfolio. Having some cash gives you flexibility to buy opportunities when they arise. However, too much cash means missing out on potential market gains (opportunity cost).",
     7, "What is one benefit of maintaining a cash position?",
     "Cash always grows faster than stocks", "You have flexibility to buy when opportunities arise", "Cash positions are tax-free", "Brokers pay higher interest than banks", "B"),

    ("pm-8", "portfolio-mgmt", "Benchmark Comparison",
     "A benchmark is a standard you compare your portfolio against, like the S&P 500. If the S&P 500 is up 10% and your portfolio is up 8%, you underperformed the benchmark. This helps you evaluate if your stock picks add value.",
     8, "Why do investors compare their portfolio to a benchmark?",
     "To determine their tax bracket", "To evaluate whether their stock picks outperform the market", "Because the SEC requires it", "To decide when to retire", "B"),

    ("pm-9", "portfolio-mgmt", "Unrealized vs Realized Gains",
     "Unrealized gains are paper profits — your stock has gone up but you haven't sold yet. Realized gains happen when you sell. Only realized gains are taxable. A gain isn't locked in until you sell, and prices can reverse before you do.",
     9, "What is an unrealized gain?",
     "A profit from a stock you've already sold", "A paper profit on a stock you still hold", "Interest earned on cash", "A dividend payment received", "B"),

    ("pm-10", "portfolio-mgmt", "Concentration Risk",
     "Concentration risk occurs when too much of your portfolio is in one stock, sector, or asset type. If that single investment drops sharply, your entire portfolio suffers. Financial advisors typically recommend no single stock be more than 5-10% of your portfolio.",
     10, "What is concentration risk?",
     "The risk of having too many different investments", "The risk of having too much of your portfolio in a single investment", "The risk of investing in concentrated juice companies", "The risk of not investing enough money", "B"),

    # ── Risk & Reward ──
    ("rr-1", "risk-reward", "Risk-Return Tradeoff",
     "Higher potential returns generally come with higher risk. Safe investments like savings accounts have low returns. Stocks can deliver higher returns but also bigger losses. Understanding this tradeoff is fundamental to investing.",
     1, "What is the risk-return tradeoff?",
     "Higher risk investments always lose money", "Higher potential returns generally require accepting higher risk", "Risk and return are unrelated", "Lower risk always means lower fees", "B"),

    ("rr-2", "risk-reward", "Volatility",
     "Volatility measures how much a stock's price swings up and down. A stock that moves 5% in a day is more volatile than one that moves 0.5%. High volatility means more risk but also more opportunity. Beta is a common measure of volatility relative to the market.",
     2, "What does high volatility in a stock indicate?",
     "The stock is very safe", "The stock price swings more dramatically", "The company is about to go bankrupt", "The stock pays high dividends", "B"),

    ("rr-3", "risk-reward", "Beta",
     "Beta measures a stock's volatility compared to the overall market (S&P 500 = beta of 1). A beta of 1.5 means the stock typically moves 50% more than the market. A beta of 0.5 means it moves 50% less. High-beta stocks are riskier but may offer higher returns.",
     3, "What does a stock with a beta of 2.0 mean?",
     "It moves twice as much as the market on average", "It's twice as expensive as the market average", "It has doubled in price this year", "It pays twice the average dividend", "A"),

    ("rr-4", "risk-reward", "Risk Tolerance",
     "Risk tolerance is how much investment loss you can handle emotionally and financially. Young investors with decades until retirement can typically take more risk. Someone close to retirement needs safer investments. Your risk tolerance should guide your asset allocation.",
     4, "Why can younger investors typically take on more risk?",
     "They have more money to invest", "They have more time to recover from market downturns", "Young people are luckier in the stock market", "Because they pay lower taxes", "B"),

    ("rr-5", "risk-reward", "Systematic vs Unsystematic Risk",
     "Systematic risk affects the entire market (recessions, interest rate changes, pandemics). You can't diversify it away. Unsystematic risk is specific to one company or sector (CEO scandal, product recall). Diversification helps reduce unsystematic risk.",
     5, "Which type of risk can be reduced through diversification?",
     "Systematic risk", "Unsystematic risk", "Both types equally", "Neither type", "B"),

    ("rr-6", "risk-reward", "Maximum Drawdown",
     "Maximum drawdown is the largest peak-to-trough decline in a portfolio's value. If your portfolio goes from $10,000 to $7,000, that's a 30% maximum drawdown. It measures the worst-case historical loss and helps set expectations for tough times.",
     6, "A portfolio drops from $20,000 to $14,000. What is the maximum drawdown?",
     "14%", "20%", "30%", "70%", "C"),

    ("rr-7", "risk-reward", "The Power of Compounding",
     "Compounding means earning returns on your returns. If you invest $1,000 at 10% annual return, after one year you have $1,100. The next year, 10% of $1,100 is $110 — more than the first year. Over decades, compounding creates exponential growth.",
     7, "What makes compounding powerful over long periods?",
     "Returns grow linearly over time", "You earn returns on your accumulated returns, creating exponential growth", "The government matches your gains", "Stock prices always go up over time", "B"),

    ("rr-8", "risk-reward", "Loss Aversion",
     "Studies show people feel the pain of a loss about twice as strongly as the pleasure of an equal gain. This 'loss aversion' can lead to poor decisions like holding losers too long (hoping they recover) or selling winners too early (locking in gains).",
     8, "What is loss aversion?",
     "Preferring to avoid losses more strongly than acquiring equivalent gains", "Being afraid to invest any money at all", "Only investing in risk-free assets", "A strategy to minimize taxes", "A"),

    ("rr-9", "risk-reward", "Sharpe Ratio",
     "The Sharpe ratio measures risk-adjusted returns — how much extra return you get per unit of risk taken. A higher Sharpe ratio means better returns for the risk level. It helps compare investments with different risk profiles.",
     9, "What does a high Sharpe ratio indicate?",
     "High risk with low returns", "Good returns relative to the amount of risk taken", "The stock is overvalued", "Low trading volume", "B"),

    ("rr-10", "risk-reward", "Black Swan Events",
     "Black swan events are rare, unpredictable occurrences with massive market impact — like the 2008 financial crisis or COVID-19 crash. They can't be predicted by normal models. Having diversification and not using excessive leverage helps survive them.",
     10, "What is a black swan event in finance?",
     "A predictable market correction", "A rare, unpredictable event with massive market impact", "A type of insider trading", "A stock that doubles in one day", "B"),

    # ── Financial Statements ──
    ("fs-1", "financial-stmts", "The Three Financial Statements",
     "Companies report three main financial statements: the Income Statement (revenue and profit), Balance Sheet (assets, liabilities, equity), and Cash Flow Statement (cash in and out). Together, they tell the full financial story of a company.",
     1, "What are the three main financial statements?",
     "Income Statement, Balance Sheet, Cash Flow Statement", "Revenue Report, Tax Filing, Shareholder Report", "Quarterly Report, Annual Report, SEC Filing", "Profit Statement, Asset Sheet, Bank Statement", "A"),

    ("fs-2", "financial-stmts", "Revenue vs Profit",
     "Revenue is the total money a company brings in from sales. Profit is what's left after subtracting all expenses. A company can have high revenue but low or negative profit if costs are too high. Amazon famously had huge revenue but thin profits for years.",
     2, "What is the difference between revenue and profit?",
     "They mean the same thing", "Revenue is total sales; profit is revenue minus expenses", "Revenue is after taxes; profit is before", "Profit is always higher than revenue", "B"),

    ("fs-3", "financial-stmts", "Gross vs Net Income",
     "Gross income is revenue minus the cost of goods sold (direct production costs). Net income is the bottom line — what's left after ALL expenses (operating costs, taxes, interest). Net income is the true profit that goes to shareholders.",
     3, "What does net income represent?",
     "Revenue before any deductions", "Revenue minus only production costs", "Total profit after all expenses, taxes, and interest", "The company's cash in the bank", "C"),

    ("fs-4", "financial-stmts", "Balance Sheet Basics",
     "The balance sheet shows what a company owns (assets), owes (liabilities), and the difference (shareholders' equity). The fundamental equation: Assets = Liabilities + Equity. It's a snapshot of the company's financial position at a specific point in time.",
     4, "What is the fundamental balance sheet equation?",
     "Revenue = Expenses + Profit", "Assets = Liabilities + Shareholders' Equity", "Cash = Debt - Revenue", "Profit = Revenue - Taxes", "B"),

    ("fs-5", "financial-stmts", "Cash Flow Statement",
     "The cash flow statement tracks actual cash moving in and out. It has three sections: operating (day-to-day business), investing (buying/selling assets), and financing (loans, stock issuance). Positive operating cash flow is a sign of a healthy business.",
     5, "What does positive operating cash flow indicate?",
     "The company has no debt", "The company's day-to-day business generates cash", "The company is selling its assets", "The company just issued new stock", "B"),

    ("fs-6", "financial-stmts", "Earnings Per Share (EPS)",
     "EPS is a company's net income divided by the number of outstanding shares. It tells you how much profit the company earns per share. Higher EPS generally means more profitability. EPS is one of the most watched metrics on Wall Street.",
     6, "How is EPS calculated?",
     "Stock price divided by number of shares", "Net income divided by number of outstanding shares", "Revenue divided by total expenses", "Dividends divided by stock price", "B"),

    ("fs-7", "financial-stmts", "Quarterly Earnings Reports",
     "Public companies report financial results every quarter (every 3 months). These earnings reports are major events — stock prices can jump or drop 5-20% after an earnings report. Companies report actual results vs analyst expectations ('beat' or 'miss').",
     7, "Why are quarterly earnings reports important?",
     "They determine the company's stock ticker", "They show financial performance and can cause significant stock price moves", "They are required to pay dividends", "They set the company's stock price for the next quarter", "B"),

    ("fs-8", "financial-stmts", "Debt-to-Equity Ratio",
     "The debt-to-equity ratio compares how much a company has borrowed vs how much shareholders have invested. A ratio of 1 means equal debt and equity. Higher ratios mean more debt (more risk). Lower ratios mean the company relies more on its own money.",
     8, "What does a high debt-to-equity ratio suggest?",
     "The company has very little risk", "The company relies heavily on borrowed money", "The company is very profitable", "The company pays high dividends", "B"),

    ("fs-9", "financial-stmts", "Free Cash Flow",
     "Free cash flow is operating cash flow minus capital expenditures (spending on equipment, buildings, etc.). It represents cash the company can use for dividends, buybacks, acquisitions, or paying down debt. Investors love companies with strong free cash flow.",
     9, "What is free cash flow?",
     "Revenue minus all expenses", "Operating cash flow minus capital expenditures", "Cash from selling stock", "Total cash in the bank", "B"),

    ("fs-10", "financial-stmts", "10-K vs 10-Q",
     "The 10-K is a company's comprehensive annual report filed with the SEC. The 10-Q is the quarterly version with less detail. Both are public documents that any investor can read. They contain much more detail than press releases or earnings calls.",
     10, "What is a 10-K filing?",
     "A daily trading report", "A comprehensive annual financial report filed with the SEC", "A report on the top 10,000 stocks", "A tax filing for investors", "B"),

    # ── Valuation Metrics ──
    ("vm-1", "valuation", "Price-to-Earnings (P/E) Ratio",
     "The P/E ratio is stock price divided by earnings per share. It tells you how much investors pay per dollar of earnings. A P/E of 20 means investors pay $20 for every $1 of earnings. Lower P/E may signal a deal; higher may signal growth expectations.",
     1, "What does a P/E ratio of 25 mean?",
     "The stock price is $25", "Investors pay $25 for every $1 of earnings", "The company earns 25% profit", "The stock has risen 25% this year", "B"),

    ("vm-2", "valuation", "Forward vs Trailing P/E",
     "Trailing P/E uses actual earnings from the last 12 months. Forward P/E uses estimated future earnings. Forward P/E is lower if analysts expect earnings to grow. Comparing both helps understand if growth expectations are built into the price.",
     2, "What is the difference between trailing and forward P/E?",
     "Trailing looks backward at actual earnings; forward uses estimated future earnings", "They're the same but calculated differently", "Trailing P/E is always higher", "Forward P/E uses revenue instead of earnings", "A"),

    ("vm-3", "valuation", "Price-to-Book (P/B) Ratio",
     "P/B ratio compares a stock's market price to its book value (assets minus liabilities per share). A P/B under 1 means the stock trades below its asset value — potentially undervalued. Tech companies often have high P/B because their value is in intellectual property.",
     3, "What might a P/B ratio below 1.0 suggest?",
     "The company is overvalued", "The stock might be trading below its asset value", "The company has too much debt", "The stock is too expensive", "B"),

    ("vm-4", "valuation", "Market Cap Categories",
     "Stocks are classified by market cap: Large-cap ($10B+), Mid-cap ($2-10B), Small-cap ($300M-2B), and Micro-cap (under $300M). Large-caps are generally safer but grow slower. Small-caps are riskier but can grow faster.",
     4, "Which market cap category is generally considered the safest?",
     "Micro-cap", "Small-cap", "Mid-cap", "Large-cap", "D"),

    ("vm-5", "valuation", "Dividend Yield",
     "Dividend yield is the annual dividend per share divided by the stock price, expressed as a percentage. A stock paying $2/year at $100/share has a 2% yield. High yields provide income but might also signal a falling stock price inflating the ratio.",
     5, "A stock costs $50 and pays $2 in annual dividends. What is the dividend yield?",
     "2%", "4%", "25%", "50%", "B"),

    ("vm-6", "valuation", "PEG Ratio",
     "The PEG ratio is P/E divided by expected earnings growth rate. A PEG of 1 means the stock is fairly priced for its growth. Below 1 may be undervalued; above 1 may be overvalued. It helps compare fast-growing companies to slow-growing ones.",
     6, "A stock has a P/E of 30 and expected earnings growth of 30%. What is its PEG ratio?",
     "0.5", "1.0", "30", "60", "B"),

    ("vm-7", "valuation", "Enterprise Value",
     "Enterprise value (EV) is market cap + debt - cash. It represents the total cost to acquire a company. Unlike market cap, EV accounts for debt load. A company with $1B market cap, $500M debt, and $200M cash has an EV of $1.3B.",
     7, "Why is enterprise value sometimes preferred over market cap?",
     "It's always lower than market cap", "It accounts for a company's debt and cash position", "It's easier to calculate", "The SEC requires its use", "B"),

    ("vm-8", "valuation", "Earnings Growth Rate",
     "Earnings growth rate measures how fast a company's profits are increasing year over year. A company that earned $1/share last year and $1.20 this year has 20% earnings growth. Consistently high growth rates drive stock prices higher.",
     8, "A company's EPS grew from $2.00 to $2.50. What is the earnings growth rate?",
     "20%", "25%", "50%", "125%", "B"),

    ("vm-9", "valuation", "Overvalued vs Undervalued",
     "A stock is overvalued when its price is higher than its true worth based on fundamentals. It's undervalued when the price is lower. Value investors look for undervalued stocks. Growth investors may pay premium prices for fast-growing companies.",
     9, "What does it mean for a stock to be undervalued?",
     "Its price is zero", "Its market price is below its estimated true worth", "It has negative earnings", "It doesn't pay dividends", "B"),

    ("vm-10", "valuation", "Comparing Within Sectors",
     "P/E and other valuation metrics vary widely between sectors. Tech companies average P/E of 25-35. Utilities average 15-20. Always compare a stock's metrics to its sector peers, not the overall market. A P/E of 40 might be normal in tech but expensive in banking.",
     10, "Why should you compare valuation metrics within the same sector?",
     "Different sectors have different typical valuation ranges", "The SEC requires sector-specific comparisons", "All sectors have the same average P/E", "It doesn't matter — P/E is universal", "A"),

    # ── ETFs & Funds ──
    ("ef-1", "etfs-funds", "What Is an ETF?",
     "An ETF (Exchange-Traded Fund) is a basket of stocks that trades like a single stock on an exchange. Instead of buying 500 individual stocks, you can buy one S&P 500 ETF (like SPY) and own a piece of all 500. ETFs make diversification easy and affordable.",
     1, "What is an ETF?",
     "A type of savings account", "A basket of stocks that trades like a single stock", "A government bond", "A type of cryptocurrency", "B"),

    ("ef-2", "etfs-funds", "Index Funds",
     "Index funds track a specific market index like the S&P 500. They don't try to beat the market — they aim to match it. They have very low fees because there's no active management. Studies show most active managers fail to beat index funds over time.",
     2, "What is the goal of an index fund?",
     "To beat the market every year", "To match the performance of a specific market index", "To invest only in small companies", "To generate maximum dividends", "B"),

    ("ef-3", "etfs-funds", "Expense Ratios",
     "The expense ratio is the annual fee a fund charges, expressed as a percentage of your investment. An expense ratio of 0.03% means you pay $3 per year on a $10,000 investment. Index ETFs have the lowest expense ratios. Actively managed funds charge more (0.5-2%).",
     3, "What is a typical expense ratio for an index ETF?",
     "5-10%", "1-2%", "0.5-1%", "0.03-0.20%", "D"),

    ("ef-4", "etfs-funds", "ETFs vs Mutual Funds",
     "ETFs trade throughout the day like stocks at fluctuating prices. Mutual funds only trade once per day at the closing price. ETFs generally have lower fees and more tax efficiency. Mutual funds may have minimum investment requirements; ETFs don't.",
     4, "How do ETFs differ from mutual funds in trading?",
     "ETFs can only be bought once a day", "ETFs trade throughout the day; mutual funds trade once at market close", "Mutual funds trade more frequently", "There's no difference", "B"),

    ("ef-5", "etfs-funds", "Sector ETFs",
     "Sector ETFs focus on a specific industry like technology (XLK), healthcare (XLV), or energy (XLE). They let you make targeted bets on sectors you believe will outperform without picking individual stocks.",
     5, "What is a sector ETF?",
     "An ETF that holds only one stock", "An ETF focused on a specific industry sector", "A government-issued bond fund", "An ETF that tracks all sectors equally", "B"),

    ("ef-6", "etfs-funds", "Dividend ETFs",
     "Dividend ETFs hold stocks that pay above-average dividends. They provide regular income and tend to be less volatile than growth stocks. Popular examples include VYM (Vanguard High Dividend Yield) and SCHD (Schwab US Dividend Equity).",
     6, "What is the primary appeal of dividend ETFs?",
     "They guarantee high returns", "They provide regular income from dividend-paying stocks", "They never lose value", "They are only available to professional investors", "B"),

    ("ef-7", "etfs-funds", "Bond ETFs",
     "Bond ETFs hold portfolios of bonds (government or corporate debt). They're generally less risky than stock ETFs and provide steady income through interest payments. When stocks crash, bond ETFs often hold steady or even rise, providing portfolio stability.",
     7, "Why might an investor add bond ETFs to their portfolio?",
     "Bonds always outperform stocks", "For stability and income, especially during stock market downturns", "Bond ETFs have no fees", "The government requires a minimum bond allocation", "B"),

    ("ef-8", "etfs-funds", "Thematic ETFs",
     "Thematic ETFs invest around specific trends like clean energy, artificial intelligence, space exploration, or cannabis. They're more speculative than broad market ETFs but let you invest in megatrends you believe in. ARKK (Innovation) is a famous example.",
     8, "What are thematic ETFs designed to do?",
     "Track the overall market", "Invest in specific trends or themes like AI or clean energy", "Only hold government bonds", "Minimize all risk", "B"),

    ("ef-9", "etfs-funds", "Passive vs Active Investing",
     "Passive investing means buying index funds and holding long-term with minimal trading. Active investing means frequently buying and selling to try to beat the market. Research shows passive investing outperforms most active strategies over time, with lower fees.",
     9, "What does research show about passive vs active investing?",
     "Active investing always wins", "Passive investing tends to outperform most active strategies over time", "They perform exactly the same", "Active investing has lower fees", "B"),

    ("ef-10", "etfs-funds", "SPY, QQQ, and DIA",
     "SPY tracks the S&P 500 (500 large US companies). QQQ tracks the NASDAQ-100 (100 large tech-heavy companies). DIA tracks the Dow Jones Industrial Average (30 blue-chip companies). These are the three most popular market-tracking ETFs.",
     10, "What index does QQQ track?",
     "S&P 500", "Dow Jones Industrial Average", "NASDAQ-100", "Russell 2000", "C"),

    # ── Market Psychology ──
    ("mp-1", "market-psych", "Fear and Greed",
     "Warren Buffett said: 'Be fearful when others are greedy, and greedy when others are fearful.' When everyone is buying excitedly, prices may be inflated. When everyone is selling in panic, there may be bargains. Successful investors often go against the crowd.",
     1, "According to Warren Buffett's advice, when should you look for buying opportunities?",
     "When everyone is buying and prices are rising fast", "When everyone is selling in fear", "When the market is completely flat", "Only during IPOs", "B"),

    ("mp-2", "market-psych", "Herd Behavior",
     "Herd behavior is when investors follow the crowd instead of thinking independently. It causes bubbles (everyone buying) and crashes (everyone selling). Social media amplifies herd behavior. The best investors form their own views based on research.",
     2, "What is herd behavior in investing?",
     "A strategy used by professional traders", "Following the crowd instead of making independent decisions", "Only investing in agricultural stocks", "Diversifying across all sectors", "B"),

    ("mp-3", "market-psych", "FOMO — Fear of Missing Out",
     "FOMO drives investors to buy stocks that are rapidly rising, afraid they'll miss the gains. This often leads to buying at the top. By the time FOMO kicks in, much of the upside may already be priced in. Discipline and sticking to a plan beats FOMO.",
     3, "Why can FOMO be dangerous for investors?",
     "It causes them to sell too early", "It often leads to buying near the top after big price increases", "It makes them too cautious", "It prevents them from diversifying", "B"),

    ("mp-4", "market-psych", "Confirmation Bias",
     "Confirmation bias is seeking out information that supports what you already believe while ignoring contradicting evidence. If you love a stock, you might only read positive articles about it. Fight this by actively seeking out bear cases for your investments.",
     4, "What is confirmation bias in investing?",
     "Confirming your trades were executed", "Seeking information that supports your existing beliefs while ignoring contrary evidence", "Verifying stock prices are accurate", "Double-checking your broker's fees", "B"),

    ("mp-5", "market-psych", "Sunk Cost Fallacy",
     "The sunk cost fallacy is refusing to sell a losing stock because you've already lost money on it. 'I can't sell now, I'm down 40%!' But past losses shouldn't affect future decisions. The only question is: would you buy this stock today at this price?",
     5, "What question should you ask to overcome the sunk cost fallacy?",
     "How much have I already lost on this stock?", "Would I buy this stock today at its current price?", "When did I originally buy this stock?", "How much did my friends invest?", "B"),

    ("mp-6", "market-psych", "Market Bubbles",
     "A bubble occurs when asset prices far exceed their fundamental value, driven by speculation and hype. Examples: dot-com bubble (2000), housing bubble (2008). Bubbles always pop eventually. Signs include: euphoria, 'this time is different' narratives, and everyone talking about getting rich.",
     6, "What is a common sign of a market bubble?",
     "Stock prices steadily matching earnings growth", "Widespread euphoria and 'this time is different' thinking", "Low trading volume", "Investors being cautious", "B"),

    ("mp-7", "market-psych", "Panic Selling",
     "Panic selling is dumping investments during a sharp market decline driven by fear, not logic. Historically, markets recover from crashes. Investors who panic sell often lock in losses and miss the recovery. Having a plan before a downturn helps avoid panic.",
     7, "Why is panic selling often a bad strategy?",
     "It triggers tax benefits", "It locks in losses and you often miss the recovery", "It's illegal during market hours", "Brokers charge extra fees for it", "B"),

    ("mp-8", "market-psych", "Anchoring Bias",
     "Anchoring is fixating on a specific price point (like your purchase price or a stock's all-time high) when making decisions. 'It was $150, now it's $100, so it must be cheap!' Not necessarily — the fundamentals may have changed. Judge stocks on current value, not past prices.",
     8, "What is anchoring bias?",
     "Fixing your portfolio to one stock", "Over-relying on a specific reference price when making investment decisions", "Buying stocks at their IPO price", "Setting stop-loss orders", "B"),

    ("mp-9", "market-psych", "Patience Pays",
     "The stock market has historically returned ~10% per year on average. But returns aren't linear — some years are up 30%, others down 20%. The key is staying invested through the ups and downs. Time in the market beats timing the market.",
     9, "What does 'time in the market beats timing the market' mean?",
     "You should trade as frequently as possible", "Staying invested long-term outperforms trying to predict market moves", "The best time to invest is at market open", "You should only invest during market hours", "B"),

    ("mp-10", "market-psych", "Emotional Discipline",
     "The best investors have emotional discipline. They follow their strategy regardless of market emotions. They don't chase hot stocks, panic sell, or overtrade. Having written investment rules and sticking to them — even when it's uncomfortable — separates successful investors from the rest.",
     10, "What is the key trait of successful investors?",
     "Having the most capital to invest", "Emotional discipline and sticking to a strategy", "Following social media stock tips", "Trading as frequently as possible", "B"),

    # ── Economic Indicators ──
    ("ei-1", "econ-indicators", "GDP — Gross Domestic Product",
     "GDP measures the total value of goods and services produced in a country. Rising GDP means economic growth; falling GDP signals contraction. Two consecutive quarters of declining GDP is technically a recession. GDP growth is good for stocks.",
     1, "What does GDP measure?",
     "The total national debt", "The total value of goods and services produced in a country", "The unemployment rate", "The stock market's total value", "B"),

    ("ei-2", "econ-indicators", "Inflation",
     "Inflation is the rate at which prices increase over time. Moderate inflation (2-3%) is normal and healthy. High inflation erodes purchasing power and hurts consumers. The Federal Reserve tries to keep inflation around 2% by adjusting interest rates.",
     2, "What is the Federal Reserve's target inflation rate?",
     "0%", "2%", "5%", "10%", "B"),

    ("ei-3", "econ-indicators", "Interest Rates",
     "The Federal Reserve sets the federal funds rate, which influences all interest rates. Lower rates make borrowing cheaper, encouraging spending and investment (good for stocks). Higher rates slow the economy and make bonds more attractive relative to stocks.",
     3, "How do lower interest rates typically affect the stock market?",
     "They cause stock prices to fall", "They're positive for stocks because borrowing is cheaper", "They have no effect on stocks", "They only affect bond prices", "B"),

    ("ei-4", "econ-indicators", "Unemployment Rate",
     "The unemployment rate measures the percentage of people looking for work but unable to find it. Low unemployment means a strong economy. Very low unemployment can lead to inflation as companies compete for workers by raising wages.",
     4, "What can very low unemployment lead to?",
     "Lower stock prices", "Inflation, as companies raise wages to compete for workers", "Higher unemployment later", "Lower interest rates", "B"),

    ("ei-5", "econ-indicators", "CPI — Consumer Price Index",
     "The CPI tracks the cost of a basket of everyday goods and services (food, housing, gas, etc.). It's the main measure of inflation. When CPI rises faster than expected, it can trigger interest rate hikes and hurt stock prices.",
     5, "What does the CPI track?",
     "Corporate profit margins", "The cost of a basket of everyday consumer goods and services", "Stock market performance", "Government spending", "B"),

    ("ei-6", "econ-indicators", "Jobs Report (Non-Farm Payrolls)",
     "The monthly jobs report shows how many jobs the economy added or lost. It's released the first Friday of each month and is one of the most market-moving economic reports. Strong job growth = healthy economy. Weak jobs = economic concern.",
     6, "When is the monthly jobs report typically released?",
     "The last day of each month", "The first Friday of each month", "Every Wednesday", "Quarterly", "B"),

    ("ei-7", "econ-indicators", "The Fed and Monetary Policy",
     "The Federal Reserve (the Fed) controls monetary policy — mainly by setting interest rates and buying/selling bonds. 'Dovish' Fed policy (low rates) helps stocks. 'Hawkish' policy (high rates) can hurt stocks. Fed announcements are major market events.",
     7, "What does 'hawkish' Fed policy typically mean?",
     "Lower interest rates and easy money", "Higher interest rates to cool the economy", "Increased government spending", "Deregulation of banks", "B"),

    ("ei-8", "econ-indicators", "Yield Curve",
     "The yield curve plots interest rates of bonds with different maturities. Normally, longer-term bonds have higher rates. An 'inverted' yield curve (short-term rates higher than long-term) has preceded every US recession in the last 50 years.",
     8, "What does an inverted yield curve historically signal?",
     "A strong economy ahead", "A potential recession", "Higher stock prices", "Lower inflation", "B"),

    ("ei-9", "econ-indicators", "Consumer Confidence",
     "The Consumer Confidence Index measures how optimistic people feel about the economy. High confidence = people spend more = good for corporate profits = good for stocks. A sudden drop in confidence can foreshadow economic slowdown.",
     9, "Why does consumer confidence matter for stocks?",
     "It doesn't affect stocks at all", "Confident consumers spend more, boosting corporate profits", "It directly sets stock prices", "It only affects bond markets", "B"),

    ("ei-10", "econ-indicators", "Leading vs Lagging Indicators",
     "Leading indicators predict future economic activity (stock market, building permits, consumer expectations). Lagging indicators confirm trends after they happen (unemployment rate, corporate profits, inflation). Smart investors watch leading indicators to stay ahead.",
     10, "Which is an example of a leading economic indicator?",
     "The unemployment rate", "Consumer expectations and building permits", "Corporate quarterly earnings", "Past inflation data", "B"),
]


async def seed_education():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # Check if topics already exist
        existing = await db.execute(select(EducationTopic).limit(1))
        if existing.scalar_one_or_none():
            print("Education data already seeded. Skipping.")
            return

        # Create topics
        for tid, name, desc, icon, order in TOPICS:
            db.add(EducationTopic(
                id=tid, name=name, description=desc,
                icon=icon, display_order=order,
            ))

        # Flush topics so FKs exist before inserting facts
        await db.flush()

        # Create facts + questions
        for fid, topic_id, title, explanation, order, q_text, a, b, c, d, correct in FACTS:
            db.add(EducationFact(
                id=fid, topic_id=topic_id, title=title,
                explanation=explanation, display_order=order,
            ))
            db.add(QuizQuestion(
                id=f"q-{fid}", fact_id=fid,
                question_text=q_text,
                option_a=a, option_b=b, option_c=c, option_d=d,
                correct_option=correct,
            ))

        await db.commit()

        print("=" * 60)
        print("EDUCATION SEED COMPLETE")
        print("=" * 60)
        print(f"Topics created: {len(TOPICS)}")
        print(f"Facts created: {len(FACTS)}")
        print(f"Quiz questions created: {len(FACTS)}")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed_education())

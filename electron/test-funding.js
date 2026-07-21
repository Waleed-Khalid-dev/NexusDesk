const ccxt = require('ccxt');
async function test() {
  const binance = new ccxt.binance({ options: { defaultType: 'future' } });
  const rates = await binance.fetchFundingRates();
  const first = Object.keys(rates)[0];
  console.log('Binance Funding Rate Structure:', rates[first]);
}
test();
